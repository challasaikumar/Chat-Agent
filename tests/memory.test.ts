import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app.ts";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import type { MemoryExtractor } from "../apps/api/src/memory/memory-extractor.interface.ts";
import {
  MemoryConfigurationError,
  MemoryExtractionError,
} from "../apps/api/src/memory/memory-extractor.interface.ts";
import { MemoryService } from "../apps/api/src/memory/memory.service.ts";
import { ConversationService } from "../apps/api/src/services/conversation.service.ts";
import { describeDb } from "./helpers/db.ts";

describeDb("memory extraction and retrieval", () => {
  let testDb: TestDatabase;

  afterEach(async () => {
    await testDb?.cleanup();
  });

  async function setupServices(extractor: MemoryExtractor) {
    testDb = await createTestDatabase("local-dev-user");
    const env = loadEnvironment({
      NODE_ENV: "test",
      LOCAL_USER_ID: testDb.localUserId,
      OPENAI_API_KEY: "",
      OPENAI_MODEL: "test-model",
    });

    const conversations = new ConversationService(testDb.db);
    const memory = new MemoryService(testDb.db, env, extractor);
    return { conversations, memory, env };
  }

  it("generates versioned summaries, entities, and facts with provenance", async () => {
    const { conversations, memory } = await setupServices({
      async extract(request) {
        const ids = request.messages.map((message) => message.id);
        const sourceMessageId = ids[ids.length - 1]!;
        return {
          summary: `Summary covering through ${sourceMessageId}`,
          entities: [
            {
              entityType: "product",
              displayName: "Salesforce",
              aliases: ["SFDC"],
              supportingMessageIds: [sourceMessageId],
            },
          ],
          facts: [
            {
              category: "decision",
              fact: "User is evaluating Salesforce pricing",
              confidence: 0.9,
              sourceMessageId,
              evidenceExcerpt: "evaluating Salesforce pricing",
              entityDisplayName: "Salesforce",
              entityType: "product",
            },
          ],
          supportingMessageIds: ids,
        };
      },
    });

    const conversation = await conversations.create(testDb.localUserId, "Pricing");
    const first = await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "user",
      content: "I am evaluating Salesforce pricing",
    });

    const processed = await memory.processConversation(
      conversation.id,
      testDb.localUserId,
    );
    expect(processed.summaryVersion).toBe(1);
    expect(processed.entitiesUpserted).toBe(1);
    expect(processed.factsUpserted).toBe(1);

    const summary = await conversations.getLatestSummary(
      testDb.localUserId,
      conversation.id,
    );
    expect(summary?.version).toBe(1);
    expect(summary?.coveredThroughMessageId).toBe(first.id);

    const facts = await memory.facts.list({
      userId: testDb.localUserId,
      limit: 10,
      conversationId: conversation.id,
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.sourceMessageId).toBe(first.id);
    expect(facts[0]?.evidenceExcerpt).toContain("Salesforce");

    await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "assistant",
      content: "Noted. We can compare HubSpot next.",
    });

    const secondPass = await memory.processConversation(
      conversation.id,
      testDb.localUserId,
    );
    expect(secondPass.summaryVersion).toBe(2);

    const versions = await memory.summaries.listVersions(conversation.id);
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);

    // Duplicate fact handling — same fact text updates rather than duplicating.
    const entities = await memory.entities.search({ q: "salesforce", limit: 10 });
    expect(entities).toHaveLength(1);
  });

  it("preserves messages when extraction fails and when OpenAI is missing", async () => {
    const failing: MemoryExtractor = {
      async extract() {
        throw new MemoryExtractionError("boom");
      },
    };

    const { conversations, memory } = await setupServices(failing);
    const conversation = await conversations.create(testDb.localUserId);
    await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "user",
      content: "important original message",
    });

    await expect(
      memory.processConversation(conversation.id, testDb.localUserId),
    ).rejects.toMatchObject({ code: "MEMORY_EXTRACTION_FAILED" });

    const messages = await conversations.listMessages(testDb.localUserId, conversation.id, {
      limit: 10,
    });
    expect(messages.items).toHaveLength(1);
    expect(await memory.summaries.getLatest(conversation.id)).toBeUndefined();

    const unconfigured: MemoryExtractor = {
      async extract() {
        throw new MemoryConfigurationError();
      },
    };
    const again = new MemoryService(
      testDb.db,
      loadEnvironment({ NODE_ENV: "test", OPENAI_API_KEY: "" }),
      unconfigured,
    );

    await expect(
      again.processConversation(conversation.id, testDb.localUserId),
    ).rejects.toMatchObject({ code: "OPENAI_NOT_CONFIGURED" });
  });

  it("exposes process endpoint with mocked extractor via HTTP", async () => {
    testDb = await createTestDatabase("local-dev-user");
    const env = loadEnvironment({
      NODE_ENV: "test",
      LOCAL_USER_ID: testDb.localUserId,
      OPENAI_API_KEY: "",
    });

    const extractor: MemoryExtractor = {
      async extract(request) {
        const id = request.messages[0]!.id;
        return {
          summary: "HTTP summary",
          entities: [],
          facts: [
            {
              category: "preference",
              fact: "Prefers concise answers",
              confidence: 0.8,
              sourceMessageId: id,
              evidenceExcerpt: "Keep answers concise",
              entityDisplayName: null,
              entityType: null,
            },
          ],
          supportingMessageIds: [id],
        };
      },
    };

    const app = await buildApp({
      env,
      memoryExtractor: extractor,
      database: {
        db: testDb.db,
        databasePath: testDb.path,
        localUserId: testDb.localUserId,
      },
    });

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/conversations",
        payload: { title: "HTTP memory" },
      });
      const id = created.json().data.id as string;

      await app.inject({
        method: "POST",
        url: `/api/conversations/${id}/messages`,
        payload: { role: "user", content: "Keep answers concise" },
      });

      const processed = await app.inject({
        method: "POST",
        url: `/api/conversations/${id}/memory/process`,
      });
      expect(processed.statusCode).toBe(200);
      expect(processed.json().data.summary).toBe("HTTP summary");

      const summary = await app.inject({
        method: "GET",
        url: `/api/conversations/${id}/summary`,
      });
      expect(summary.json().data.summary.summary).toBe("HTTP summary");

      const facts = await app.inject({
        method: "GET",
        url: "/api/memory/facts",
      });
      expect(facts.json().data.items.length).toBe(1);
      expect(facts.json().data.items[0].sourceMessageId).toBeTruthy();
    } finally {
      await app.close();
    }
  });
});
