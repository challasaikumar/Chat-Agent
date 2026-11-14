import type { EvaluationConfig } from "../evaluation.config.js";

export function assertLiveEvaluationAllowed(config: EvaluationConfig): void {
  if (!config.liveEnabled) {
    throw new Error(
      "Live evaluation is disabled. Set EVAL_LIVE_ENABLED=true and use npm run eval:live.",
    );
  }
}

export type LiveEvaluationBudget = {
  maxCases: number;
  timeoutMs: number;
};

export function liveEvaluationBudget(config: EvaluationConfig): LiveEvaluationBudget {
  return {
    maxCases: Math.max(1, config.llmJudgeMaxCases),
    timeoutMs: config.defaultTimeoutMs,
  };
}
