import { resolve } from "node:path";
import type { Env } from "../config/env.js";
import { loadEnvironment } from "../config/env.js";

export type EvaluationConfig = {
  enabled: boolean;
  defaultTimeoutMs: number;
  maxConcurrency: number;
  liveEnabled: boolean;
  llmJudgeEnabled: boolean;
  llmJudgeModel: string;
  llmJudgeMaxCases: number;
  llmJudgeTimeoutMs: number;
  reportDirectory: string;
  datasetsDirectory: string;
  rootDir: string;
  appTimeZone: string;
  openaiModel: string;
  searchProviderName: string;
};

export function loadEvaluationConfig(
  env: Env = loadEnvironment(),
  overrides: Partial<EvaluationConfig> = {},
): EvaluationConfig {
  const reportDirectory = resolve(env.ROOT_DIR, env.EVAL_REPORT_DIRECTORY);
  const datasetsDirectory = resolve(env.ROOT_DIR, "evals/datasets");

  return {
    enabled: env.EVAL_ENABLED,
    defaultTimeoutMs: env.EVAL_DEFAULT_TIMEOUT_MS,
    maxConcurrency: env.EVAL_MAX_CONCURRENCY,
    liveEnabled: env.EVAL_LIVE_ENABLED,
    llmJudgeEnabled: env.EVAL_LLM_JUDGE_ENABLED,
    llmJudgeModel: env.EVAL_LLM_JUDGE_MODEL || env.OPENAI_MODEL || "",
    llmJudgeMaxCases: env.EVAL_LLM_JUDGE_MAX_CASES,
    llmJudgeTimeoutMs: env.EVAL_LLM_JUDGE_TIMEOUT_MS,
    reportDirectory,
    datasetsDirectory,
    rootDir: env.ROOT_DIR,
    appTimeZone: env.APP_TIME_ZONE,
    openaiModel: env.OPENAI_MODEL || "gpt-4.1-mini",
    searchProviderName: "tavily",
    ...overrides,
  };
}

/** Safe config snapshot for reports — never includes secrets. */
export function evaluationConfigSnapshot(config: EvaluationConfig): Record<string, unknown> {
  return {
    enabled: config.enabled,
    defaultTimeoutMs: config.defaultTimeoutMs,
    maxConcurrency: config.maxConcurrency,
    liveEnabled: config.liveEnabled,
    llmJudgeEnabled: config.llmJudgeEnabled,
    llmJudgeModel: config.llmJudgeModel || null,
    llmJudgeMaxCases: config.llmJudgeMaxCases,
    llmJudgeTimeoutMs: config.llmJudgeTimeoutMs,
    reportDirectory: config.reportDirectory,
    datasetsDirectory: config.datasetsDirectory,
    appTimeZone: config.appTimeZone,
    openaiModel: config.openaiModel,
    searchProviderName: config.searchProviderName,
  };
}
