import type { ResearchClaim } from "../../db/schema.js";
import { normalizeEntityKey } from "../entities/entity-matcher.js";

export type PricingMatchability = {
  comparable: boolean;
  reason: string;
};

export function arePricingClaimsComparable(
  historical: ResearchClaim,
  current: ResearchClaim,
): PricingMatchability {
  if (!historical.numericValue || !current.numericValue) {
    return { comparable: false, reason: "missing_numeric_amount" };
  }
  if (!historical.currency || !current.currency) {
    return { comparable: false, reason: "missing_currency" };
  }
  if (historical.currency !== current.currency) {
    return {
      comparable: false,
      reason: "different_currency_no_fx_conversion",
    };
  }
  if (
    historical.billingPeriod &&
    current.billingPeriod &&
    historical.billingPeriod !== "unknown" &&
    current.billingPeriod !== "unknown" &&
    historical.billingPeriod !== current.billingPeriod
  ) {
    return { comparable: false, reason: "billing_period_mismatch" };
  }
  if (
    historical.unit &&
    current.unit &&
    historical.unit !== "unknown" &&
    current.unit !== "unknown" &&
    historical.unit !== current.unit
  ) {
    return { comparable: false, reason: "pricing_unit_mismatch" };
  }
  if (
    historical.planName &&
    current.planName &&
    normalizeEntityKey(historical.planName) !==
      normalizeEntityKey(current.planName)
  ) {
    return { comparable: false, reason: "plan_name_mismatch" };
  }
  if (
    (historical.originalValue + current.originalValue)
      .toLowerCase()
      .includes("promo") !==
      (historical.originalValue.toLowerCase().includes("promo") &&
        current.originalValue.toLowerCase().includes("promo")) &&
    (historical.originalValue.toLowerCase().includes("promo") ||
      current.originalValue.toLowerCase().includes("promo"))
  ) {
    // one promo one not
    if (
      historical.originalValue.toLowerCase().includes("promo") !==
      current.originalValue.toLowerCase().includes("promo")
    ) {
      return { comparable: false, reason: "promotional_vs_regular" };
    }
  }

  return { comparable: true, reason: "matched_currency_period_unit_plan" };
}

export function sameEntityClaim(
  a: ResearchClaim,
  b: ResearchClaim,
): boolean {
  if (a.entityId && b.entityId) {
    return a.entityId === b.entityId;
  }
  // entity names aren't on ResearchClaim - use plan/feature heuristics via normalized value prefix
  return a.attribute === b.attribute;
}
