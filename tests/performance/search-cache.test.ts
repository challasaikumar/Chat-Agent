import { afterEach, describe, expect, it } from "vitest";
import { loadEnvironment } from "../../apps/api/src/config/env.ts";
import { loadPerfConfig } from "../../apps/api/src/performance/perf.config.ts";
import {
  SearchResponseCache,
  buildSearchCacheKey,
  classifySearchVolatility,
  resetSharedSearchCache,
} from "../../apps/api/src/performance/search-cache.ts";
import { SearchService } from "../../apps/api/src/search/search.service.ts";
import type { SearchProvider } from "../../apps/api/src/search/search.interface.ts";
import { resetMetricsRegistry } from "../../apps/api/src/performance/metrics.registry.ts";
import { resetResourceGate } from "../../apps/api/src/performance/resource-gate.ts";

function provider(retrievedAt: string): SearchProvider {
  let calls = 0;
  return {
    name: "tavily",
    get calls() {
      return calls;
    },
    async search(input) {
      calls += 1;
      return {
        query: input.query,
        provider: "tavily",
        requestId: `r-${calls}`,
        responseTimeMs: 1,
        resultCount: 1,
        usage: { credits: 1 },
        results: [
          {
            title: "Doc",
            url: "https://example.com/docs",
            domain: "example.com",
            content: "Stable documentation content.",
            score: 1,
            publishedAt: "2026-01-01T00:00:00.000Z",
            retrievedAt,
            faviconUrl: null,
            contentHash: "h1",
          },
        ],
      };
    },
  } as SearchProvider & { calls: number };
}

describe("search cache", () => {
  afterEach(() => {
    resetSharedSearchCache();
    resetMetricsRegistry();
    resetResourceGate();
  });

  it("classifies volatility and builds distinct keys", () => {
    expect(classifySearchVolatility("current HubSpot pricing")).toBe("high");
    expect(classifySearchVolatility("API documentation reference")).toBe(
      "moderate",
    );
    expect(classifySearchVolatility("what is a btree")).toBe("stable");
    expect(
      buildSearchCacheKey({ query: "A  B", searchDepth: "basic" }),
    ).toBe(buildSearchCacheKey({ query: "a b", searchDepth: "basic" }));
    expect(
      buildSearchCacheKey({ query: "a", searchDepth: "basic" }),
    ).not.toBe(buildSearchCacheKey({ query: "a", searchDepth: "advanced" }));
  });

  it("caches stable queries and preserves original retrievedAt", async () => {
    const env = loadEnvironment({
      NODE_ENV: "test",
      PERF_SEARCH_CACHE_ENABLED: "true",
      PERF_CACHE_ENABLED: "true",
    });
    const retrievedAt = "2026-11-13T08:00:00.000Z";
    const mock = provider(retrievedAt);
    const service = new SearchService(env, mock);

    const first = await service.search({ query: "btree index overview" });
    const second = await service.search({ query: "btree index overview" });

    expect(first.cache?.hit).toBe(false);
    expect(second.cache?.hit).toBe(true);
    expect(second.results[0]?.retrievedAt).toBe(retrievedAt);
    expect(second.cache?.ageMs).toBeGreaterThanOrEqual(0);
    expect((mock as { calls: number }).calls).toBe(1);
  });

  it("bypasses cache on forceRefresh", async () => {
    const env = loadEnvironment({
      NODE_ENV: "test",
      PERF_SEARCH_CACHE_ENABLED: "true",
    });
    const mock = provider("2026-11-13T08:00:00.000Z");
    const service = new SearchService(env, mock);
    await service.search({ query: "btree index overview" });
    await service.search(
      { query: "btree index overview" },
      { forceRefresh: true },
    );
    expect((mock as { calls: number }).calls).toBe(2);
  });

  it("isolates abort of one waiter from shared inflight", async () => {
    const config = loadPerfConfig(
      loadEnvironment({ NODE_ENV: "test", PERF_SEARCH_CACHE_ENABLED: "true" }),
    );
    const cache = new SearchResponseCache(config);
    let resolveLoader!: (v: Awaited<ReturnType<SearchProvider["search"]>>) => void;
    const loaderPromise = new Promise<Awaited<ReturnType<SearchProvider["search"]>>>(
      (resolve) => {
        resolveLoader = resolve;
      },
    );

    const controller = new AbortController();
    const pending = cache.getOrLoad(
      { query: "shared" },
      () => loaderPromise,
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toThrow(/aborted/i);

    const ok = cache.getOrLoad({ query: "shared" }, () => loaderPromise);
    resolveLoader({
      query: "shared",
      provider: "tavily",
      requestId: "x",
      responseTimeMs: 1,
      resultCount: 0,
      usage: null,
      results: [],
    });
    const result = await ok;
    expect(result.meta.cacheHit).toBe(false);
  });
});
