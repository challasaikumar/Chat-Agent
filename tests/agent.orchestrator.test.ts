import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app.ts";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import type { SearchProvider } from "../apps/api/src/search/search.interface.ts";
import {
  finalAnswerResponse,
  functionCallResponse,
  scriptedResponsesClient,
} from "./helpers/mock-responses.ts";
import { agentRuns, messageToolCalls, messages } from "../apps/api/src/db/schema.ts";
import { eq } from "drizzle-orm";
import { describeDb } from "./helpers/db.ts";

function mockSearch(): SearchProvider {
  return {
    name: "tavily",
    async search(input) {
      const retrievedAt = new Date().toISOString();
      return {
        query: input.query,
        provider: "tavily",
        requestId: "tvly-mock",
        responseTimeMs: 50,
        resultCount: 1,
        usage: { credits: 1 },
        results: [
          {
            title: "HubSpot Pricing",
            url: "https://www.hubspot.com/pricing",
            domain: "www.hubspot.com",
            content: "HubSpot Professional is $800/month for seats.",
            score: 0.9,
            publishedAt: "2026-11-01T00:00:00.000Z",
            retrievedAt,
            faviconUrl: null,
            contentHash: "hash-hubspot",
          },
        ],
      };
    },
  };
}

describeDb("agent orchestrator", () => {
  let testDb: TestDatabase;
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterEach(async () => {
    await app?.close();
    await testDb?.cleanup();
  });

  async function setup(options: {
    responses: ReturnType<typeof scriptedResponsesClient>;
    search?: SearchProvider;
    openaiKey?: string;
  }) {
    testDb = await createTestDatabase("local-dev-user");
    const env = loadEnvironment({
      NODE_ENV: "test",
      LOCAL_USER_ID: testDb.localUserId,
      OPENAI_API_KEY: options.openaiKey ?? "sk-test",
      OPENAI_MODEL: "test-model",
      TAVILY_API_KEY: "tvly-test",
      AGENT_MAX_TOOL_ITERATIONS: "5",
      AGENT_MAX_SEARCHES_PER_TURN: "3",
      AGENT_MEMORY_PROCESS_ENABLED: "false",
    });

    app = await buildApp({
      env,
      searchProvider: options.search ?? mockSearch(),
      responsesClient: options.responses,
      database: {
        db: testDb.db,
        databasePath: testDb.path,
        localUserId: testDb.localUserId,
      },
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/conversations",
      payload: { title: "Agent test" },
    });
    return created.json().data.id as string;
  }

  it("answers without web search", async () => {
    const conversationId = await setup({
      responses: scriptedResponsesClient([
        () => finalAnswerResponse("Hello — no search needed.", []),
      ]),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/turn",
      payload: {
        conversationId,
        message: "Say hello",
        timeZone: "Asia/Kolkata",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.answer).toContain("Hello");
    expect(body.execution.searchCallCount).toBe(0);
    expect(body.status).toBe("completed");

    const stored = await testDb.db.select().from(messages);
    expect(stored.some((m) => m.role === "user")).toBe(true);
    expect(stored.some((m) => m.role === "assistant")).toBe(true);
  });

  it("executes web_search then synthesizes with call_id continuity", async () => {
    const conversationId = await setup({
      responses: scriptedResponsesClient([
        () =>
          functionCallResponse("call_1", {
            query: "HubSpot CRM pricing",
            searchDepth: "basic",
            maxResults: 5,
          }),
        (input) => {
          const item = Array.isArray(input.input) ? input.input[0] : null;
          expect(item).toMatchObject({
            type: "function_call_output",
            call_id: "call_1",
          });
          expect(input.previousResponseId).toBeTruthy();
          return finalAnswerResponse(
            "HubSpot Professional is about $800/mo [ref:web_src_placeholder]",
            [],
          );
        },
      ]),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/turn",
      payload: {
        conversationId,
        message: "What is current HubSpot CRM pricing?",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.execution.searchCallCount).toBe(1);
    expect(response.json().data.execution.toolCallCount).toBe(1);

    const toolRows = await testDb.db.select().from(messageToolCalls);
    expect(toolRows).toHaveLength(1);
    expect(toolRows[0]?.status).toBe("completed");
    expect(toolRows[0]?.toolName).toBe("web_search");

    const runs = await testDb.db.select().from(agentRuns);
    expect(runs[0]?.status).toBe("completed");
    expect(runs[0]?.searchCallCount).toBe(1);
  });

  it("returns configuration error without OpenAI key", async () => {
    testDb = await createTestDatabase("local-dev-user");
    const env = loadEnvironment({
      NODE_ENV: "test",
      LOCAL_USER_ID: testDb.localUserId,
      OPENAI_API_KEY: "",
    });
    app = await buildApp({
      env,
      database: {
        db: testDb.db,
        databasePath: testDb.path,
        localUserId: testDb.localUserId,
      },
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/conversations",
      payload: {},
    });
    const conversationId = created.json().data.id as string;

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/turn",
      payload: { conversationId, message: "hi" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("AGENT_CONFIGURATION_ERROR");
  });

  it("rejects empty messages and missing conversations", async () => {
    const conversationId = await setup({
      responses: scriptedResponsesClient([
        () => finalAnswerResponse("unused", []),
      ]),
    });

    const empty = await app.inject({
      method: "POST",
      url: "/api/agent/turn",
      payload: { conversationId, message: "   " },
    });
    expect(empty.statusCode).toBe(400);

    const missing = await app.inject({
      method: "POST",
      url: "/api/agent/turn",
      payload: {
        conversationId: "00000000-0000-4000-8000-000000000099",
        message: "hello",
      },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("retrieves agent run metadata", async () => {
    const conversationId = await setup({
      responses: scriptedResponsesClient([
        () => finalAnswerResponse("Done", []),
      ]),
    });

    const turn = await app.inject({
      method: "POST",
      url: "/api/agent/turn",
      payload: { conversationId, message: "hi" },
    });
    const runId = turn.json().data.runId as string;

    const run = await app.inject({
      method: "GET",
      url: `/api/agent/runs/${runId}`,
    });
    expect(run.statusCode).toBe(200);
    expect(run.json().data.status).toBe("completed");
    expect(run.json().data.model).toBe("test-model");
  });

  it("keeps user messages when provider fails", async () => {
    const { agentProviderError } = await import(
      "../apps/api/src/agent/errors/agent.errors.ts"
    );

    const conversationId = await setup({
      responses: {
        async create() {
          throw agentProviderError("boom");
        },
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/turn",
      payload: { conversationId, message: "will fail" },
    });
    expect(response.statusCode).toBe(502);

    const userMessages = await testDb.db
      .select()
      .from(messages)
      .where(eq(messages.role, "user"));
    expect(userMessages.some((m) => m.content === "will fail")).toBe(true);

    const runs = await testDb.db.select().from(agentRuns);
    expect(runs.some((run) => run.status === "failed")).toBe(true);
  });
});
