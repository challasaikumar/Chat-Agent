import { createHash } from "node:crypto";
import { normalizePricingText } from "../pricing/pricing-normalizer.js";
import type { ExtractedClaimInput } from "../temporal.schemas.js";
import type { DraftClaim } from "./claim.types.js";

export function claimContentHash(parts: {
  sourceId: string;
  attribute: string;
  value: string;
  planName?: string | null;
}): string {
  return createHash("sha256")
    .update(
      [parts.sourceId, parts.attribute, parts.value, parts.planName ?? ""].join(
        "|",
      ),
    )
    .digest("hex")
    .slice(0, 32);
}

export function normalizeExtractedClaim(
  claim: ExtractedClaimInput,
  meta: {
    sourceId: string;
    snapshotId: string;
    sourceUrl: string;
    observedAt: Date;
    publishedAt: Date | null;
    entityId: string | null;
    extractionModel: string | null;
  },
): DraftClaim {
  const pricing =
    claim.category === "pricing"
      ? normalizePricingText(claim.value, {
          planName: claim.planName,
          seatCount: claim.seatCount ?? null,
        })
      : null;

  const excerpt = claim.evidenceExcerpt.trim();
  const supported =
    excerpt.length > 0 &&
    (excerpt.toLowerCase().includes(claim.value.toLowerCase().slice(0, 12)) ||
      (pricing?.amount !== null &&
        pricing?.amount !== undefined &&
        excerpt.includes(pricing.amount.split(".")[0]!)) ||
      (claim.featureName
        ? excerpt.toLowerCase().includes(claim.featureName.toLowerCase())
        : false) ||
      excerpt.toLowerCase().includes(claim.entityName.toLowerCase()));

  return {
    entityId: meta.entityId,
    entityName: claim.entityName.trim(),
    category: claim.category,
    attribute: claim.attribute.trim(),
    originalValue: claim.value.trim(),
    normalizedValue: pricing
      ? [
          pricing.amount,
          pricing.currency,
          pricing.billingPeriod,
          pricing.unit,
          pricing.planName,
        ]
          .filter(Boolean)
          .join("|")
      : claim.value.trim().toLowerCase(),
    numericValue: pricing?.amount ?? null,
    currency: claim.currency ?? pricing?.currency ?? null,
    billingPeriod: claim.billingPeriod ?? pricing?.billingPeriod ?? null,
    billingBasis: claim.billingBasis ?? pricing?.billingBasis ?? null,
    unit: claim.unit ?? pricing?.unit ?? null,
    planName: claim.planName ?? pricing?.planName ?? null,
    region: claim.region ?? null,
    seatCount: claim.seatCount ?? pricing?.seatCount ?? null,
    featureName: claim.featureName ?? null,
    sourceId: meta.sourceId,
    snapshotId: meta.snapshotId,
    sourceUrl: meta.sourceUrl,
    evidenceExcerpt: excerpt.slice(0, 2000),
    contentHash: claimContentHash({
      sourceId: meta.sourceId,
      attribute: claim.attribute,
      value: claim.value,
      planName: claim.planName,
    }),
    publishedAt: claim.publishedAt
      ? safeDate(claim.publishedAt) ?? meta.publishedAt
      : meta.publishedAt,
    effectiveAt: claim.effectiveAt ? safeDate(claim.effectiveAt) : null,
    observedAt: meta.observedAt,
    extractionConfidence: claim.extractionConfidence,
    extractionModel: meta.extractionModel,
    verificationStatus: supported ? "verified" : "unverified",
  };
}

function safeDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
