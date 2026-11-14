import type { ClaimEvidenceLinkResult } from "../evidence.types.js";
import { boundEvidenceExcerpt } from "../security/untrusted-content.js";
import { detectClaimSupport } from "./claim.support.detector.js";

export type MapperClaim = {
  id: string;
  statement: string;
  value?: string | null;
  attribute?: string | null;
  sourceId?: string | null;
  evidenceExcerpt?: string | null;
};

export type MapperSource = {
  id: string;
  url: string;
  content?: string | null;
  title?: string | null;
  userId: string;
};

/**
 * Map claims to evidence within persisted source excerpts.
 * Validates source association; never fabricates source references.
 */
export class ClaimEvidenceMapper {
  mapClaimToSources(input: {
    claim: MapperClaim;
    sources: MapperSource[];
    userId: string;
    maxSources?: number;
  }): ClaimEvidenceLinkResult[] {
    const links: ClaimEvidenceLinkResult[] = [];
    const maxSources = input.maxSources ?? 10;

    // Prefer the claim's original source first.
    const ordered = [...input.sources].sort((a, b) => {
      if (a.id === input.claim.sourceId) {
        return -1;
      }
      if (b.id === input.claim.sourceId) {
        return 1;
      }
      return 0;
    });

    for (const source of ordered.slice(0, maxSources)) {
      if (source.userId !== input.userId) {
        continue;
      }

      const excerptBase =
        input.claim.sourceId === source.id && input.claim.evidenceExcerpt
          ? input.claim.evidenceExcerpt
          : source.content ?? source.title ?? "";

      const detection = detectClaimSupport({
        claimStatement: input.claim.statement,
        claimValue: input.claim.value,
        claimAttribute: input.claim.attribute,
        excerpt: excerptBase,
      });

      links.push({
        claimId: input.claim.id,
        sourceId: source.id,
        relationship: detection.relationship,
        evidenceExcerpt: boundEvidenceExcerpt(detection.evidenceExcerpt),
        directness: detection.directness,
        confidence: detection.confidence,
        reasoningSummary: detection.reasoningSummary,
      });
    }

    return links;
  }
}
