import type { ResearchClaim } from "../../db/schema.js";
import { normalizeEntityKey } from "../entities/entity-matcher.js";
import { comparePricingClaims } from "../pricing/pricing-calculator.js";
import { findConflictingPricingClaims } from "./comparison.conflicts.js";
import { compareFeatures } from "./comparison.features.js";
import type {
  ComparisonEngineResult,
  ComparisonItemResult,
} from "./comparison.types.js";
import type { ConfidenceLevel, ComparisonVerdict } from "../temporal.types.js";

function entityKey(claim: ResearchClaim): string {
  return normalizeEntityKey(claim.entityName);
}

function assessConfidence(items: ComparisonItemResult[]): ConfidenceLevel {
  if (items.length === 0) {
    return "INSUFFICIENT";
  }
  if (items.some((i) => i.changeType === "CONFLICTING_EVIDENCE")) {
    return "LOW";
  }
  if (items.every((i) => i.confidence === "HIGH")) {
    return "HIGH";
  }
  if (items.some((i) => i.confidence === "INSUFFICIENT")) {
    return "LOW";
  }
  if (items.some((i) => i.confidence === "LOW")) {
    return "MEDIUM";
  }
  return "MEDIUM";
}

function verdictFrom(
  items: ComparisonItemResult[],
  historicalCount: number,
): ComparisonVerdict {
  if (historicalCount === 0) {
    return "INSUFFICIENT_HISTORICAL_EVIDENCE";
  }
  if (items.some((i) => i.changeType === "CONFLICTING_EVIDENCE")) {
    return "CONFLICTING_INFORMATION";
  }
  if (
    items.some((i) =>
      [
        "PRICE_INCREASED",
        "PRICE_DECREASED",
        "FEATURE_ADDED",
        "FEATURE_REMOVED",
        "PRODUCT_RELEASED",
        "FEATURE_DEPRECATED",
      ].includes(i.changeType),
    )
  ) {
    return "CONFIRMED_CHANGE";
  }
  if (items.some((i) => i.changeType === "NOT_COMPARABLE")) {
    return "NOT_COMPARABLE";
  }
  if (
    items.some((i) =>
      ["UNKNOWN", "PRICE_STRUCTURE_CHANGED", "PLAN_CHANGED"].includes(
        i.changeType,
      ),
    )
  ) {
    return "POSSIBLE_CHANGE";
  }
  if (
    items.every((i) =>
      ["PRICE_UNCHANGED", "NO_DETECTED_CHANGE"].includes(i.changeType),
    )
  ) {
    return "SUPPORTED_NO_CHANGE";
  }
  return "POSSIBLE_CHANGE";
}

export class ComparisonEngine {
  compare(options: {
    historical: ResearchClaim[];
    current: ResearchClaim[];
    baselineDate: Date | null;
  }): ComparisonEngineResult {
    const items: ComparisonItemResult[] = [];

    const currentConflicts = findConflictingPricingClaims(options.current);
    for (const group of currentConflicts) {
      items.push({
        attribute: "list_price",
        category: "pricing",
        historicalClaimId: null,
        currentClaimId: group[0]?.id ?? null,
        changeType: "CONFLICTING_EVIDENCE",
        historicalValue: null,
        currentValue: group.map((c) => c.originalValue).join(" | "),
        absoluteDifference: null,
        percentageDifference: null,
        currency: group[0]?.currency ?? null,
        billingPeriod: group[0]?.billingPeriod ?? null,
        confidence: "INSUFFICIENT",
        evidenceMetadata: {
          conflictClaimIds: group.map((c) => c.id),
        },
      });
    }

    const histPricing = options.historical.filter((c) => c.category === "pricing");
    const currPricing = options.current.filter((c) => c.category === "pricing");

    for (const historical of histPricing) {
      const candidates = currPricing.filter(
        (c) => entityKey(c) === entityKey(historical),
      );
      if (candidates.length === 0) {
        items.push({
          attribute: historical.attribute,
          category: "pricing",
          historicalClaimId: historical.id,
          currentClaimId: null,
          changeType: "UNKNOWN",
          historicalValue: historical.originalValue,
          currentValue: null,
          absoluteDifference: null,
          percentageDifference: null,
          currency: historical.currency,
          billingPeriod: historical.billingPeriod,
          confidence: "INSUFFICIENT",
          evidenceMetadata: { reason: "missing_current_pricing_claim" },
        });
        continue;
      }

      // Prefer same plan + billing
      const best =
        candidates.find(
          (c) =>
            (c.planName ?? "") === (historical.planName ?? "") &&
            (c.billingPeriod ?? "") === (historical.billingPeriod ?? ""),
        ) ?? candidates[0]!;

      const priced = comparePricingClaims(historical, best);
      items.push({
        attribute: historical.attribute,
        category: "pricing",
        historicalClaimId: historical.id,
        currentClaimId: best.id,
        changeType: priced.changeType,
        historicalValue: historical.originalValue,
        currentValue: best.originalValue,
        absoluteDifference: priced.absoluteDifference,
        percentageDifference: priced.percentageDifference,
        currency: historical.currency ?? best.currency,
        billingPeriod: historical.billingPeriod ?? best.billingPeriod,
        confidence: priced.confidence,
        evidenceMetadata: { reason: priced.reason },
      });
    }

    const featureItems = compareFeatures({
      historical: options.historical,
      current: options.current,
      baselineDate: options.baselineDate,
    });
    for (const feature of featureItems) {
      items.push({
        attribute: "feature",
        category: "feature",
        historicalClaimId: feature.historicalClaimId,
        currentClaimId: feature.currentClaimId,
        changeType: feature.changeType,
        historicalValue: feature.historicalValue,
        currentValue: feature.currentValue,
        absoluteDifference: null,
        percentageDifference: null,
        currency: null,
        billingPeriod: null,
        confidence: feature.confidence,
        evidenceMetadata: {
          featureName: feature.featureName,
          reason: feature.reason,
        },
      });
    }

    const confidence = assessConfidence(items);
    const verdict = verdictFrom(items, options.historical.length);

    let status: ComparisonEngineResult["status"] = "completed";
    if (options.historical.length === 0) {
      status = "insufficient_evidence";
    } else if (items.some((i) => i.changeType === "CONFLICTING_EVIDENCE")) {
      status = "conflicting_evidence";
    } else if (
      items.some((i) =>
        ["UNKNOWN", "NOT_COMPARABLE", "INSUFFICIENT"].includes(i.changeType) ||
        i.confidence === "INSUFFICIENT",
      )
    ) {
      status = "partially_completed";
    }

    const summary = buildSummary(verdict, items);

    return {
      status,
      confidence,
      verdict,
      resultSummary: summary,
      items,
    };
  }
}

function buildSummary(
  verdict: ComparisonVerdict,
  items: ComparisonItemResult[],
): string {
  const changes = items.filter((i) =>
    [
      "PRICE_INCREASED",
      "PRICE_DECREASED",
      "FEATURE_ADDED",
      "FEATURE_REMOVED",
      "PRODUCT_RELEASED",
    ].includes(i.changeType),
  );
  const unchanged = items.filter((i) =>
    ["PRICE_UNCHANGED", "NO_DETECTED_CHANGE"].includes(i.changeType),
  );
  return [
    `Verdict: ${verdict}.`,
    `${changes.length} confirmed change(s).`,
    `${unchanged.length} supported no-change item(s).`,
    items.length === 0
      ? "No comparable claims were available."
      : "Numeric differences were calculated by the backend comparison engine.",
  ].join(" ");
}
