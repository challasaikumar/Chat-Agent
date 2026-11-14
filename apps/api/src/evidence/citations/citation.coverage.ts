import type { EvidenceRecord } from "../../agent/citations/citation.types.js";

export type CoverageGap = {
  claimId: string;
  statement: string;
  reason: string;
};

/**
 * Check that material factual assertions have appropriate citations.
 */
export function assessCitationCoverage(input: {
  materialClaims: Array<{ id: string; statement: string; requiresCitation: boolean }>;
  citedEvidenceIds: string[];
  registryRecords: EvidenceRecord[];
}): {
  coveredClaimIds: string[];
  gaps: CoverageGap[];
} {
  const cited = new Set(input.citedEvidenceIds);
  const hasAnyCitation = cited.size > 0 && input.registryRecords.some((r) => cited.has(r.evidenceId));
  const coveredClaimIds: string[] = [];
  const gaps: CoverageGap[] = [];

  for (const claim of input.materialClaims) {
    if (!claim.requiresCitation) {
      coveredClaimIds.push(claim.id);
      continue;
    }
    if (hasAnyCitation) {
      coveredClaimIds.push(claim.id);
    } else {
      gaps.push({
        claimId: claim.id,
        statement: claim.statement,
        reason: "material_claim_missing_citation",
      });
    }
  }

  return { coveredClaimIds, gaps };
}
