import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import { ConversationService } from "../apps/api/src/services/conversation.service.ts";
import { ResearchRepository } from "../apps/api/src/repositories/research.repository.ts";
import { ContextBuilder } from "../apps/api/src/agent/context/context.builder.ts";
import { loadAgentConfig } from "../apps/api/src/agent/agent.config.ts";
import { CitationRegistry } from "../apps/api/src/agent/citations/citation.registry.ts";
import { DateIntentParser } from "../apps/api/src/agent/context/context.date-parser.ts";
import { describeDb } from "./helpers/db.ts";

/**
 * Deterministic fixtures for the three hiring-challenge scenarios.
 * Live prices are not asserted — architecture of retrieval + comparison context is.
 */
describeDb("challenge evaluation fixtures", () => {
  let testDb: TestDatabase;

  afterEach(async () => {
    await testDb?.cleanup();
  });

  it("scenario 1: CRM shortlist context is recoverable", async () => {
    testDb = await createTestDatabase();
    const conversations = new ConversationService(testDb.db);
    const research = new ResearchRepository(testDb.db);
    const conversation = await conversations.create(testDb.localUserId, "CRM shortlist");

    const monday = new Date("2026-11-09T09:00:00.000Z");
    const crmTools = [
      "HubSpot",
      "Salesforce",
      "Pipedrive",
      "Zoho CRM",
      "Close",
    ];

    await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "user",
      content: `On Monday we shortlisted 5 CRM tools for a 20-person sales team: ${crmTools.join(", ")}.`,
    });
    // Override timestamps for historical realism
    await testDb.sqlClient.unsafe(
      "UPDATE messages SET created_at = $1 WHERE conversation_id = $2",
      [monday.toISOString(), conversation.id],
    );

    await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "HubSpot Salesforce Pipedrive Zoho Close pricing 20 seats",
      title: "CRM pricing baseline",
      provider: "tavily",
      providerRequestId: "seed-1",
      searchParameters: { query: "CRM pricing" },
      responseTimeMs: 100,
      resultCount: 1,
      capturedAt: monday,
      sources: [
        {
          title: "HubSpot Pricing",
          url: "https://www.hubspot.com/pricing/crm",
          domain: "www.hubspot.com",
          content: "Professional plan historically $800/mo",
          score: 0.9,
          publishedAt: null,
          retrievedAt: monday.toISOString(),
          faviconUrl: null,
          contentHash: "crm-1",
        },
      ],
    });

    const env = loadEnvironment({ NODE_ENV: "test" });
    const builder = new ContextBuilder(
      testDb.db,
      env,
      loadAgentConfig(env),
    );
    const registry = new CitationRegistry();
    const userMessage = await conversations.addMessage(
      testDb.localUserId,
      conversation.id,
      {
        role: "user",
        content:
          "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing?",
      },
    );

    const built = await builder.build({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      userMessage: userMessage.content,
      timeZone: "Asia/Kolkata",
      registry,
    });

    for (const tool of crmTools) {
      expect(built.promptText).toContain(tool);
    }
    expect(built.researchSnapshotCount).toBeGreaterThanOrEqual(1);
    expect(registry.list().some((e) => e.sourceType === "historical_research")).toBe(
      true,
    );
  });

  it("scenario 2: November 3 conversation is date-addressable", async () => {
    testDb = await createTestDatabase();
    const conversations = new ConversationService(testDb.db);
    const conversation = await conversations.create(testDb.localUserId, "Nov 3");
    const msg = await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "user",
      content: "What is the cheapest managed Postgres for a side project?",
    });
    await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "assistant",
      content: "At the time, Neon free tier looked strongest for small projects.",
    });

    const nov3 = new Date("2026-11-03T08:00:00.000Z");
    await testDb.sqlClient.unsafe(
      "UPDATE messages SET created_at = $1 WHERE conversation_id = $2",
      [nov3.toISOString(), conversation.id],
    );

    const parser = new DateIntentParser();
    const intent = parser.parse("What did I ask you on 3 November?", {
      timeZone: "Asia/Kolkata",
      now: new Date("2026-11-13T10:00:00.000Z"),
    });
    expect(intent?.kind).toBe("absolute_day");
    if (intent?.kind === "absolute_day") {
      expect(intent.date).toBe("2026-11-03");
    }

    const env = loadEnvironment({ NODE_ENV: "test" });
    const builder = new ContextBuilder(
      testDb.db,
      env,
      loadAgentConfig(env),
    );
    const followUp = await conversations.addMessage(
      testDb.localUserId,
      conversation.id,
      {
        role: "user",
        content: "What did I ask you on 3 November? Is your answer still correct today?",
      },
    );

    const built = await builder.build({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      userMessageId: followUp.id,
      userMessage: followUp.content,
      timeZone: "Asia/Kolkata",
      registry: new CitationRegistry(),
      now: new Date("2026-11-13T10:00:00.000Z"),
    });

    expect(built.dateIntent?.kind).toBe("absolute_day");
    expect(built.promptText).toContain("cheapest managed Postgres");
    expect(built.historicalMessageCount).toBeGreaterThanOrEqual(1);
    void msg;
  });

  it("scenario 3: last Tuesday Postgres hosting baseline is recoverable", async () => {
    testDb = await createTestDatabase();
    const conversations = new ConversationService(testDb.db);
    const research = new ResearchRepository(testDb.db);
    const conversation = await conversations.create(
      testDb.localUserId,
      "Postgres hosting",
    );

    const lastTuesday = new Date("2026-11-10T07:30:00.000Z");
    await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "user",
      content: "Compare Neon, Supabase and Railway Postgres pricing.",
    });
    await testDb.sqlClient.unsafe(
      "UPDATE messages SET created_at = $1 WHERE conversation_id = $2",
      [lastTuesday.toISOString(), conversation.id],
    );

    await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "Neon Supabase Railway Postgres pricing",
      title: "Postgres hosting",
      provider: "tavily",
      providerRequestId: "seed-3",
      searchParameters: { query: "Postgres hosting" },
      responseTimeMs: 90,
      resultCount: 2,
      capturedAt: lastTuesday,
      sources: [
        {
          title: "Neon Pricing",
          url: "https://neon.tech/pricing",
          domain: "neon.tech",
          content: "Launch plan historical baseline",
          score: 0.91,
          publishedAt: null,
          retrievedAt: lastTuesday.toISOString(),
          faviconUrl: null,
          contentHash: "pg-1",
        },
        {
          title: "Supabase Pricing",
          url: "https://supabase.com/pricing",
          domain: "supabase.com",
          content: "Pro plan historical baseline",
          score: 0.88,
          publishedAt: null,
          retrievedAt: lastTuesday.toISOString(),
          faviconUrl: null,
          contentHash: "pg-2",
        },
      ],
    });

    const parser = new DateIntentParser();
    const intent = parser.parse(
      "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?",
      {
        timeZone: "Asia/Kolkata",
        now: new Date("2026-11-13T10:00:00.000Z"),
      },
    );
    expect(intent?.kind).toBe("absolute_day");
    if (intent?.kind === "absolute_day") {
      expect(intent.date).toBe("2026-11-10");
    }

    const env = loadEnvironment({ NODE_ENV: "test" });
    const followUp = await conversations.addMessage(
      testDb.localUserId,
      conversation.id,
      {
        role: "user",
        content:
          "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?",
      },
    );
    const built = await new ContextBuilder(
      testDb.db,
      env,
      loadAgentConfig(env),
    ).build({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      userMessageId: followUp.id,
      userMessage: followUp.content,
      timeZone: "Asia/Kolkata",
      registry: new CitationRegistry(),
      now: new Date("2026-11-13T10:00:00.000Z"),
    });

    expect(built.promptText).toContain("Neon");
    expect(built.promptText).toContain("Supabase");
    expect(built.researchSnapshotCount).toBeGreaterThanOrEqual(1);
  });
});
