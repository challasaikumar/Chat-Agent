import type { Env } from "../config/env.js";
import { loadPerfConfig } from "../performance/perf.config.js";
import {
  getSharedSearchCache,
  type SearchResponseCache,
} from "../performance/search-cache.js";
import {
  getMetricsRegistry,
  type MetricsRegistry,
} from "../performance/metrics.registry.js";
import {
  getResourceGate,
  type ResourceGate,
} from "../performance/resource-gate.js";
import {
  searchValidationError,
  type SearchProvider,
} from "./search.interface.js";
import { searchInputSchema } from "./search.schemas.js";
import type { SearchInput, SearchResponse } from "./search.types.js";
import { TavilySearchProvider } from "./providers/tavily/tavily.provider.js";

export class SearchService {
  private readonly provider: SearchProvider;
  private readonly cache: SearchResponseCache;
  private readonly gate: ResourceGate;
  private readonly metrics: MetricsRegistry;

  constructor(env: Env, provider?: SearchProvider) {
    this.provider = provider ?? new TavilySearchProvider(env);
    const perf = loadPerfConfig(env);
    this.metrics = getMetricsRegistry(perf);
    this.cache = getSharedSearchCache(perf);
    this.gate = getResourceGate(perf, this.metrics);
    this.metrics.setSearchCacheStats(() => {
      const s = this.cache.stats();
      return {
        size: s.size,
        hits: s.hits,
        misses: s.misses,
        evictions: s.evictions,
        hitRate: s.hitRate,
        inflight: s.inflight,
      };
    });
  }

  getProviderName(): string {
    return this.provider.name;
  }

  getCacheStats() {
    return this.cache.stats();
  }

  async search(
    rawInput: SearchInput,
    options: { forceRefresh?: boolean; signal?: AbortSignal } = {},
  ): Promise<SearchResponse> {
    const parsed = searchInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw searchValidationError("Invalid search input", parsed.error.flatten());
    }

    const started = Date.now();
    const { response, meta } = await this.gate.withSearch(
      async () =>
        this.cache.getOrLoad(
          parsed.data,
          async () => this.provider.search(parsed.data),
          {
            forceRefresh: options.forceRefresh,
            signal: options.signal,
          },
        ),
      options.signal,
    );

    this.metrics.observe("search.total_ms", Date.now() - started);
    this.metrics.increment(meta.cacheHit ? "search.cache_hit" : "search.cache_miss");

    return {
      ...response,
      cache: {
        hit: meta.cacheHit,
        insertedAt: meta.cacheInsertedAt,
        servedAt: meta.cacheServedAt,
        ageMs: meta.cacheAgeMs,
        volatility: meta.volatility,
        bypassed: meta.bypassed,
        bypassReason: meta.bypassReason,
      },
    };
  }
}
