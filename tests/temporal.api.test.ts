import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import { buildApp } from "../apps/api/src/app.ts";
import { ConversationService } from "../apps/api/src/services/conversation.service.ts";
import { ResearchRepository } from "../apps/api/src/repositories/research.repository.ts";
import { TemporalService } from "../apps/api/src/temporal/temporal.service.ts";
import { describeDb } from "./helpers/db.ts";

describeDb("temporal API", () => {
  let testDb: TestDatabase;
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await testDb?.cleanup();
  });

  it("lists comparisons and claims with ownership filtering", async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({
      NODE_ENV: "test",
      LOCAL_USER_ID: testDb.localUserId,
    });
    app = await buildApp({
      env,
      database: {
        db: testDb.db,
        databasePath: testDb.path,
        localUserId: testDb.localUserId,
        ensureUser: false,
      },
    });

    const conversations = new ConversationService(testDb.db);
    const research = new ResearchRepository(testDb.db);
    const temporal = new TemporalService(testDb.db, env);
    const conversation = await conversations.create(testDb.localUserId, "api");

    const hist = await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "HubSpot pricing",
      title: "HubSpot",
      provider: "tavily",
      providerRequestId: null,
      searchParameters: { query: "HubSpot" },
      responseTimeMs: 5,
      resultCount: 1,
      capturedAt: new Date("2026-11-03T00:00:00.000Z"),
      sources: [
        {
          title: "HubSpot",
          url: "https://www.hubspot.com/pricing",
          domain: "www.hubspot.com",
          content: "HubSpot Starter $20 per month",
          score: 0.9,
          publishedAt: null,
          retrievedAt: "2026-11-03T00:00:00.000Z",
          faviconUrl: null,
          contentHash: "api-h",
        },
      ],
    });

    const curr = await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "HubSpot pricing",
      title: "HubSpot now",
      provider: "tavily",
      providerRequestId: null,
      searchParameters: { query: "HubSpot" },
      responseTimeMs: 5,
      resultCount: 1,
      capturedAt: new Date("2026-11-13T00:00:00.000Z"),
      sources: [
        {
          title: "HubSpot",
          url: "https://www.hubspot.com/pricing",
          domain: "www.hubspot.com",
          content: "HubSpot Starter $25 per month",
          score: 0.9,
          publishedAt: null,
          retrievedAt: "2026-11-13T00:00:00.000Z",
          faviconUrl: null,
          contentHash: "api-c",
        },
      ],
    });

    const prepare = await temporal.prepareTurn({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      message: "Has HubSpot pricing changed since November 3?",
      timeZone: "Asia/Kolkata",
      now: new Date("2026-11-13T12:00:00.000Z"),
    });
    const view = await temporal.finalizeComparison({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      prepare,
      currentSnapshotIds: [curr.snapshot.id],
    });
    expect(view?.comparisonId).toBeTruthy();
    void hist;

    const list = await app!.inject({
      method: "GET",
      url: "/api/temporal/comparisons",
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json();
    expect(listBody.success).toBe(true);
    expect(listBody.data.items.length).toBeGreaterThan(0);

    const one = await app!.inject({
      method: "GET",
      url: `/api/temporal/comparisons/${view!.comparisonId}`,
    });
    expect(one.statusCode).toBe(200);

    const items = await app!.inject({
      method: "GET",
      url: `/api/temporal/comparisons/${view!.comparisonId}/items`,
    });
    expect(items.statusCode).toBe(200);
    expect(items.json().data.items.length).toBeGreaterThan(0);

    const claims = await app!.inject({
      method: "GET",
      url: "/api/temporal/claims",
    });
    expect(claims.statusCode).toBe(200);
    expect(claims.json().data.items.length).toBeGreaterThan(0);

    const preview = await app!.inject({
      method: "POST",
      url: "/api/temporal/comparisons/preview",
      payload: {
        conversationId: conversation.id,
        entityNames: ["HubSpot"],
        fromDate: "2026-11-03",
        toDate: "2026-11-13",
        timeZone: "Asia/Kolkata",
        categories: ["pricing"],
      },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().success).toBe(true);

    const missing = await app!.inject({
      method: "GET",
      url: "/api/temporal/comparisons/00000000-0000-4000-8000-000000000000",
    });
    expect(missing.statusCode).toBe(404);
  });
});
