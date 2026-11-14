import type { ResearchClaim } from "../../db/schema.js";
import type { ConfidenceLevel, FeatureChangeType } from "../temporal.types.js";
import { normalizeEntityKey } from "../entities/entity-matcher.js";

export type FeatureComparisonItem = {
  changeType: FeatureChangeType;
  featureName: string;
  historicalClaimId: string | null;
  currentClaimId: string | null;
  confidence: ConfidenceLevel;
  reason: string;
  historicalValue: string | null;
  currentValue: string | null;
};

/**
 * Feature appearing only in current results is UNKNOWN unless the current
 * source explicitly identifies it as newly introduced after the baseline.
 */
export function compareFeatures(options: {
  historical: ResearchClaim[];
  current: ResearchClaim[];
  baselineDate: Date | null;
}): FeatureComparisonItem[] {
  const histFeatures = options.historical.filter(
    (c) => c.category === "feature" || c.category === "product_release",
  );
  const currFeatures = options.current.filter(
    (c) => c.category === "feature" || c.category === "product_release",
  );

  const items: FeatureComparisonItem[] = [];
  const histKeys = new Map(
    histFeatures.map((c) => [
      normalizeEntityKey(c.featureName ?? c.originalValue),
      c,
    ]),
  );
  const currKeys = new Map(
    currFeatures.map((c) => [
      normalizeEntityKey(c.featureName ?? c.originalValue),
      c,
    ]),
  );

  for (const [key, current] of currKeys) {
    const historical = histKeys.get(key);
    const explicitNew =
      /\b(launched|introduced|released|announced|new)\b/i.test(
        current.originalValue,
      ) || current.attribute === "feature_added";

    const datedAfterBaseline =
      options.baselineDate &&
      (current.effectiveAt ?? current.publishedAt) &&
      (current.effectiveAt ?? current.publishedAt)!.getTime() >
        options.baselineDate.getTime();

    if (!historical && explicitNew && datedAfterBaseline) {
      items.push({
        changeType: current.category === "product_release" ? "PRODUCT_RELEASED" : "FEATURE_ADDED",
        featureName: current.featureName ?? current.originalValue,
        historicalClaimId: null,
        currentClaimId: current.id,
        confidence: "HIGH",
        reason: "explicit_dated_introduction_after_baseline",
        historicalValue: null,
        currentValue: current.originalValue,
      });
    } else if (!historical && explicitNew && !datedAfterBaseline) {
      items.push({
        changeType: "UNKNOWN",
        featureName: current.featureName ?? current.originalValue,
        historicalClaimId: null,
        currentClaimId: current.id,
        confidence: "LOW",
        reason: "current_feature_without_dated_baseline_proof",
        historicalValue: null,
        currentValue: current.originalValue,
      });
    } else if (!historical) {
      items.push({
        changeType: "UNKNOWN",
        featureName: current.featureName ?? current.originalValue,
        historicalClaimId: null,
        currentClaimId: current.id,
        confidence: "INSUFFICIENT",
        reason: "present_now_missing_historical_baseline",
        historicalValue: null,
        currentValue: current.originalValue,
      });
    } else if (
      /\b(deprecated|removed)\b/i.test(current.originalValue) &&
      !/\b(deprecated|removed)\b/i.test(historical.originalValue)
    ) {
      items.push({
        changeType: /\bdeprecated\b/i.test(current.originalValue)
          ? "FEATURE_DEPRECATED"
          : "FEATURE_REMOVED",
        featureName: current.featureName ?? current.originalValue,
        historicalClaimId: historical.id,
        currentClaimId: current.id,
        confidence: "HIGH",
        reason: "explicit_removal_or_deprecation",
        historicalValue: historical.originalValue,
        currentValue: current.originalValue,
      });
    } else if (
      /\b(improved|enhanced|upgraded)\b/i.test(current.originalValue)
    ) {
      items.push({
        changeType: "FEATURE_IMPROVED",
        featureName: current.featureName ?? current.originalValue,
        historicalClaimId: historical.id,
        currentClaimId: current.id,
        confidence: "MEDIUM",
        reason: "explicit_improvement_language",
        historicalValue: historical.originalValue,
        currentValue: current.originalValue,
      });
    } else {
      items.push({
        changeType: "NO_DETECTED_CHANGE",
        featureName: current.featureName ?? current.originalValue,
        historicalClaimId: historical.id,
        currentClaimId: current.id,
        confidence: "MEDIUM",
        reason: "feature_present_in_both_baselines",
        historicalValue: historical.originalValue,
        currentValue: current.originalValue,
      });
    }
  }

  for (const [key, historical] of histKeys) {
    if (currKeys.has(key)) {
      continue;
    }
    if (/\b(deprecated|removed)\b/i.test(historical.originalValue)) {
      continue;
    }
    items.push({
      changeType: "UNKNOWN",
      featureName: historical.featureName ?? historical.originalValue,
      historicalClaimId: historical.id,
      currentClaimId: null,
      confidence: "LOW",
      reason: "historical_feature_absent_from_current_evidence",
      historicalValue: historical.originalValue,
      currentValue: null,
    });
  }

  return items;
}
