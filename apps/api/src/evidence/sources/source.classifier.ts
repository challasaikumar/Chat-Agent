import type { ClaimCategory } from "../../db/schema.js";
import type {
  PublisherRelationship,
  SourceType,
} from "../evidence.types.js";
import { resolveDomain } from "./source.domain-resolver.js";

export type ClassificationInput = {
  url: string;
  title?: string | null;
  content?: string | null;
  claimCategory?: ClaimCategory | null;
  entityName?: string | null;
};

export type SourceClassification = {
  sourceType: SourceType;
  publisherRelationship: PublisherRelationship;
  reasons: string[];
};

export function classifySource(input: ClassificationInput): SourceClassification {
  const domainInfo = resolveDomain(input.url);
  const path = safePath(input.url).toLowerCase();
  const title = (input.title ?? "").toLowerCase();
  const content = (input.content ?? "").slice(0, 4000).toLowerCase();
  const blob = `${path} ${title} ${content}`;
  const reasons: string[] = [];

  let sourceType: SourceType = "unknown";
  let publisherRelationship: PublisherRelationship = "unknown";

  if (domainInfo.knownRelationship === "government") {
    sourceType = "government_or_regulatory";
    publisherRelationship = "independent";
    reasons.push("government_or_regulatory_domain");
  } else if (domainInfo.knownRelationship === "news") {
    sourceType = "established_news";
    publisherRelationship = "independent";
    reasons.push("established_news_domain");
  } else if (domainInfo.knownRelationship === "community") {
    sourceType = path.includes("/r/") || title.includes("reddit")
      ? "community_discussion"
      : "user_generated_content";
    publisherRelationship = "community";
    reasons.push("community_domain");
  } else if (domainInfo.knownRelationship === "first_party") {
    publisherRelationship = "first_party";
    reasons.push("known_first_party_domain");
    sourceType = classifyFirstPartyPath(path, blob, input.claimCategory);
  } else if (
    input.entityName &&
    domainLikelyBelongsToEntity(domainInfo.domain, input.entityName)
  ) {
    publisherRelationship = "first_party";
    reasons.push("domain_matches_entity_name");
    sourceType = classifyFirstPartyPath(path, blob, input.claimCategory);
  }

  if (sourceType === "unknown") {
    if (
      /pricing|plans?|price|subscription|billing/.test(blob) &&
      publisherRelationship === "first_party"
    ) {
      sourceType = "official_pricing";
      reasons.push("pricing_path_on_first_party");
    } else if (/changelog|release.?notes|whats.?new/.test(blob)) {
      sourceType =
        publisherRelationship === "first_party"
          ? "official_changelog"
          : "specialist_publication";
      reasons.push("changelog_or_release_notes");
    } else if (/announcement|press.?release|blog/.test(blob)) {
      sourceType =
        publisherRelationship === "first_party"
          ? "official_announcement"
          : "independent_analysis";
      reasons.push("announcement_or_blog");
    } else if (/docs?\/|documentation|api.?reference|developer/.test(blob)) {
      sourceType =
        publisherRelationship === "first_party"
          ? "official_documentation"
          : "specialist_publication";
      reasons.push("documentation_signals");
    } else if (/arxiv\.org|doi\.org|acm\.org|ieee\.org/.test(domainInfo.domain)) {
      sourceType = "academic_research";
      publisherRelationship = "independent";
      reasons.push("academic_domain");
    } else if (
      /forum|discuss|community|stackoverflow|reddit|hacker.?news/.test(blob)
    ) {
      sourceType = "community_discussion";
      publisherRelationship = "community";
      reasons.push("community_signals");
    } else if (publisherRelationship === "first_party") {
      sourceType = "official_documentation";
      reasons.push("first_party_default_docs");
    } else {
      reasons.push("insufficient_signals_unknown");
    }
  }

  return { sourceType, publisherRelationship, reasons };
}

function classifyFirstPartyPath(
  path: string,
  blob: string,
  claimCategory?: ClaimCategory | null,
): SourceType {
  const pricingSignals =
    /pricing|\/plans?|\/price|billing/.test(path) ||
    /pricing|\/mo|per month|\$\s?\d/.test(blob);
  if (pricingSignals) {
    return "official_pricing";
  }
  if (/changelog|release|whats-new|whatsnew/.test(path)) {
    return "official_changelog";
  }
  if (/blog|news|announc|press/.test(path)) {
    return "official_announcement";
  }
  if (/careers?|jobs?|about|contact/.test(path)) {
    return "official_announcement";
  }
  // Claim category is a hint only when the page itself looks related.
  if (claimCategory === "pricing" && /price|plan|cost|billing/.test(blob)) {
    return "official_pricing";
  }
  return "official_documentation";
}

function domainLikelyBelongsToEntity(domain: string, entityName: string): boolean {
  const slug = entityName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32);
  if (slug.length < 3) {
    return false;
  }
  const compactDomain = domain.replace(/[^a-z0-9]/g, "");
  return compactDomain.includes(slug) || slug.includes(compactDomain.slice(0, 12));
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}
