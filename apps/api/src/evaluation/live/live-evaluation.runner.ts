import { hasOpenAiKey, hasTavilyKey, loadEnvironment } from "../../config/env.js";
import { loadEvaluationConfig } from "../evaluation.config.js";
import { runEvaluation, type RunEvaluationOptions } from "../evaluation.runner.js";
import { assertLiveEvaluationAllowed, liveEvaluationBudget } from "./live-evaluation.config.js";
import type { EvaluationRunReport } from "../evaluation.types.js";

/**
 * Live evaluation exercises real OpenAI + Tavily.
 * Never invoked from the default `npm run eval` path.
 */
export async function runLiveEvaluation(
  options: RunEvaluationOptions = {},
): Promise<EvaluationRunReport> {
  const env = loadEnvironment();
  const config = loadEvaluationConfig(env, {
    liveEnabled: env.EVAL_LIVE_ENABLED,
  });
  assertLiveEvaluationAllowed(config);

  if (!hasOpenAiKey(env) || !hasTavilyKey(env)) {
    throw new Error(
      "Live evaluation requires OPENAI_API_KEY and TAVILY_API_KEY",
    );
  }

  const budget = liveEvaluationBudget(config);
  return runEvaluation({
    ...options,
    mode: "live",
    limit: options.limit ?? budget.maxCases,
    requireLiveOptIn: true,
    config,
  });
}
