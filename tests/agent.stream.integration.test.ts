import { afterEach, describe, expect, it } from "vitest";
import type { AgentEvent } from "@minimi/shared";
import { buildApp } from "../apps/api/src/app.js";
import { AgentService } from "../apps/api/src/agent/agent.service.js";
import { createSseWriter } from "../apps/api/src/agent/streaming/sse.writer.js";
import type { ResponsesCreateInput } from "../apps/api/src/agent/openai/responses.client.js";
import type {
  StreamRoundHandlers,
  StreamRoundResult,
  StreamingResponsesClient,
} from "../apps/api/src/agent/openai/responses.stream.js";
import { loadEnvironment } from "../apps/api/src/config/env.js";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.js";
import type { SearchProvider } from "../apps/api/src/search/search.interface.js";
import type { SearchInput, SearchResponse } from "../apps/api/src/search/search.types.js";
import { contentHash, extractDomain } from "../apps/api/src/search/search.utils.js";
import { describeDb } from "./helpers/db.ts";

function mockSearchProvider(): SearchProvider {
  return {
    name: "tavily",
    async search(input: SearchInput): Promise<SearchResponse> {
      const url = "https://hubspot.com/pricing";
      const content = "HubSpot Professional plan costs $90 per month.";
      return {
        query: input.query,
        provider: "tavily",
        requestId: "mock-stream-search",
        results: [
          {
            title: "HubSpot Pricing",
            url,
            domain: extractDomain(url) ?? "hubspot.com",
            content,
            score: 0.9,
            publishedAt: new Date().toISOString(),
            retrievedAt: new Date().toISOString(),
            contentHash: contentHash({
              url,
              title: "HubSpot Pricing",
              content,
            }),
            faviconUrl: null,
          },
        ],
        responseTimeMs: 12,
        resultCount: 1,
        usage: { credits: 1 },
      };
    },
  };
}

function scriptedStreamingClient(
  rounds: Array<(input: ResponsesCreateInput) => StreamRoundResult>,
): StreamingResponsesClient {
  let index = 0;
  return {
    async streamRound(
      input: ResponsesCreateInput,
      handlers: StreamRoundHandlers = {},
    ): Promise<StreamRoundResult> {
      const factory = rounds[Math.min(index, rounds.length - 1)]!;
      index += 1;
      const result = factory(input);
      if (handlers.emitAnswerDeltas && result.answerText) {
        for (const part of result.answerText.match(/.{1,24}/g) ?? []) {
          handlers.onAnswerDelta?.(part);
        }
      }
      return result;
    },
  };
}

function completedResponse(id: string): StreamRoundResult["response"] {
  return {
    id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    error: null,
    incomplete_details: null,
    model: "gpt-test",
    output: [],
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    output_text: "",
  } as unknown as StreamRoundResult["response"];
}

function parseEvents(body: string): AgentEvent[] {
  const events: AgentEvent[] = [];
  for (const block of body.split("\n\n")) {
    const dataLine = block.split("\n").find((line) => line.startsWith("data:"));
    if (!dataLine) continue;
    try {
      events.push(JSON.parse(dataLine.slice(5).trim()) as AgentEvent);
    } catch {
      // ignore
    }
  }
  return events;
}

describeDb("agent turn stream SSE", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let testDb: TestDatabase;

  async function setup(streamingClient: StreamingResponsesClient) {
    testDb = await createTestDatabase("local-dev-user");
    const env = loadEnvironment({
      NODE_ENV: "test",
      LOCAL_USER_ID: testDb.localUserId,
      OPENAI_API_KEY: "sk-test",
      EVIDENCE_VERIFICATION_ENABLED: "false",
    });

    app = await buildApp({
      env,
      database: {
        db: testDb.db,
        databasePath: testDb.path,
        localUserId: testDb.localUserId,
      },
      searchProvider: mockSearchProvider(),
    });

    app.post("/api/agent/turn/stream-test", async (request, reply) => {
      const agent = new AgentService(app.db, app.env, {
        searchProvider: mockSearchProvider(),
        streamingClient,
        logger: app.log,
      });
      const writer = createSseWriter(request, reply);
      try {
        await agent.runTurnStream(
          request.body,
          { userId: app.localUserId, requestId: request.id },
          (event) => writer.send(event),
        );
      } finally {
        writer.close();
      }
    });
  }

  afterEach(async () => {
    await app?.close();
    await testDb?.cleanup();
  });

  it("streams typed events for a simple answer", async () => {
    await setup(
      scriptedStreamingClient([
        () => ({
          response: completedResponse("resp_1"),
          functionCalls: [],
          answerText: "Hello from Minimi.",
          streamedAnswer: "Hello from Minimi.",
        }),
      ]),
    );

    const created = await app.inject({
      method: "POST",
      url: "/api/conversations",
      payload: {},
    });
    const conversationId = created.json().data.id as string;

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/turn/stream-test",
      payload: {
        conversationId,
        message: "Say hello",
        timeZone: "Asia/Kolkata",
        clientRequestId: "11111111-1111-4111-8111-111111111111",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(String(response.headers["content-type"])).toContain(
      "text/event-stream",
    );

    const events = parseEvents(response.body);
    expect(events.some((e) => e.type === "run.started")).toBe(true);
    expect(events.some((e) => e.type === "message.delta")).toBe(true);
    expect(events.some((e) => e.type === "run.completed")).toBe(true);
    const completed = events.find((e) => e.type === "run.completed");
    if (completed?.type === "run.completed") {
      expect(completed.answer).toContain("Hello");
      expect(completed.status).toBe("completed");
    }
  });

  it("streams tool lifecycle then answer for research turns", async () => {
    await setup(
      scriptedStreamingClient([
        () => ({
          response: completedResponse("resp_tool"),
          functionCalls: [
            {
              callId: "call_1",
              name: "web_search",
              arguments: JSON.stringify({
                query: "HubSpot CRM pricing",
                searchDepth: "basic",
                maxResults: 3,
              }),
            },
          ],
          answerText: "",
          streamedAnswer: "",
        }),
        () => ({
          response: completedResponse("resp_final"),
          functionCalls: [],
          answerText:
            "HubSpot Professional is about $90/month [ref:web_src_x].",
          streamedAnswer:
            "HubSpot Professional is about $90/month [ref:web_src_x].",
        }),
      ]),
    );

    const created = await app.inject({
      method: "POST",
      url: "/api/conversations",
      payload: {},
    });
    const conversationId = created.json().data.id as string;

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/turn/stream-test",
      payload: {
        conversationId,
        message: "What is current HubSpot CRM pricing?",
        clientRequestId: "22222222-2222-4222-8222-222222222222",
      },
    });

    expect(response.statusCode).toBe(200);
    const events = parseEvents(response.body);
    expect(events.some((e) => e.type === "tool.started")).toBe(true);
    expect(events.some((e) => e.type === "tool.completed")).toBe(true);
    expect(events.some((e) => e.type === "citation.available")).toBe(true);
    expect(events.some((e) => e.type === "run.completed")).toBe(true);
    const completed = events.find((e) => e.type === "run.completed");
    if (completed?.type === "run.completed") {
      expect(completed.answer.toLowerCase()).toContain("hubspot");
    }
  });
});
