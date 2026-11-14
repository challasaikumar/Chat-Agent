import type { ResearchClaim, ResearchSnapshot, ResearchSource } from "../../db/schema.js";

export type EvidenceProvenance = {
  sourcePublicationDate: string | null;
  claimedEffectiveDate: string | null;
  sourceRetrievalDate: string;
  snapshotCapturedDate: string;
  conversationDate: string | null;
};

export function buildProvenance(options: {
  claim?: ResearchClaim | null;
  source?: ResearchSource | null;
  snapshot?: ResearchSnapshot | null;
  conversationAt?: Date | null;
}): EvidenceProvenance {
  return {
    sourcePublicationDate:
      options.claim?.publishedAt?.toISOString() ??
      options.source?.publishedAt?.toISOString() ??
      null,
    claimedEffectiveDate: options.claim?.effectiveAt?.toISOString() ?? null,
    sourceRetrievalDate:
      options.claim?.observedAt?.toISOString() ??
      options.source?.retrievedAt?.toISOString() ??
      new Date(0).toISOString(),
    snapshotCapturedDate:
      options.snapshot?.capturedAt?.toISOString() ??
      options.claim?.observedAt?.toISOString() ??
      new Date(0).toISOString(),
    conversationDate: options.conversationAt?.toISOString() ?? null,
  };
}
