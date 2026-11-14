import type { CorroborationResult } from "../corroboration/corroboration.types.js";
import type {
  FreshnessCategory,
  SourceAssessmentResult,
  SufficiencyStatus,
} from "../evidence.types.js";

export type SufficiencyInput = {
  claimCategory?: string | null;
  corroboration: CorroborationResult;
  assessments: SourceAssessmentResult[];
  minCorroborationSources: number;
  hasUnresolvedConflict: boolean;
};

/**
 * Distinguish:
 * - Confirmed by adequate available evidence
 * - No contradictory evidence found (≠ confirmed)
 * - Insufficient evidence available
 */
export function assessEvidenceSufficiency(
  input: SufficiencyInput,
): {
  status: SufficiencyStatus;
  reasons: string[];
} {
  const reasons: string[] = [];
  const { corroboration } = input;

  if (input.hasUnresolvedConflict || corroboration.agreement === "conflict") {
    reasons.push("unresolved_or_conflicting_evidence");
    return { status: "conflicting", reasons };
  }

  if (corroboration.supportingSourceIds.length === 0) {
    reasons.push("no_supporting_evidence");
    reasons.push("absence_of_contradiction_is_not_confirmation");
    return { status: "insufficient", reasons };
  }

  const supportingAssessments = input.assessments.filter((a) =>
    corroboration.supportingSourceIds.includes(a.sourceId),
  );
  const staleOnly =
    supportingAssessments.length > 0 &&
    supportingAssessments.every((a) =>
      isStaleOrUnknown(a.freshnessCategory),
    );
  if (staleOnly && (input.claimCategory === "pricing" || input.claimCategory === "availability")) {
    reasons.push("only_stale_or_undated_sources_for_volatile_claim");
    return { status: "insufficient", reasons };
  }

  if (corroboration.hasFirstPartySupport && corroboration.bestAuthorityScore >= 0.7) {
    reasons.push("first_party_authoritative_source_sufficient_for_claim_type");
    return { status: "sufficient", reasons };
  }

  if (
    corroboration.independentSupportingCount >= input.minCorroborationSources &&
    corroboration.bestAuthorityScore >= 0.45
  ) {
    reasons.push("independent_corroboration_met");
    return { status: "sufficient", reasons };
  }

  if (corroboration.supportingSourceIds.length > 0) {
    reasons.push("some_support_but_not_fully_sufficient");
    if (corroboration.independentSupportingCount < input.minCorroborationSources) {
      reasons.push("independent_corroboration_below_threshold");
    }
    return { status: "partially_sufficient", reasons };
  }

  reasons.push("insufficient_evidence");
  return { status: "insufficient", reasons };
}

function isStaleOrUnknown(category: FreshnessCategory): boolean {
  return category === "stale" || category === "unknown" || category === "aging";
}
