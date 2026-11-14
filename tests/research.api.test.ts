import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app.ts";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import type { SearchProvider } from "../apps/api/src/search/search.interface.ts";
import {
  searchConfigurationError,
  searchProviderError,
} from "../apps/api/src/search/search.interface.ts";
import type { SearchResponse } from "../apps/api/src/search/search.types.ts";
import { describeDb } from "./helpers/db.ts";

function mockProvider(
  impl: SearchProvider["search"],
): SearchProvider {
  return {
    name: "tavily",
    search: impl,
  };
}

function okResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  const retrievedAt = new Date().toISOString();
  return {
    query: "Current PostgreSQL hosting pricing",
    provider: "tavily",
    requestId: "mock-req",
    responseTimeMs: 123,
    resultCount: 1,
    usage: { credits: 1 },
    results: [
      {
        title: "Neon Pricing",
        url: "https://neon.tech/pricing",
        domain: "neon.tech",
        content: "Postgres hosting pricing overview",
        score: 0.91,
        publishedAt: "2025-09-01T00:00:00.000Z",
        retrievedAt,
        faviconUrl: null,
        contentHash: "abc",
      },
    ],
    ...overrides,
  };
}

describeDb("research API", () => {
  let testDb: TestDatabase;
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterEach(async () => {
    await app?.close();
    await testDb?.cleanup();
  });

  async function setup(provider: SearchProvider, tavilyKey = "tvly-test") {
    testDb = await createTestDatabase("local-dev-user");
    const env = loadEnvironment({
      NODE_ENV: "test",
      LOCAL_USER_ID: testDb.localUserId,
      TAVILY_API_KEY: tavilyKey,
    });

    app = await buildApp({
      env,
      searchProvider: provider,
      database: {
        db: testDb.db,
        databasePath: testDb.path,
        localUserId: testDb.localUserId,
      },
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/conversations",
      payload: { title: "Research chat" },
    });
    return created.json().data.id as string;
  }

  it("searches, persists, and retrieves snapshots/sources", async () => {
    const conversationId = await setup(
      mockProvider(async () => okResponse()),
    );

    const search = await app.inject({
      method: "POST",
      url: "/api/research/search",
      payload: {
        conversationId,
        query: "Current PostgreSQL hosting pricing",
        searchDepth: "advanced",
        maxResults: 8,
        topic: "general",
      },
    });

    expect(search.statusCode).toBe(201);
    const body = search.json().data;
    expect(body.meta.provider).toBe("tavily");
    expect(body.results).toHaveLength(1);
    expect(body.snapshot.query).toContain("PostgreSQL");

    const snapshotId = body.snapshot.id as string;

    const getSnapshot = await app.inject({
      method: "GET",
      url: `/api/research/snapshots/${snapshotId}`,
    });
    expect(getSnapshot.statusCode).toBe(200);

    const sources = await app.inject({
      method: "GET",
      url: `/api/research/snapshots/${snapshotId}/sources`,
    });
    expect(sources.statusCode).toBe(200);
    expect(sources.json().data.items).toHaveLength(1);

    const listed = await app.inject({
      method: "GET",
      url: "/api/research/snapshots?limit=10",
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data.items.length).toBeGreaterThanOrEqual(1);
  });

  it("validates requests and conversation ownership", async () => {
    const conversationId = await setup(mockProvider(async () => okResponse()));

    const invalid = await app.inject({
      method: "POST",
      url: "/api/research/search",
      payload: { conversationId, query: "" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("SEARCH_VALIDATION_ERROR");

    const missingConversation = await app.inject({
      method: "POST",
      url: "/api/research/search",
      payload: {
        conversationId: "00000000-0000-4000-8000-000000000099",
        query: "pricing",
      },
    });
    expect(missingConversation.statusCode).toBe(404);
  });

  it("returns configuration and provider errors", async () => {
    const conversationId = await setup(
      mockProvider(async () => {
        throw searchConfigurationError();
      }),
      "",
    );

    const missingKey = await app.inject({
      method: "POST",
      url: "/api/research/search",
      payload: { conversationId, query: "pricing" },
    });
    expect(missingKey.statusCode).toBe(503);
    expect(missingKey.json().error.code).toBe("SEARCH_CONFIGURATION_ERROR");

    await app.close();
    const conversationId2 = await setup(
      mockProvider(async () => {
        throw searchProviderError("upstream failed");
      }),
    );

    const failed = await app.inject({
      method: "POST",
      url: "/api/research/search",
      payload: { conversationId: conversationId2, query: "pricing" },
    });
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error.code).toBe("SEARCH_PROVIDER_ERROR");
  });

  it("returns empty-results error without inventing sources", async () => {
    const conversationId = await setup(
      mockProvider(async () =>
        okResponse({ results: [], resultCount: 0 }),
      ),
    );

    const empty = await app.inject({
      method: "POST",
      url: "/api/research/search",
      payload: { conversationId, query: "obscure topic xyz" },
    });
    expect(empty.statusCode).toBe(404);
    expect(empty.json().error.code).toBe("SEARCH_EMPTY_RESULTS");
  });
});
