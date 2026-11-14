import type { ExpectedSpec } from "../evaluation.schemas.js";
import type { GradeAssertion } from "../evaluation.types.js";

export type ToolUsageObservation = {
  searchCallCount: number;
  toolCallCount: number;
  maxSearches?: number;
};

export function gradeToolUsage(
  expected: ExpectedSpec,
  observed: ToolUsageObservation,
): { assertions: GradeAssertion[]; metrics: Record<string, number | null> } {
  const assertions: GradeAssertion[] = [];

  if (expected.mustSearch === true) {
    assertions.push({
      id: "tool.mustSearch",
      description: "web_search should be invoked",
      passed: observed.searchCallCount > 0,
      expected: ">0 searches",
      actual: observed.searchCallCount,
      explanation:
        observed.searchCallCount > 0
          ? "Search invoked as expected"
          : "Missed required search",
      failureCategory: "SEARCH_DECISION_FAILURE",
      critical: true,
    });
  }

  if (expected.mustNotSearch === true) {
    assertions.push({
      id: "tool.mustNotSearch",
      description: "web_search should not be invoked",
      passed: observed.searchCallCount === 0,
      expected: 0,
      actual: observed.searchCallCount,
      explanation:
        observed.searchCallCount === 0
          ? "No unnecessary search"
          : "Unnecessary search performed",
      failureCategory: "SEARCH_DECISION_FAILURE",
      critical: true,
    });
  }

  if (expected.maxSearchCalls != null) {
    assertions.push({
      id: "tool.maxSearch",
      description: "Search budget compliance",
      passed: observed.searchCallCount <= expected.maxSearchCalls,
      expected: `<=${expected.maxSearchCalls}`,
      actual: observed.searchCallCount,
      explanation:
        observed.searchCallCount <= expected.maxSearchCalls
          ? "Within search budget"
          : "Exceeded max search calls",
      failureCategory: "TOOL_EXECUTION_FAILURE",
      critical: true,
    });
  }

  const correctSearchDecision =
    expected.mustSearch === true
      ? observed.searchCallCount > 0
        ? 1
        : 0
      : expected.mustNotSearch === true
        ? observed.searchCallCount === 0
          ? 1
          : 0
        : null;

  return {
    assertions,
    metrics: {
      searchCallCount: observed.searchCallCount,
      toolCallCount: observed.toolCallCount,
      correctSearchDecision,
      unnecessarySearch:
        expected.mustNotSearch === true && observed.searchCallCount > 0 ? 1 : 0,
      missedSearch:
        expected.mustSearch === true && observed.searchCallCount === 0 ? 1 : 0,
    },
  };
}
