import type { GradeAssertion } from "../evaluation.types.js";

export function gradePerformanceBudget(
  durationMs: number,
  timeoutMs: number,
): GradeAssertion {
  const passed = durationMs <= timeoutMs;
  return {
    id: "performance.timeout",
    description: "Case completed within timeout budget",
    passed,
    expected: `<=${timeoutMs}ms`,
    actual: `${durationMs}ms`,
    explanation: passed
      ? "Within per-case timeout"
      : "Exceeded EVAL / case timeout",
    failureCategory: passed ? undefined : "TIMEOUT",
    critical: true,
  };
}
