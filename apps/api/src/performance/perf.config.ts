import type { Env } from "../config/env.js";
import { loadEnvironment } from "../config/env.js";

export type PerfConfig = {
  enabled: boolean;
  maxActiveAgentRuns: number;
  maxActiveSearches: number;
  maxActiveOpenAiRequests: number;
  cacheEnabled: boolean;
  cacheMaxEntries: number;
  searchCacheEnabled: boolean;
  contextCacheEnabled: boolean;
  defaultRequestTimeoutMs: number;
  maxStreamDurationMs: number;
  dbQueryWarningMs: number;
  metricsSampleIntervalMs: number;
  searchTtlHighMs: number;
  searchTtlModerateMs: number;
  searchTtlStableMs: number;
};

export function loadPerfConfig(env: Env = loadEnvironment()): PerfConfig {
  return {
    enabled: env.PERF_ENABLED,
    maxActiveAgentRuns: env.PERF_MAX_ACTIVE_AGENT_RUNS,
    maxActiveSearches: env.PERF_MAX_ACTIVE_SEARCHES,
    maxActiveOpenAiRequests: env.PERF_MAX_ACTIVE_OPENAI_REQUESTS,
    cacheEnabled: env.PERF_CACHE_ENABLED,
    cacheMaxEntries: env.PERF_CACHE_MAX_ENTRIES,
    searchCacheEnabled: env.PERF_SEARCH_CACHE_ENABLED && env.PERF_CACHE_ENABLED,
    contextCacheEnabled:
      env.PERF_CONTEXT_CACHE_ENABLED && env.PERF_CACHE_ENABLED,
    defaultRequestTimeoutMs: env.PERF_DEFAULT_REQUEST_TIMEOUT_MS,
    maxStreamDurationMs: env.PERF_MAX_STREAM_DURATION_MS,
    dbQueryWarningMs: env.PERF_DB_QUERY_WARNING_MS,
    metricsSampleIntervalMs: env.PERF_METRICS_SAMPLE_INTERVAL_MS,
    searchTtlHighMs: env.PERF_SEARCH_CACHE_TTL_HIGH_MS,
    searchTtlModerateMs: env.PERF_SEARCH_CACHE_TTL_MODERATE_MS,
    searchTtlStableMs: env.PERF_SEARCH_CACHE_TTL_STABLE_MS,
  };
}

export function perfConfigSnapshot(config: PerfConfig): Record<string, unknown> {
  return { ...config };
}
