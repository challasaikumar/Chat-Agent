import type { AgentConfig } from "../agent.config.js";
import { agentTimeoutError } from "../errors/agent.errors.js";

export class ExecutionBudget {
  toolIterations = 0;
  searchCalls = 0;
  readonly startedAt = Date.now();
  private readonly identicalQueries = new Set<string>();

  constructor(private readonly config: AgentConfig) {}

  remainingMs(): number {
    return Math.max(0, this.config.requestTimeoutMs - (Date.now() - this.startedAt));
  }

  assertNotTimedOut(): void {
    if (this.remainingMs() <= 0) {
      throw agentTimeoutError(
        "The assistant took too long. Try a shorter question or try again.",
      );
    }
  }

  canCallTool(): boolean {
    return this.toolIterations < this.config.maxToolIterations;
  }

  canSearch(query: string): { ok: boolean; reason?: string } {
    if (this.searchCalls >= this.config.maxSearchesPerTurn) {
      return { ok: false, reason: "Maximum searches per turn reached" };
    }
    const key = query.trim().toLowerCase();
    if (this.identicalQueries.has(key)) {
      return { ok: false, reason: "Identical search already executed this turn" };
    }
    return { ok: true };
  }

  recordToolIteration(): void {
    this.toolIterations += 1;
  }

  recordSearch(query: string): void {
    this.searchCalls += 1;
    this.identicalQueries.add(query.trim().toLowerCase());
  }

  toolsDisabledPayload(): { tool_choice: "none" } {
    return { tool_choice: "none" };
  }
}
