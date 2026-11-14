import { comparePricingClaims } from "../../temporal/pricing/pricing-calculator.js";
import type { ResearchClaim } from "../../db/schema.js";
import type { ExpectedSpec } from "../evaluation.schemas.js";
import type { GradeAssertion } from "../evaluation.types.js";
import { assertDecimalClose, assertEqual } from "./deterministic.grader.js";

export function gradePricingComparisons(
  expected: ExpectedSpec,
  claims: ResearchClaim[],
): GradeAssertion[] {
  const assertions: GradeAssertion[] = [];
  const comparisons = expected.priceComparisons ?? [];
  if (comparisons.length === 0) return assertions;

  for (const [i, spec] of comparisons.entries()) {
    const historical = claims.find(
      (c) =>
        c.entityName.toLowerCase() === spec.entity.toLowerCase() &&
        c.numericValue === spec.historicalValue &&
        (!spec.planName ||
          (c.planName ?? "").toLowerCase() === spec.planName.toLowerCase()),
    );
    const current = claims.find(
      (c) =>
        c.entityName.toLowerCase() === spec.entity.toLowerCase() &&
        c.numericValue === spec.currentValue &&
        (!spec.planName ||
          (c.planName ?? "").toLowerCase() === spec.planName.toLowerCase()),
    );

    if (!historical || !current) {
      assertions.push({
        id: `pricing.pair.${i}`,
        description: `Find historical/current claims for ${spec.entity}`,
        passed: false,
        expected: spec,
        actual: {
          historicalFound: Boolean(historical),
          currentFound: Boolean(current),
        },
        explanation: "Missing seeded claim pair for pricing comparison",
        failureCategory: "ENTITY_MATCH_FAILURE",
        critical: true,
      });
      continue;
    }

    const result = comparePricingClaims(historical, current);

    if (spec.changeType) {
      assertions.push(
        assertEqual(
          `pricing.changeType.${i}`,
          `Change type for ${spec.entity}`,
          spec.changeType,
          result.changeType,
          { failureCategory: "TEMPORAL_COMPARISON_FAILURE" },
        ),
      );
    }

    if (spec.absoluteDifference != null) {
      assertions.push(
        assertDecimalClose(
          `pricing.abs.${i}`,
          `Absolute price delta for ${spec.entity}`,
          spec.absoluteDifference,
          result.absoluteDifference,
          0.01,
        ),
      );
    }

    if (spec.percentageDifference != null) {
      assertions.push(
        assertDecimalClose(
          `pricing.pct.${i}`,
          `Percentage price delta for ${spec.entity}`,
          spec.percentageDifference,
          result.percentageDifference,
          0.05,
        ),
      );
    }
  }

  return assertions;
}
