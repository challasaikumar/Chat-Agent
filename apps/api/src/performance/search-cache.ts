import { createHash } from "node:crypto";
import type { SearchInput, SearchResponse } from "../search/search.types.js";
import type { PerfConfig } from "./perf.config.js";
import { TtlLruCache } from "./lru-cache.js";

export type SearchVolatility = "high" | "moderate" | "stable";

export type CachedSearchPayload = {
  response: SearchResponse;
  volatility: SearchVolatility;
};

export type SearchCacheMeta = {
  cacheHit: boolean;
  cacheInsertedAt: string | null;
  cacheServedAt: string | null;
  cacheAgeMs: number | null;
  volatility: SearchVolatility | null;
  bypassed: boolean;
  bypassReason?: string;
};

const HIGH_VOLATILITY =
  /\b(pric(e|ing)|cost|availab|live|current|latest|today|now|status|stock|market|rate)\b/i;
const MODERATE_VOLATILITY =
  /\b(docs?|documentation|spec|changelog|release|feature|api reference)\b/i;

export function classifySearchVolatility(query: string): SearchVolatility {
  if (HIGH_VOLATILITY.test(query)) return "high";
  if (MODERATE_VOLATILITY.test(query)) return "moderate";
  return "stable";
}

export function ttlForVolatility(
  volatility: SearchVolatility,
  config: PerfConfig,
): number {
  switch (volatility) {
    case "high":
      return config.searchTtlHighMs;
    case "moderate":
      return config.searchTtlModerateMs;
    default:
      return config.searchTtlStableMs;
  }
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildSearchCacheKey(input: SearchInput): string {
  const payload = {
    q: normalizeSearchQuery(input.query),
    depth: input.searchDepth ?? "basic",
    topic: input.topic ?? "general",
    max: input.maxResults ?? 8,
    timeRange: input.timeRange ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    includeDomains: [...(input.includeDomains ?? [])].sort(),
    excludeDomains: [...(input.excludeDomains ?? [])].sort(),
    country: input.country ?? null,
    raw: input.includeRawContent ?? false,
    v: 1,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Public web-search response cache. Preserves original result.retrievedAt.
 * Cache hit ≠ fresh retrieval — callers must expose cache age separately.
 */
export class SearchResponseCache {
  private readonly cache: TtlLruCache<CachedSearchPayload>;
  /** In-flight promises keyed by cache key — not cancelled by sibling aborts. */
  private readonly inflight = new Map<string, Promise<SearchResponse>>();

  constructor(private readonly config: PerfConfig) {
    this.cache = new TtlLruCache(config.cacheMaxEntries);
  }

  stats() {
    return {
      ...this.cache.stats(),
      inflight: this.inflight.size,
    };
  }

  clear(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  shouldBypassForStrictFreshness(
    input: SearchInput,
    entryAgeMs: number | null,
  ): { bypass: boolean; reason?: string } {
    const volatility = classifySearchVolatility(input.query);
    if (volatility !== "high") {
      return { bypass: false };
    }
    // Strict current verification: bypass if cache is older than half high TTL
    // or caller asks for day timeRange.
    if (input.timeRange === "day") {
      return { bypass: true, reason: "time_range_day" };
    }
    if (entryAgeMs != null && entryAgeMs > this.config.searchTtlHighMs / 2) {
      return { bypass: true, reason: "stale_high_volatility" };
    }
    return { bypass: false };
  }

  get(
    input: SearchInput,
    options: { forceRefresh?: boolean } = {},
  ): { response: SearchResponse; meta: SearchCacheMeta } | null {
    if (!this.config.searchCacheEnabled || options.forceRefresh) {
      return null;
    }
    const key = buildSearchCacheKey(input);
    const now = Date.now();
    const entry = this.cache.peekEntry(key, now);
    if (!entry) {
      this.cache.get(key, now); // count miss
      return null;
    }
    const ageMs = now - entry.insertedAt;
    const bypass = this.shouldBypassForStrictFreshness(input, ageMs);
    if (bypass.bypass) {
      this.cache.delete(key);
      return null;
    }
    // promote LRU
    this.cache.get(key, now);
    const servedAt = new Date(now).toISOString();
    return {
      response: cloneResponse(entry.value.response),
      meta: {
        cacheHit: true,
        cacheInsertedAt: new Date(entry.insertedAt).toISOString(),
        cacheServedAt: servedAt,
        cacheAgeMs: ageMs,
        volatility: entry.value.volatility,
        bypassed: false,
      },
    };
  }

  set(input: SearchInput, response: SearchResponse): void {
    if (!this.config.searchCacheEnabled) return;
    const volatility = classifySearchVolatility(input.query);
    const key = buildSearchCacheKey(input);
    this.cache.set(key, { response: cloneResponse(response), volatility }, ttlForVolatility(volatility, this.config));
  }

  /**
   * Share in-flight provider calls for identical keys without abort cross-talk.
   * Each caller awaits the same promise; AbortSignal only rejects the waiter.
   */
  async getOrLoad(
    input: SearchInput,
    loader: () => Promise<SearchResponse>,
    options: { forceRefresh?: boolean; signal?: AbortSignal } = {},
  ): Promise<{ response: SearchResponse; meta: SearchCacheMeta }> {
    const hit = this.get(input, { forceRefresh: options.forceRefresh });
    if (hit) return hit;

    const key = buildSearchCacheKey(input);
    let shared = this.inflight.get(key);
    if (!shared) {
      shared = (async () => {
        try {
          const response = await loader();
          this.set(input, response);
          return response;
        } finally {
          this.inflight.delete(key);
        }
      })();
      this.inflight.set(key, shared);
    }

    const response = await raceAbort(shared, options.signal);
    return {
      response: cloneResponse(response),
      meta: {
        cacheHit: false,
        cacheInsertedAt: new Date().toISOString(),
        cacheServedAt: new Date().toISOString(),
        cacheAgeMs: 0,
        volatility: classifySearchVolatility(input.query),
        bypassed: Boolean(options.forceRefresh),
        bypassReason: options.forceRefresh ? "force_refresh" : undefined,
      },
    };
  }
}

function cloneResponse(response: SearchResponse): SearchResponse {
  return {
    ...response,
    results: response.results.map((r) => ({ ...r })),
    usage: response.usage ? { ...response.usage } : null,
  };
}

function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new Error("search aborted"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("search aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

let sharedSearchCache: SearchResponseCache | null = null;

export function getSharedSearchCache(config: PerfConfig): SearchResponseCache {
  if (!sharedSearchCache) {
    sharedSearchCache = new SearchResponseCache(config);
  }
  return sharedSearchCache;
}

export function resetSharedSearchCache(): void {
  sharedSearchCache?.clear();
  sharedSearchCache = null;
}
