import type { Env } from "../config/env.js";
import type { ClaimCategory } from "../db/schema.js";

export type EvidenceConfig = {
  enabled: boolean;
  maxSourcesPerClaim: number;
  maxClaimsPerRun: number;
  maxContentLength: number;
  minDirectness: number;
  minCorroborationSources: number;
  maxVerificationTimeMs: number;
  cacheEnabled: boolean;
  cacheTtlHours: number;
};

export function evidenceConfigFromEnv(env: Env): EvidenceConfig {
  return {
    enabled: env.EVIDENCE_VERIFICATION_ENABLED,
    maxSourcesPerClaim: env.EVIDENCE_MAX_SOURCES_PER_CLAIM,
    maxClaimsPerRun: env.EVIDENCE_MAX_CLAIMS_PER_RUN,
    maxContentLength: env.EVIDENCE_MAX_CONTENT_LENGTH,
    minDirectness: env.EVIDENCE_MIN_DIRECTNESS,
    minCorroborationSources: env.EVIDENCE_MIN_CORROBORATION_SOURCES,
    maxVerificationTimeMs: env.EVIDENCE_MAX_VERIFICATION_TIME_MS,
    cacheEnabled: env.EVIDENCE_CACHE_ENABLED,
    cacheTtlHours: env.EVIDENCE_CACHE_TTL_HOURS,
  };
}

/** Claim-category freshness windows (days). Heuristic policy, not calibrated. */
export const FRESHNESS_POLICY_DAYS: Record<
  ClaimCategory | "default",
  { current: number; recent: number; aging: number }
> = {
  pricing: { current: 14, recent: 45, aging: 120 },
  plan: { current: 30, recent: 90, aging: 180 },
  feature: { current: 60, recent: 180, aging: 365 },
  product_release: { current: 30, recent: 90, aging: 365 },
  policy: { current: 90, recent: 180, aging: 540 },
  availability: { current: 7, recent: 30, aging: 90 },
  limit: { current: 30, recent: 90, aging: 180 },
  other: { current: 60, recent: 180, aging: 540 },
  default: { current: 60, recent: 180, aging: 540 },
};

/**
 * Known domain metadata for conservative official-source hints.
 * Never grants universal trust — suitability still depends on claim category.
 */
export const KNOWN_DOMAIN_METADATA: Record<
  string,
  {
    publisher?: string;
    relationship?: "first_party" | "government" | "news" | "community";
    notes?: string;
  }
> = {
  "docs.github.com": { publisher: "GitHub", relationship: "first_party" },
  "github.com": { publisher: "GitHub", relationship: "first_party" },
  "stripe.com": { publisher: "Stripe", relationship: "first_party" },
  "docs.stripe.com": { publisher: "Stripe", relationship: "first_party" },
  "aws.amazon.com": { publisher: "AWS", relationship: "first_party" },
  "docs.aws.amazon.com": { publisher: "AWS", relationship: "first_party" },
  "cloud.google.com": { publisher: "Google Cloud", relationship: "first_party" },
  "azure.microsoft.com": { publisher: "Microsoft Azure", relationship: "first_party" },
  "hubspot.com": { publisher: "HubSpot", relationship: "first_party" },
  "salesforce.com": { publisher: "Salesforce", relationship: "first_party" },
  "zoho.com": { publisher: "Zoho", relationship: "first_party" },
  "pipedrive.com": { publisher: "Pipedrive", relationship: "first_party" },
  "freshworks.com": { publisher: "Freshworks", relationship: "first_party" },
  "neon.tech": { publisher: "Neon", relationship: "first_party" },
  "supabase.com": { publisher: "Supabase", relationship: "first_party" },
  "railway.app": { publisher: "Railway", relationship: "first_party" },
  "render.com": { publisher: "Render", relationship: "first_party" },
  "heroku.com": { publisher: "Heroku", relationship: "first_party" },
  "gov": { relationship: "government", notes: "TLD hint only" },
  "reddit.com": { relationship: "community" },
  "news.ycombinator.com": { relationship: "community" },
  "medium.com": { relationship: "community" },
  "dev.to": { relationship: "community" },
  "stackoverflow.com": { relationship: "community" },
  "reuters.com": { relationship: "news", publisher: "Reuters" },
  "bloomberg.com": { relationship: "news", publisher: "Bloomberg" },
  "techcrunch.com": { relationship: "news", publisher: "TechCrunch" },
  "theverge.com": { relationship: "news", publisher: "The Verge" },
};
