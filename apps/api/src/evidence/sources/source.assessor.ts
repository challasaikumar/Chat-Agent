import type { ClaimCategory } from "../../db/schema.js";
import type { SourceAssessmentResult } from "../evidence.types.js";
import { detectPromptInjection } from "../security/prompt-injection.detector.js";
import { scoreAuthorityForClaim } from "./source.authority.js";
import { classifySource } from "./source.classifier.js";
import { resolveDomain } from "./source.domain-resolver.js";
import { assessFreshness } from "./source.freshness.js";

export type AssessSourceInput = {
  sourceId: string;
  url: string;
  title?: string | null;
  content?: string | null;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  effectiveAt?: Date | string | null;
  retrievedAt?: Date | string | null;
  snapshotCapturedAt?: Date | string | null;
  claimCategory?: ClaimCategory | null;
  entityName?: string | null;
  author?: string | null;
  publisher?: string | null;
  now?: Date;
};

export class SourceAssessor {
  assess(input: AssessSourceInput): SourceAssessmentResult {
    const classification = classifySource({
      url: input.url,
      title: input.title,
      content: input.content,
      claimCategory: input.claimCategory,
      entityName: input.entityName,
    });
    const domainInfo = resolveDomain(input.url);
    const authority = scoreAuthorityForClaim({
      sourceType: classification.sourceType,
      publisherRelationship: classification.publisherRelationship,
      claimCategory: input.claimCategory,
    });
    const freshness = assessFreshness({
      publishedAt: input.publishedAt,
      updatedAt: input.updatedAt,
      effectiveAt: input.effectiveAt,
      retrievedAt: input.retrievedAt,
      snapshotCapturedAt: input.snapshotCapturedAt,
      claimCategory: input.claimCategory,
      now: input.now,
    });

    const transparency = scoreTransparency(input);
    const injection = detectPromptInjection(input.content ?? "");
    const directnessScore = estimateDirectness(
      input.content ?? "",
      input.claimCategory,
    );

    const overall = clamp01(
      authority.authorityScore * 0.3 +
        authority.relevanceScore * 0.2 +
        transparency.score * 0.15 +
        freshness.freshnessScore * 0.2 +
        directnessScore * 0.15,
    );

    const reasons = [
      ...classification.reasons,
      ...authority.reasons,
      ...freshness.reasons,
      ...transparency.reasons,
    ];
    if (injection.suspicious) {
      reasons.push(
        `prompt_injection_indicators:${injection.indicators.join(",")}`,
      );
    }

    let assessmentStatus: SourceAssessmentResult["assessmentStatus"] = "assessed";
    if (classification.sourceType === "unknown" && !input.publishedAt) {
      assessmentStatus = "partially_assessed";
    }
    if (domainInfo.domain === "unknown") {
      assessmentStatus = "unknown";
    }

    return {
      sourceId: input.sourceId,
      sourceType: classification.sourceType,
      publisherRelationship: classification.publisherRelationship,
      domain: domainInfo.domain,
      authorityScore: authority.authorityScore,
      relevanceScore: authority.relevanceScore,
      transparencyScore: transparency.score,
      freshnessScore: freshness.freshnessScore,
      directnessScore,
      overallSuitabilityScore: overall,
      freshnessCategory: freshness.freshnessCategory,
      assessmentStatus,
      reasons,
      suspiciousContent: injection.suspicious,
      assessedAt: (input.now ?? new Date()).toISOString(),
    };
  }
}

function scoreTransparency(input: AssessSourceInput): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let points = 0;
  let total = 0;

  const checks: Array<[boolean, string]> = [
    [Boolean(input.publisher || resolveDomain(input.url).publisher), "named_publisher"],
    [Boolean(input.author), "author_information"],
    [Boolean(input.publishedAt), "publication_date"],
    [Boolean(input.updatedAt), "update_date"],
    [Boolean(input.content && input.content.trim().length > 80), "direct_supporting_content"],
  ];

  for (const [ok, label] of checks) {
    total += 1;
    if (ok) {
      points += 1;
      reasons.push(`transparency_${label}`);
    } else {
      reasons.push(`missing_${label}`);
    }
  }

  return { score: total === 0 ? 0.3 : points / total, reasons };
}

function estimateDirectness(
  content: string,
  claimCategory?: ClaimCategory | null,
): number {
  if (!content || content.trim().length < 40) {
    return 0.2;
  }
  const lower = content.toLowerCase();
  if (claimCategory === "pricing" && /\$\s?\d+|€\s?\d+|£\s?\d+|\/mo|per month/.test(lower)) {
    return 0.9;
  }
  if (
    claimCategory === "product_release" &&
    /released|shipped|changelog|version\s+\d/.test(lower)
  ) {
    return 0.85;
  }
  if (claimCategory === "feature" && /includes?|supports?|available|feature/.test(lower)) {
    return 0.7;
  }
  return 0.55;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
