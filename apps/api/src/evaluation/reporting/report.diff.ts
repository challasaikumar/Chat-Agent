import type { EvaluationRunReport } from "../evaluation.types.js";

export type RegressionDiff = {
  improved: string[];
  degraded: string[];
  newlyFailing: string[];
  resolvedFailures: string[];
  datasetVersionChanged: boolean;
  metricDeltas: Record<string, { baseline: number | null; current: number | null; delta: number | null }>;
};

const HARD_GATE_CATEGORIES = new Set([
  "WRONG_DATE",
  "CITATION_FAILURE",
  "PRICE_NORMALIZATION_FAILURE",
  "MEMORY_RETRIEVAL_FAILURE",
  "WRONG_CONVERSATION",
]);

export function compareEvaluationReports(
  baseline: EvaluationRunReport,
  current: EvaluationRunReport,
): RegressionDiff {
  const baseById = new Map(baseline.results.map((r) => [r.caseId, r]));
  const curById = new Map(current.results.map((r) => [r.caseId, r]));

  const newlyFailing: string[] = [];
  const resolvedFailures: string[] = [];
  const improved: string[] = [];
  const degraded: string[] = [];

  for (const [id, cur] of curById) {
    const base = baseById.get(id);
    if (!base) continue;
    const basePass = base.status === "passed";
    const curPass = cur.status === "passed";
    if (basePass && !curPass) newlyFailing.push(id);
    if (!basePass && curPass) resolvedFailures.push(id);

    const baseAssertPass = base.assertions.filter((a) => a.passed).length;
    const curAssertPass = cur.assertions.filter((a) => a.passed).length;
    if (curAssertPass > baseAssertPass) improved.push(id);
    if (curAssertPass < baseAssertPass) degraded.push(id);
  }

  const metricDeltas: RegressionDiff["metricDeltas"] = {};
  const keys = new Set([
    ...Object.keys(baseline.metrics),
    ...Object.keys(current.metrics),
  ]);
  for (const key of keys) {
    const b = baseline.metrics[key] ?? null;
    const c = current.metrics[key] ?? null;
    metricDeltas[key] = {
      baseline: b,
      current: c,
      delta: b != null && c != null ? c - b : null,
    };
  }

  return {
    improved: [...new Set(improved)],
    degraded: [...new Set(degraded)],
    newlyFailing,
    resolvedFailures,
    datasetVersionChanged:
      baseline.summary.datasetVersion !== current.summary.datasetVersion,
    metricDeltas,
  };
}

export function hasHardGateRegression(diff: RegressionDiff, current: EvaluationRunReport): boolean {
  return current.results.some(
    (r) =>
      diff.newlyFailing.includes(r.caseId) &&
      r.failureCategories.some((c) => HARD_GATE_CATEGORIES.has(c)),
  );
}
