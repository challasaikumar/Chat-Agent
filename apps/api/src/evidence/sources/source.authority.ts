import type { ClaimCategory } from "../../db/schema.js";
import type {
  PublisherRelationship,
  SourceType,
} from "../evidence.types.js";

/**
 * Authority is claim-category relative — never a universal domain reputation score.
 * Heuristic 0–1 values are suitability hints, not probabilities.
 */
export function scoreAuthorityForClaim(input: {
  sourceType: SourceType;
  publisherRelationship: PublisherRelationship;
  claimCategory?: ClaimCategory | null;
}): { authorityScore: number; relevanceScore: number; reasons: string[] } {
  const reasons: string[] = [];
  const category = input.claimCategory ?? "other";
  let authority = 0.35;
  let relevance = 0.4;

  const matrix: Partial<
    Record<ClaimCategory, Partial<Record<SourceType, number>>>
  > = {
    pricing: {
      official_pricing: 0.95,
      official_documentation: 0.7,
      official_announcement: 0.55,
      specialist_publication: 0.45,
      established_news: 0.4,
      independent_analysis: 0.4,
      community_discussion: 0.2,
      user_generated_content: 0.15,
    },
    product_release: {
      official_changelog: 0.95,
      official_announcement: 0.9,
      official_documentation: 0.7,
      established_news: 0.55,
      specialist_publication: 0.5,
      community_discussion: 0.25,
    },
    feature: {
      official_documentation: 0.9,
      official_changelog: 0.85,
      official_announcement: 0.75,
      specialist_publication: 0.5,
      independent_analysis: 0.45,
      community_discussion: 0.3,
    },
    policy: {
      government_or_regulatory: 0.95,
      official_documentation: 0.8,
      official_announcement: 0.7,
      established_news: 0.5,
    },
    availability: {
      official_announcement: 0.85,
      official_documentation: 0.8,
      official_pricing: 0.6,
      established_news: 0.5,
      community_discussion: 0.35,
    },
    limit: {
      official_documentation: 0.9,
      official_pricing: 0.85,
      specialist_publication: 0.55,
    },
    plan: {
      official_pricing: 0.95,
      official_documentation: 0.8,
      official_announcement: 0.6,
    },
  };

  const byCategory = matrix[category];
  if (byCategory?.[input.sourceType] !== undefined) {
    authority = byCategory[input.sourceType]!;
    relevance = Math.min(1, authority + 0.05);
    reasons.push(`authority_for_${category}_from_${input.sourceType}`);
  } else if (input.sourceType !== "unknown") {
    authority = 0.45;
    relevance = 0.45;
    reasons.push(`generic_authority_for_${input.sourceType}`);
  } else {
    reasons.push("unknown_source_type_low_authority");
  }

  // Marketing pages are not automatically sufficient for independent performance claims.
  if (
    input.publisherRelationship === "first_party" &&
    (category === "feature" || category === "limit") &&
    input.sourceType === "official_announcement"
  ) {
    authority = Math.min(authority, 0.65);
    reasons.push("first_party_marketing_capped_for_independent_claims");
  }

  if (input.publisherRelationship === "first_party") {
    relevance = Math.min(1, relevance + 0.1);
    reasons.push("first_party_relevance_boost");
  } else if (input.publisherRelationship === "community") {
    authority = Math.min(authority, 0.35);
    reasons.push("community_authority_cap");
  }

  return {
    authorityScore: clamp01(authority),
    relevanceScore: clamp01(relevance),
    reasons,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
