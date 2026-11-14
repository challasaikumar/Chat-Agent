import type { ResearchClaim } from "../../db/schema.js";
import type { ConfidenceLevel, PricingChangeType } from "../temporal.types.js";
import {
  compareDecimal,
  decimalPercentageChange,
  decimalSubtract,
} from "../comparison/comparison.numeric.js";
import { arePricingClaimsComparable } from "./pricing-matcher.js";

export type PricingComparisonResult = {
  changeType: PricingChangeType;
  absoluteDifference: string | null;
  percentageDifference: string | null;
  confidence: ConfidenceLevel;
  reason: string;
};

export function comparePricingClaims(
  historical: ResearchClaim,
  current: ResearchClaim,
): PricingComparisonResult {
  const match = arePricingClaimsComparable(historical, current);
  if (!match.comparable) {
    return {
      changeType:
        match.reason === "promotional_vs_regular"
          ? "PROMOTION_CHANGED"
          : match.reason === "plan_name_mismatch"
            ? "PLAN_CHANGED"
            : match.reason === "billing_period_mismatch" ||
                match.reason === "pricing_unit_mismatch"
              ? "PRICE_STRUCTURE_CHANGED"
              : "NOT_COMPARABLE",
      absoluteDifference: null,
      percentageDifference: null,
      confidence: "MEDIUM",
      reason: match.reason,
    };
  }

  const cmp = compareDecimal(current.numericValue!, historical.numericValue!);
  if (cmp === null) {
    return {
      changeType: "UNKNOWN",
      absoluteDifference: null,
      percentageDifference: null,
      confidence: "LOW",
      reason: "invalid_decimal",
    };
  }

  const absoluteDifference = decimalSubtract(
    current.numericValue!,
    historical.numericValue!,
  );
  const percentageDifference = decimalPercentageChange(
    current.numericValue!,
    historical.numericValue!,
  );

  if (cmp === 0) {
    return {
      changeType: "PRICE_UNCHANGED",
      absoluteDifference: absoluteDifference ?? "0.00",
      percentageDifference: "0.00",
      confidence: "HIGH",
      reason: "equal_comparable_amounts",
    };
  }

  return {
    changeType: cmp > 0 ? "PRICE_INCREASED" : "PRICE_DECREASED",
    absoluteDifference,
    percentageDifference,
    confidence: "HIGH",
    reason: "comparable_numeric_delta",
  };
}
