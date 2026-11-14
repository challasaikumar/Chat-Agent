import { DateIntentParser } from "../../agent/context/context.date-parser.js";
import { TemporalIntentParser } from "../../temporal/intent/temporal-intent.parser.js";
import {
  evaluateTemporalComparison,
} from "../../temporal/evaluation/temporal.evaluator.js";
import type { TemporalComparisonView } from "../../temporal/temporal.types.js";
import type { ExpectedSpec } from "../evaluation.schemas.js";
import type { GradeAssertion } from "../evaluation.types.js";
import { assertEqual } from "./deterministic.grader.js";

export function gradeTemporalDateResolution(
  message: string,
  expected: ExpectedSpec,
  now: Date,
  timeZone: string,
): GradeAssertion[] {
  const assertions: GradeAssertion[] = [];
  const dateIntent = new DateIntentParser().parse(message, { timeZone, now });
  const temporalIntent = new TemporalIntentParser().parse(message, {
    timeZone,
    now,
  });

  if (expected.historicalDate) {
    const resolved =
      (dateIntent && "date" in dateIntent ? dateIntent.date : undefined) ??
      temporalIntent.startDate ??
      null;
    assertions.push(
      assertEqual(
        "temporal.historicalDate",
        "Resolved historical calendar date",
        expected.historicalDate,
        resolved,
        { failureCategory: "WRONG_DATE" },
      ),
    );
  }

  if (expected.resolvedWeekday) {
    assertions.push(
      assertEqual(
        "temporal.weekday",
        "Resolved relative weekday date",
        expected.resolvedWeekday,
        temporalIntent.startDate ??
          (dateIntent && "date" in dateIntent ? dateIntent.date : null),
        { failureCategory: "WRONG_DATE" },
      ),
    );
  }

  return assertions;
}

export function gradeTemporalComparisonView(
  view: TemporalComparisonView | null | undefined,
  expected: ExpectedSpec,
): GradeAssertion[] {
  if (!view) {
    return [
      {
        id: "temporal.view",
        description: "Temporal comparison view produced",
        passed: false,
        expected: "TemporalComparisonView",
        actual: null,
        explanation: "No comparison view returned",
        failureCategory: "TEMPORAL_COMPARISON_FAILURE",
        critical: true,
      },
    ];
  }

  const evaluation = evaluateTemporalComparison(view, {
    mustIncludeEntities: expected.entities,
    requiredChangeTypes: expected.changeTypes,
    forbiddenChangeTypes: expected.forbiddenChangeTypes,
    requireHistoricalValues: true,
  });

  const assertions: GradeAssertion[] = evaluation.failures.map((failure, i) => ({
    id: `temporal.view.${i}`,
    description: failure,
    passed: false,
    expected: expected,
    actual: {
      verdict: view.verdict,
      changeTypes: view.items.map((x) => x.changeType),
    },
    explanation: failure,
    failureCategory: "TEMPORAL_COMPARISON_FAILURE",
    critical: true,
  }));

  if (evaluation.passed) {
    assertions.push({
      id: "temporal.view.pass",
      description: "Temporal comparison expectations met",
      passed: true,
      expected: expected.changeTypes ?? [],
      actual: view.items.map((x) => x.changeType),
      explanation: "All temporal expectations satisfied",
      critical: true,
    });
  }

  return assertions;
}
