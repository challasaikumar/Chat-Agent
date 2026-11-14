import type { TemporalComparisonView } from "../temporal.types.js";

export type EvaluationExpectation = {
  mustIncludeEntities?: string[];
  requiredChangeTypes?: string[];
  forbiddenChangeTypes?: string[];
  allowedVerdicts?: string[];
  requireHistoricalValues?: boolean;
};

export type EvaluationResult = {
  passed: boolean;
  failures: string[];
};

/**
 * Deterministic evaluator for challenge fixtures — does not call live APIs.
 */
export function evaluateTemporalComparison(
  view: TemporalComparisonView,
  expectation: EvaluationExpectation,
): EvaluationResult {
  const failures: string[] = [];

  if (expectation.allowedVerdicts?.length) {
    if (!expectation.allowedVerdicts.includes(view.verdict)) {
      failures.push(
        `Unexpected verdict ${view.verdict}; expected one of ${expectation.allowedVerdicts.join(",")}`,
      );
    }
  }

  if (expectation.mustIncludeEntities?.length) {
    const haystack = JSON.stringify(view).toLowerCase();
    for (const entity of expectation.mustIncludeEntities) {
      if (!haystack.includes(entity.toLowerCase())) {
        failures.push(`Missing entity mention: ${entity}`);
      }
    }
  }

  const changeTypes = new Set(view.items.map((i) => i.changeType));
  for (const required of expectation.requiredChangeTypes ?? []) {
    if (!changeTypes.has(required)) {
      failures.push(`Missing change type: ${required}`);
    }
  }
  for (const forbidden of expectation.forbiddenChangeTypes ?? []) {
    if (changeTypes.has(forbidden)) {
      failures.push(`Forbidden change type present: ${forbidden}`);
    }
  }

  if (expectation.requireHistoricalValues) {
    const withHist = view.items.filter((i) => i.historicalValue);
    if (withHist.length === 0) {
      failures.push("Expected at least one item with historical value");
    }
  }

  return { passed: failures.length === 0, failures };
}
