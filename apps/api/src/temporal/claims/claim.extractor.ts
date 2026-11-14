import type { ResearchSource } from "../../db/schema.js";
import { normalizePricingText } from "../pricing/pricing-normalizer.js";
import type { ExtractedClaimInput } from "../temporal.schemas.js";
import { claimContentHash } from "./claim.normalizer.js";
import type { DraftClaim } from "./claim.types.js";

/**
 * Deterministic heuristic claim extractor used for tests and as a fallback
 * when OpenAI extraction is unavailable. Never invents unsupported values.
 */
export class HeuristicClaimExtractor {
  extractFromSource(options: {
    source: ResearchSource;
    snapshotId: string;
    entityHint?: string | null;
    observedAt?: Date;
  }): DraftClaim[] {
    const text = `${options.source.title}\n${options.source.contentExcerpt}`;
    const claims: DraftClaim[] = [];
    const observedAt = options.observedAt ?? options.source.retrievedAt;

    const pricingClaims = extractPricingClaims(text, options.entityHint);
    for (const claim of pricingClaims) {
      claims.push(
        toDraft(claim, {
          source: options.source,
          snapshotId: options.snapshotId,
          observedAt,
        }),
      );
    }

    const featureClaims = extractFeatureClaims(text, options.entityHint);
    for (const claim of featureClaims) {
      claims.push(
        toDraft(claim, {
          source: options.source,
          snapshotId: options.snapshotId,
          observedAt,
        }),
      );
    }

    return claims;
  }
}

function extractPricingClaims(
  text: string,
  entityHint?: string | null,
): ExtractedClaimInput[] {
  const results: ExtractedClaimInput[] = [];
  const priceRe =
    /([A-Za-z][A-Za-z0-9 ._-]{1,40})?.{0,40}((?:USD|EUR|GBP|INR|\$|€|£|₹)\s?[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?\s?(?:USD|EUR|GBP|INR))(?:\s*(?:per\s+(?:month|year|user|seat|organization)|\/\s*(?:mo|month|year|user|seat)|monthly|annually))?/gi;

  let match: RegExpExecArray | null;
  while ((match = priceRe.exec(text)) !== null) {
    const snippet = match[0].trim();
    const normalized = normalizePricingText(snippet);
    if (!normalized.amount) {
      continue;
    }
    const entityName =
      (match[1]?.trim() || entityHint || detectNearbyEntity(text, match.index) || "Unknown").slice(
        0,
        200,
      );

    results.push({
      entityName,
      category: "pricing",
      attribute: "list_price",
      value: snippet,
      currency: normalized.currency,
      billingPeriod: normalized.billingPeriod,
      billingBasis: normalized.billingBasis,
      unit: normalized.unit,
      planName: normalized.planName,
      region: null,
      seatCount: normalized.seatCount,
      featureName: null,
      publishedAt: null,
      effectiveAt: null,
      evidenceExcerpt: snippet.slice(0, 500),
      extractionConfidence: normalized.billingPeriod === "unknown" ? 0.65 : 0.85,
    });
  }

  return results;
}

function extractFeatureClaims(
  text: string,
  entityHint?: string | null,
): ExtractedClaimInput[] {
  const results: ExtractedClaimInput[] = [];
  const featureRe =
    /\b(launched|introduced|released|announced|deprecated|removed)\b.{0,80}\b([A-Z][A-Za-z0-9 _-]{2,60})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = featureRe.exec(text)) !== null) {
    const verb = match[1]!.toLowerCase();
    const featureName = match[2]!.trim();
    const snippet = match[0].trim();
    results.push({
      entityName: entityHint ?? "Unknown",
      category: verb === "deprecated" || verb === "removed" ? "feature" : "product_release",
      attribute: verb === "deprecated" || verb === "removed" ? "feature_removed" : "feature_added",
      value: snippet,
      currency: null,
      billingPeriod: null,
      billingBasis: null,
      unit: null,
      planName: null,
      region: null,
      seatCount: null,
      featureName,
      publishedAt: null,
      effectiveAt: null,
      evidenceExcerpt: snippet.slice(0, 500),
      extractionConfidence: 0.7,
    });
  }
  return results;
}

function detectNearbyEntity(text: string, index: number): string | null {
  const window = text.slice(Math.max(0, index - 80), index);
  const known = [
    "HubSpot",
    "Salesforce",
    "Pipedrive",
    "Zoho",
    "Close",
    "Supabase",
    "Neon",
    "Railway",
    "Render",
    "Amazon RDS",
    "AWS RDS",
  ];
  for (const name of known) {
    if (new RegExp(name, "i").test(window)) {
      return name;
    }
  }
  return null;
}

function toDraft(
  claim: ExtractedClaimInput,
  meta: {
    source: ResearchSource;
    snapshotId: string;
    observedAt: Date;
  },
): DraftClaim {
  const pricing =
    claim.category === "pricing"
      ? normalizePricingText(claim.value, { planName: claim.planName })
      : null;

  return {
    entityId: null,
    entityName: claim.entityName,
    category: claim.category,
    attribute: claim.attribute,
    originalValue: claim.value,
    normalizedValue: pricing
      ? [pricing.amount, pricing.currency, pricing.billingPeriod, pricing.unit]
          .filter(Boolean)
          .join("|")
      : claim.value.toLowerCase(),
    numericValue: pricing?.amount ?? null,
    currency: claim.currency ?? pricing?.currency ?? null,
    billingPeriod: claim.billingPeriod ?? pricing?.billingPeriod ?? null,
    billingBasis: claim.billingBasis ?? pricing?.billingBasis ?? null,
    unit: claim.unit ?? pricing?.unit ?? null,
    planName: claim.planName ?? pricing?.planName ?? null,
    region: claim.region ?? null,
    seatCount: claim.seatCount ?? null,
    featureName: claim.featureName ?? null,
    sourceId: meta.source.id,
    snapshotId: meta.snapshotId,
    sourceUrl: meta.source.url,
    evidenceExcerpt: claim.evidenceExcerpt,
    contentHash: claimContentHash({
      sourceId: meta.source.id,
      attribute: claim.attribute,
      value: claim.value,
      planName: claim.planName,
    }),
    publishedAt: meta.source.publishedAt,
    effectiveAt: null,
    observedAt: meta.observedAt,
    extractionConfidence: claim.extractionConfidence,
    extractionModel: "heuristic",
    verificationStatus: "verified",
  };
}
