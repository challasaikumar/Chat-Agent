import type { EvaluationCaseStatus } from "../evaluation.types.js";

export type ReliabilityCounts = {
  completed: number;
  failed: number;
  cancelled: number;
  timeout: number;
  error: number;
  skipped: number;
  total: number;
};

export function reliabilityFromStatuses(
  statuses: EvaluationCaseStatus[],
  failureCategories: string[][] = [],
): ReliabilityCounts & Record<string, number | null> {
  const counts: ReliabilityCounts = {
    completed: 0,
    failed: 0,
    cancelled: 0,
    timeout: 0,
    error: 0,
    skipped: 0,
    total: statuses.length,
  };

  for (const [i, status] of statuses.entries()) {
    if (status === "passed") counts.completed += 1;
    else if (status === "failed") counts.failed += 1;
    else if (status === "cancelled") counts.cancelled += 1;
    else if (status === "skipped") counts.skipped += 1;
    else if (status === "error") {
      const cats = failureCategories[i] ?? [];
      if (cats.includes("TIMEOUT")) counts.timeout += 1;
      else counts.error += 1;
    }
  }

  const graded = counts.total - counts.skipped;
  return {
    ...counts,
    completedRunRate: graded > 0 ? counts.completed / graded : null,
    failedRunRate: graded > 0 ? counts.failed / graded : null,
    cancelledRunRate: graded > 0 ? counts.cancelled / graded : null,
    timeoutRate: graded > 0 ? counts.timeout / graded : null,
    // Cancelled runs are excluded from reliability failure rate by design.
    unexpectedFailureRate:
      graded - counts.cancelled > 0
        ? (counts.failed + counts.error + counts.timeout) /
          (graded - counts.cancelled)
        : null,
  };
}
