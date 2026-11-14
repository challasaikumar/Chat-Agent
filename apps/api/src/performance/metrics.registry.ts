import { monitorEventLoopDelay } from "node:perf_hooks";
import type { PerfConfig } from "./perf.config.js";

export type LatencySample = {
  name: string;
  ms: number;
  at: string;
};

export type PerfSnapshot = {
  at: string;
  process: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    eventLoopDelayMs: number | null;
  };
  concurrency: {
    activeAgentRuns: number;
    activeSearches: number;
    activeOpenAiRequests: number;
    activeStreams: number;
  };
  cache: {
    search: Record<string, number | null>;
  };
  latency: Record<string, { count: number; p50: number | null; p95: number | null; avg: number | null; lowConfidence: boolean }>;
  counters: Record<string, number>;
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[Math.max(0, idx)]!;
}

export class MetricsRegistry {
  private readonly samples = new Map<string, number[]>();
  private readonly counters = new Map<string, number>();
  activeAgentRuns = 0;
  activeSearches = 0;
  activeOpenAiRequests = 0;
  activeStreams = 0;
  private readonly loopDelay = monitorEventLoopDelay({ resolution: 20 });
  private searchCacheStats: () => Record<string, number | null> = () => ({});

  constructor(private readonly config: PerfConfig) {
    this.loopDelay.enable();
  }

  setSearchCacheStats(fn: () => Record<string, number | null>): void {
    this.searchCacheStats = fn;
  }

  observe(name: string, ms: number): void {
    if (!this.config.enabled) return;
    const list = this.samples.get(name) ?? [];
    list.push(ms);
    if (list.length > 1000) list.shift();
    this.samples.set(name, list);
  }

  increment(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  private summarize(name: string) {
    const values = [...(this.samples.get(name) ?? [])].sort((a, b) => a - b);
    const avg =
      values.length === 0
        ? null
        : values.reduce((s, v) => s + v, 0) / values.length;
    return {
      count: values.length,
      p50: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      avg,
      lowConfidence: values.length < 30,
    };
  }

  snapshot(): PerfSnapshot {
    const mem = process.memoryUsage();
    const latency: PerfSnapshot["latency"] = {};
    for (const key of this.samples.keys()) {
      latency[key] = this.summarize(key);
    }
    const counters: Record<string, number> = {};
    for (const [k, v] of this.counters) counters[k] = v;

    return {
      at: new Date().toISOString(),
      process: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        eventLoopDelayMs: this.loopDelay.mean / 1e6,
      },
      concurrency: {
        activeAgentRuns: this.activeAgentRuns,
        activeSearches: this.activeSearches,
        activeOpenAiRequests: this.activeOpenAiRequests,
        activeStreams: this.activeStreams,
      },
      cache: { search: this.searchCacheStats() },
      latency,
      counters,
    };
  }

  disable(): void {
    this.loopDelay.disable();
  }
}

let sharedMetrics: MetricsRegistry | null = null;

export function getMetricsRegistry(config: PerfConfig): MetricsRegistry {
  if (!sharedMetrics) {
    sharedMetrics = new MetricsRegistry(config);
  }
  return sharedMetrics;
}

export function resetMetricsRegistry(): void {
  sharedMetrics?.disable();
  sharedMetrics = null;
}
