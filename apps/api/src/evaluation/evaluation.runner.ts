import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import {
  evaluationConfigSnapshot,
  loadEvaluationConfig,
  type EvaluationConfig,
} from "./evaluation.config.js";
import { loadDatasetsFromDirectory } from "./evaluation.dataset.loader.js";
import {
  executeEvaluationCase,
  type ExecutableCase,
} from "./evaluation.case-executor.js";
import type {
  EvaluationCaseResult,
  EvaluationMode,
  EvaluationRunReport,
  FailureCategory,
} from "./evaluation.types.js";
import type { EvaluationSuiteFilter } from "./evaluation.registry.js";
import { isParallelSafe } from "./evaluation.registry.js";
import { summarizeLatencies } from "./metrics/latency.metrics.js";
import { reliabilityFromStatuses } from "./metrics/reliability.metrics.js";
import { writeEvaluationReports } from "./reporting/report.generator.js";

function gitCommitSha(rootDir: string): string | null {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i]!);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export type RunEvaluationOptions = EvaluationSuiteFilter & {
  config?: EvaluationConfig;
  format?: "json" | "markdown" | "junit" | "all";
  verbose?: boolean;
  writeReports?: boolean;
  /** Force mode for filtering; live requires opt-in. */
  requireLiveOptIn?: boolean;
};

export async function runEvaluation(
  options: RunEvaluationOptions = {},
): Promise<EvaluationRunReport> {
  const config = options.config ?? loadEvaluationConfig();
  if (!config.enabled) {
    throw new Error("Evaluation disabled (EVAL_ENABLED=false)");
  }

  const modeFilter = options.mode;
  if (modeFilter === "live" || options.requireLiveOptIn) {
    if (!config.liveEnabled) {
      throw new Error(
        "Live evaluation requires EVAL_LIVE_ENABLED=true (never runs from npm run eval).",
      );
    }
  }

  const { cases: loaded } = loadDatasetsFromDirectory(config.datasetsDirectory, {
    dataset: options.dataset,
    category: options.category,
    caseId: options.caseId,
    mode: modeFilter,
    tags: options.tags,
  });

  let cases = loaded as ExecutableCase[];
  // Default deterministic suite excludes live cases.
  if (!modeFilter) {
    cases = cases.filter((c) => c.mode !== "live");
  }
  if (options.limit != null) {
    cases = cases.slice(0, options.limit);
  }

  const runId = randomUUID();
  const startedAt = new Date();
  const results: EvaluationCaseResult[] = [];

  const sequential = cases.filter((c) => !isParallelSafe(c.category));
  const parallel = cases.filter((c) => isParallelSafe(c.category));

  for (const c of sequential) {
    if (options.verbose) {
      process.stdout.write(`→ ${c.id} (${c.category})\n`);
    }
    results.push(await executeEvaluationCase(c, config));
  }

  const parallelResults = await mapPool(
    parallel,
    config.maxConcurrency,
    async (c) => {
      if (options.verbose) {
        process.stdout.write(`→ ${c.id} (${c.category}) [parallel]\n`);
      }
      return executeEvaluationCase(c, config);
    },
  );
  results.push(...parallelResults);

  const completedAt = new Date();
  const statuses = results.map((r) => r.status);
  const totals = {
    executed: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    error: results.filter((r) => r.status === "error").length,
    cancelled: results.filter((r) => r.status === "cancelled").length,
    successRate:
      results.length === 0
        ? 0
        : results.filter((r) => r.status === "passed").length / results.length,
  };

  const criticalFailures = results.filter((r) =>
    r.assertions.some((a) => a.critical !== false && !a.passed),
  ).length;

  const latencies = summarizeLatencies(results.map((r) => r.durationMs));
  const reliability = reliabilityFromStatuses(
    statuses,
    results.map((r) => r.failureCategories),
  );

  const metricBags = results.map((r) => r.metrics);
  const avg = (key: string): number | null => {
    const vals = metricBags
      .map((m) => m[key])
      .filter((v): v is number => typeof v === "number");
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const report: EvaluationRunReport = {
    summary: {
      runId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      datasetName: options.dataset ?? "all",
      datasetVersion: cases[0]?.datasetVersion ?? 0,
      gitCommit: gitCommitSha(config.rootDir),
      mode: (modeFilter as EvaluationMode | undefined) ?? "deterministic",
      config: evaluationConfigSnapshot(config),
      totals,
      criticalFailures,
    },
    results,
    metrics: {
      successRate: totals.successRate,
      criticalFailures,
      avgDurationMs: latencies.averageMs,
      p50DurationMs: latencies.medianMs,
      p95DurationMs: latencies.p95Ms,
      latencyLowConfidence: latencies.lowConfidence ? 1 : 0,
      avgEntityMatchRate: avg("entityMatchRate"),
      avgPrecisionAt5: avg("precisionAt5"),
      avgRecallAt5: avg("recallAt5"),
      avgMrr: avg("mrr"),
      avgCitationValidity: avg("citationValidityRate"),
      avgSearchCalls: avg("searchCallCount"),
      avgInputTokens: avg("inputTokens"),
      avgOutputTokens: avg("outputTokens"),
      completedRunRate: reliability.completedRunRate as number | null,
      unexpectedFailureRate: reliability.unexpectedFailureRate as number | null,
    },
    failures: results.flatMap((r) =>
      r.failureCategories.map((category: FailureCategory) => ({
        caseId: r.caseId,
        category,
        explanation:
          r.assertions.find((a) => !a.passed && a.failureCategory === category)
            ?.explanation ??
          r.error ??
          "failed",
      })),
    ),
  };

  if (options.writeReports !== false) {
    writeEvaluationReports(report, config.reportDirectory, options.format ?? "all");
  }

  return report;
}
