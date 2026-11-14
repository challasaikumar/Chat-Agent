import type { PerfConfig } from "./perf.config.js";
import { Semaphore } from "./semaphore.js";
import type { MetricsRegistry } from "./metrics.registry.js";

/**
 * Process-local concurrency gates for agent / search / OpenAI.
 * Not distributed — one Node.js process only.
 */
export class ResourceGate {
  readonly agentRuns: Semaphore;
  readonly searches: Semaphore;
  readonly openAi: Semaphore;

  constructor(
    config: PerfConfig,
    private readonly metrics?: MetricsRegistry,
  ) {
    this.agentRuns = new Semaphore(config.maxActiveAgentRuns, "agentRuns");
    this.searches = new Semaphore(config.maxActiveSearches, "searches");
    this.openAi = new Semaphore(config.maxActiveOpenAiRequests, "openAi");
  }

  async withAgentRun<T>(
    fn: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.agentRuns.run(async () => {
      if (this.metrics) this.metrics.activeAgentRuns += 1;
      try {
        return await fn();
      } finally {
        if (this.metrics) {
          this.metrics.activeAgentRuns = Math.max(
            0,
            this.metrics.activeAgentRuns - 1,
          );
        }
      }
    }, signal);
  }

  async withSearch<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return this.searches.run(async () => {
      if (this.metrics) this.metrics.activeSearches += 1;
      try {
        return await fn();
      } finally {
        if (this.metrics) {
          this.metrics.activeSearches = Math.max(
            0,
            this.metrics.activeSearches - 1,
          );
        }
      }
    }, signal);
  }

  async withOpenAi<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return this.openAi.run(async () => {
      if (this.metrics) this.metrics.activeOpenAiRequests += 1;
      try {
        return await fn();
      } finally {
        if (this.metrics) {
          this.metrics.activeOpenAiRequests = Math.max(
            0,
            this.metrics.activeOpenAiRequests - 1,
          );
        }
      }
    }, signal);
  }
}

let sharedGate: ResourceGate | null = null;

export function getResourceGate(
  config: PerfConfig,
  metrics?: MetricsRegistry,
): ResourceGate {
  if (!sharedGate) {
    sharedGate = new ResourceGate(config, metrics);
  }
  return sharedGate;
}

export function resetResourceGate(): void {
  sharedGate = null;
}
