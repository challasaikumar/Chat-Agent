import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import { ConversationService } from "../apps/api/src/services/conversation.service.ts";
import { ResearchRepository } from "../apps/api/src/repositories/research.repository.ts";
import { TemporalService } from "../apps/api/src/temporal/temporal.service.ts";
import { TemporalIntentParser } from "../apps/api/src/temporal/intent/temporal-intent.parser.ts";
import { evaluateTemporalComparison } from "../apps/api/src/temporal/evaluation/temporal.evaluator.ts";
import { DateIntentParser } from "../apps/api/src/agent/context/context.date-parser.ts";
import { describeDb } from "./helpers/db.ts";

/**
 * Deterministic hiring-challenge scenarios with seeded fixtures + mocked prices.
 */
describeDb("Phase 05 challenge evaluation", () => {
  let testDb: TestDatabase;

  afterEach(async () => {
    await testDb?.cleanup();
  });

  it("scenario A: CRM pricing comparison across five tools", async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({ NODE_ENV: "test" });
    const conversations = new ConversationService(testDb.db);
    const research = new ResearchRepository(testDb.db);
    const temporal = new TemporalService(testDb.db, env);
    const conversation = await conversations.create(testDb.localUserId, "CRM");
    const monday = new Date("2026-11-09T09:00:00.000Z");
    const tools = ["HubSpot", "Salesforce", "Pipedrive", "Zoho CRM", "Close"];

    await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "user",
      content: `On Monday we shortlisted 5 CRM tools for a 20-person sales team: ${tools.join(", ")}.`,
    });
    await testDb.sqlClient.unsafe(
      "UPDATE messages SET created_at = $1 WHERE conversation_id = $2",
      [monday.toISOString(), conversation.id],
    );

    await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "HubSpot Salesforce Pipedrive Zoho Close pricing 20 seats",
      title: "CRM baseline",
      provider: "tavily",
      providerRequestId: null,
      searchParameters: { query: "CRM" },
      responseTimeMs: 20,
      resultCount: 5,
      capturedAt: monday,
      sources: tools.map((tool, index) => ({
        title: `${tool} Pricing`,
        url: `https://example.com/${tool.toLowerCase().replace(/\s+/g, "-")}`,
        domain: "example.com",
        content: `${tool} Pro plan costs $${20 + index * 5} per month`,
        score: 0.9,
        publishedAt: null,
        retrievedAt: monday.toISOString(),
        faviconUrl: null,
        contentHash: `crm-h-${index}`,
      })),
    });

    const current = await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "HubSpot Salesforce Pipedrive Zoho Close pricing update",
      title: "CRM current",
      provider: "tavily",
      providerRequestId: null,
      searchParameters: { query: "CRM" },
      responseTimeMs: 20,
      resultCount: 5,
      capturedAt: new Date("2026-11-13T10:00:00.000Z"),
      sources: tools.map((tool, index) => ({
        title: `${tool} Pricing Now`,
        url: `https://example.com/${tool.toLowerCase().replace(/\s+/g, "-")}`,
        domain: "example.com",
        content:
          index === 0
            ? `${tool} Pro plan costs $30 per month`
            : `${tool} Pro plan costs $${20 + index * 5} per month`,
        score: 0.9,
        publishedAt: null,
        retrievedAt: "2026-11-13T10:00:00.000Z",
        faviconUrl: null,
        contentHash: `crm-c-${index}`,
      })),
    });

    const prepare = await temporal.prepareTurn({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      message:
        "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?",
      timeZone: "Asia/Kolkata",
      now: new Date("2026-11-13T12:00:00.000Z"),
    });

    expect(prepare.intent.isComparison).toBe(true);
    expect(prepare.intent.startDate).toBe("2026-11-09");
    expect(prepare.historicalSnapshotIds.length).toBeGreaterThan(0);

    const view = await temporal.finalizeComparison({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      prepare,
      currentSnapshotIds: [current.snapshot.id],
    });

    expect(view).toBeTruthy();
    const evaluation = evaluateTemporalComparison(view!, {
      mustIncludeEntities: ["HubSpot"],
      requiredChangeTypes: ["PRICE_INCREASED"],
      allowedVerdicts: ["CONFIRMED_CHANGE", "CONFLICTING_INFORMATION", "POSSIBLE_CHANGE"],
      requireHistoricalValues: true,
    });
    expect(evaluation.failures).toEqual([]);
    expect(evaluation.passed).toBe(true);
  });

  it("scenario B: November 3 question retrieval + verification framing", async () => {
    testDb = await createTestDatabase();
    const conversations = new ConversationService(testDb.db);
    const conversation = await conversations.create(testDb.localUserId, "Nov3");
    await conversations.addMessage(testDb.localUserId, conversation.id, {
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

    const dateIntent = new DateIntentParser().parse(
      "What did I ask you on 3 November? Is your answer still correct today?",
      { timeZone: "Asia/Kolkata", now: new Date("2026-11-13T10:00:00.000Z") },
    );
    expect(dateIntent?.kind).toBe("absolute_day");
    if (dateIntent?.kind === "absolute_day") {
      expect(dateIntent.date).toBe("2026-11-03");
    }

    const temporalIntent = new TemporalIntentParser().parse(
      "What did I ask you on 3 November? Is your answer still correct today?",
      { timeZone: "Asia/Kolkata", now: new Date("2026-11-13T10:00:00.000Z") },
    );
    expect(temporalIntent.isComparison).toBe(true);
    expect(temporalIntent.startDate).toBe("2026-11-03");
  });

  it("scenario C: last Tuesday Postgres hosting pricing deltas", async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({ NODE_ENV: "test" });
    const conversations = new ConversationService(testDb.db);
    const research = new ResearchRepository(testDb.db);
    const temporal = new TemporalService(testDb.db, env);
    const conversation = await conversations.create(testDb.localUserId, "Postgres");
    const lastTuesday = new Date("2026-11-10T09:00:00.000Z");

    await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "user",
      content: "Compare Neon, Railway, and Render Postgres hosting monthly pricing.",
    });
    await testDb.sqlClient.unsafe(
      "UPDATE messages SET created_at = $1 WHERE conversation_id = $2",
      [lastTuesday.toISOString(), conversation.id],
    );

    await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "Neon Railway Render Postgres hosting pricing",
      title: "Hosting baseline",
      provider: "tavily",
      providerRequestId: null,
      searchParameters: { query: "postgres hosting" },
      responseTimeMs: 15,
      resultCount: 3,
      capturedAt: lastTuesday,
      sources: [
        {
          title: "Neon",
          url: "https://neon.tech/pricing",
          domain: "neon.tech",
          content: "Neon Launch $19 per month",
          score: 0.9,
          publishedAt: null,
          retrievedAt: lastTuesday.toISOString(),
          faviconUrl: null,
          contentHash: "pg-h-1",
        },
        {
          title: "Railway",
          url: "https://railway.app/pricing",
          domain: "railway.app",
          content: "Railway Hobby $5 per month",
          score: 0.85,
          publishedAt: null,
          retrievedAt: lastTuesday.toISOString(),
          faviconUrl: null,
          contentHash: "pg-h-2",
        },
        {
          title: "Render",
          url: "https://render.com/pricing",
          domain: "render.com",
          content: "Render Postgres $7 per month",
          score: 0.8,
          publishedAt: null,
          retrievedAt: lastTuesday.toISOString(),
          faviconUrl: null,
          contentHash: "pg-h-3",
        },
      ],
    });

    const current = await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "Neon Railway Render Postgres hosting pricing",
      title: "Hosting current",
      provider: "tavily",
      providerRequestId: null,
      searchParameters: { query: "postgres hosting" },
      responseTimeMs: 15,
      resultCount: 3,
      capturedAt: new Date("2026-11-13T10:00:00.000Z"),
      sources: [
        {
          title: "Neon",
          url: "https://neon.tech/pricing",
          domain: "neon.tech",
          content: "Neon Launch $19 per month",
          score: 0.9,
          publishedAt: null,
          retrievedAt: "2026-11-13T10:00:00.000Z",
          faviconUrl: null,
          contentHash: "pg-c-1",
        },
        {
          title: "Railway",
          url: "https://railway.app/pricing",
          domain: "railway.app",
          content: "Railway Hobby $10 per month",
          score: 0.85,
          publishedAt: null,
          retrievedAt: "2026-11-13T10:00:00.000Z",
          faviconUrl: null,
          contentHash: "pg-c-2",
        },
        {
          title: "Render",
          url: "https://render.com/pricing",
          domain: "render.com",
          content: "Render Postgres billed annually $84 per year",
          score: 0.8,
          publishedAt: null,
          retrievedAt: "2026-11-13T10:00:00.000Z",
          faviconUrl: null,
          contentHash: "pg-c-3",
        },
      ],
    });

    const prepare = await temporal.prepareTurn({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      message:
        "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?",
      timeZone: "Asia/Kolkata",
      now: new Date("2026-11-13T12:00:00.000Z"),
    });

    expect(prepare.intent.startDate).toBe("2026-11-10");

    const view = await temporal.finalizeComparison({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      prepare,
      currentSnapshotIds: [current.snapshot.id],
    });

    expect(view).toBeTruthy();
    const changeTypes = view!.items.map((i) => i.changeType);
    expect(changeTypes).toContain("PRICE_INCREASED");
    expect(
      changeTypes.some((t) =>
        ["PRICE_UNCHANGED", "PRICE_STRUCTURE_CHANGED", "NOT_COMPARABLE"].includes(t),
      ),
    ).toBe(true);

    const evaluation = evaluateTemporalComparison(view!, {
      mustIncludeEntities: ["Railway"],
      requiredChangeTypes: ["PRICE_INCREASED"],
      requireHistoricalValues: true,
    });
    expect(evaluation.passed).toBe(true);
  });
});
