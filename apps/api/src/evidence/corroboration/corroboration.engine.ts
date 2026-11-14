import { countIndependentSupporters } from "../sources/source.independence.js";
import type {
  CorroborationInput,
  CorroborationResult,
} from "./corroboration.types.js";

/**
 * Determine whether multiple sources provide genuinely independent support.
 * Do not force agreement; do not fabricate evidence.
 */
export function evaluateCorroboration(
  input: CorroborationInput,
): CorroborationResult {
  const supporting = input.links.filter(
    (link) =>
      link.relationship === "supports" ||
      link.relationship === "partially_supports",
  );
  const contradicting = input.links.filter(
    (link) => link.relationship === "contradicts",
  );

  const supportingSourceIds = [...new Set(supporting.map((l) => l.sourceId))];
  const contradictingSourceIds = [
    ...new Set(contradicting.map((l) => l.sourceId)),
  ];

  const independentSupportingCount = countIndependentSupporters(
    supportingSourceIds,
    input.relationships,
  );

  const assessmentBySource = new Map(
    input.assessments.map((a) => [a.sourceId, a]),
  );

  let bestAuthorityScore = 0;
  let hasFirstPartySupport = false;
  for (const sourceId of supportingSourceIds) {
    const assessment = assessmentBySource.get(sourceId);
    if (!assessment) {
      continue;
    }
    bestAuthorityScore = Math.max(
      bestAuthorityScore,
      assessment.authorityScore,
    );
    if (assessment.publisherRelationship === "first_party") {
      hasFirstPartySupport = true;
    }
  }

  let agreement: CorroborationResult["agreement"] = "none";
  if (supportingSourceIds.length > 0 && contradictingSourceIds.length > 0) {
    agreement = "conflict";
  } else if (
    supporting.some((l) => l.relationship === "supports") &&
    contradictingSourceIds.length === 0
  ) {
    agreement = "agree";
  } else if (supportingSourceIds.length > 0) {
    agreement = "partial";
  }

  const summaryParts = [
    `independent_supporters=${independentSupportingCount}`,
    `raw_supporters=${supportingSourceIds.length}`,
    `contradictors=${contradictingSourceIds.length}`,
    `best_authority=${bestAuthorityScore.toFixed(2)}`,
    hasFirstPartySupport ? "first_party_support" : "no_first_party_support",
  ];

  if (
    independentSupportingCount < input.minCorroborationSources &&
    !hasFirstPartySupport
  ) {
    summaryParts.push("below_default_corroboration_threshold");
  }
  if (hasFirstPartySupport) {
    summaryParts.push(
      "first_party_may_suffice_for_own_published_facts",
    );
  }

  return {
    claimId: input.claimId,
    supportingSourceIds,
    contradictingSourceIds,
    independentSupportingCount,
    bestAuthorityScore,
    hasFirstPartySupport,
    agreement,
    summary: summaryParts.join("; "),
  };
}
