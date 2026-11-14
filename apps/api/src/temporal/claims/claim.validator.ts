import type { DraftClaim } from "./claim.types.js";

export function validateDraftClaim(
  claim: DraftClaim,
  minConfidence: number,
): { ok: true } | { ok: false; reason: string } {
  if (!claim.sourceId || !claim.snapshotId) {
    return { ok: false, reason: "missing_source_attribution" };
  }
  if (!claim.sourceUrl.startsWith("http")) {
    return { ok: false, reason: "invalid_source_url" };
  }
  if (!claim.evidenceExcerpt.trim()) {
    return { ok: false, reason: "missing_evidence_excerpt" };
  }
  if (claim.extractionConfidence < minConfidence) {
    return { ok: false, reason: "below_min_confidence" };
  }
  if (claim.verificationStatus === "rejected") {
    return { ok: false, reason: "rejected" };
  }
  if (claim.category === "pricing" && claim.numericValue) {
    if (!/^\d+(\.\d{2})?$/.test(claim.numericValue)) {
      return { ok: false, reason: "invalid_numeric_value" };
    }
  }
  return { ok: true };
}
