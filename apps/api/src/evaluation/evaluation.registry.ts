import type { EvaluationMode } from "./evaluation.types.js";

export type EvaluationSuiteFilter = {
  category?: string;
  mode?: EvaluationMode;
  tags?: string[];
  caseId?: string;
  dataset?: string;
  limit?: number;
};

export const EVALUATION_CATEGORIES = [
  "conversational_memory",
  "historical_retrieval",
  "web_research",
  "temporal_research",
  "evidence_verification",
  "citation_accuracy",
  "agent_orchestration",
  "performance_reliability",
] as const;

export type EvaluationCategory = (typeof EVALUATION_CATEGORIES)[number];

/** Categories that may run in parallel (independent isolated DBs). */
export const PARALLEL_SAFE_CATEGORIES = new Set<string>([
  "citation_accuracy",
  "evidence_verification",
  "performance_reliability",
]);

export function isParallelSafe(category: string): boolean {
  return PARALLEL_SAFE_CATEGORIES.has(category);
}
