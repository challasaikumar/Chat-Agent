import type {
  EvidenceDirectness,
  EvidenceRelationship,
} from "../evidence.types.js";

export type SupportDetection = {
  relationship: EvidenceRelationship;
  directness: EvidenceDirectness;
  confidence: number;
  reasoningSummary: string;
  evidenceExcerpt: string;
};

/**
 * Deterministic claim↔excerpt support checks before any model assist.
 * Mention of the same entity ≠ support.
 */
export function detectClaimSupport(input: {
  claimStatement: string;
  claimValue?: string | null;
  claimAttribute?: string | null;
  excerpt: string;
  maxExcerptLength?: number;
}): SupportDetection {
  const excerpt = input.excerpt.trim();
  const maxLen = input.maxExcerptLength ?? 1500;
  const bounded =
    excerpt.length > maxLen ? `${excerpt.slice(0, maxLen)}…` : excerpt;
  const claimLower = input.claimStatement.toLowerCase();
  const excerptLower = bounded.toLowerCase();

  if (!bounded || bounded.length < 20) {
    return {
      relationship: "insufficient",
      directness: "ambiguous",
      confidence: 0.2,
      reasoningSummary: "Excerpt too short for support evaluation.",
      evidenceExcerpt: bounded,
    };
  }

  const numericClaim = extractNumbers(input.claimValue ?? input.claimStatement);
  const numericExcerpt = extractNumbers(bounded);
  const entityTokens = significantTokens(claimLower).slice(0, 6);
  const entityMentioned = entityTokens.some((token) =>
    excerptLower.includes(token),
  );

  if (numericClaim.length > 0) {
    const matched = numericClaim.filter((n) =>
      numericExcerpt.some((e) => nearlyEqual(n, e)),
    );
    const conflicting = numericClaim.filter(
      (n) =>
        !numericExcerpt.some((e) => nearlyEqual(n, e)) &&
        numericExcerpt.length > 0 &&
        sameUnitContext(claimLower, excerptLower),
    );

    if (matched.length > 0 && conflicting.length === 0) {
      return {
        relationship: "supports",
        directness: "direct",
        confidence: 0.85,
        reasoningSummary: `Numeric values ${matched.join(", ")} appear directly in excerpt.`,
        evidenceExcerpt: bounded,
      };
    }

    if (
      conflicting.length > 0 &&
      matched.length === 0 &&
      sameAttributeContext(input.claimAttribute, claimLower, excerptLower)
    ) {
      return {
        relationship: "contradicts",
        directness: "direct",
        confidence: 0.8,
        reasoningSummary:
          "Excerpt contains a conflicting numeric value in the same attribute context.",
        evidenceExcerpt: bounded,
      };
    }

    if (matched.length > 0 && conflicting.length > 0) {
      return {
        relationship: "partially_supports",
        directness: "ambiguous",
        confidence: 0.55,
        reasoningSummary: "Excerpt partially matches claim values with other conflicting numbers.",
        evidenceExcerpt: bounded,
      };
    }
  }

  const overlap = tokenOverlap(claimLower, excerptLower);
  if (overlap >= 0.55 && entityMentioned) {
    return {
      relationship: "partially_supports",
      directness: "indirect",
      confidence: 0.55,
      reasoningSummary: "High lexical overlap with entity mention; not a direct numeric confirmation.",
      evidenceExcerpt: bounded,
    };
  }

  if (entityMentioned && overlap < 0.35) {
    return {
      relationship: "mentions",
      directness: "indirect",
      confidence: 0.35,
      reasoningSummary: "Excerpt mentions related entities but does not substantiate the claim.",
      evidenceExcerpt: bounded,
    };
  }

  if (overlap >= 0.3) {
    return {
      relationship: "contextualizes",
      directness: "indirect",
      confidence: 0.4,
      reasoningSummary: "Excerpt provides related context without clear support or contradiction.",
      evidenceExcerpt: bounded,
    };
  }

  return {
    relationship: "insufficient",
    directness: "ambiguous",
    confidence: 0.25,
    reasoningSummary: "No deterministic support or contradiction found in excerpt.",
    evidenceExcerpt: bounded,
  };
}

function extractNumbers(text: string): number[] {
  const matches = text.match(/\$?\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches
    .map((raw) => Number(raw.replace(/[$,]/g, "")))
    .filter((n) => Number.isFinite(n));
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.009;
}

function sameUnitContext(claim: string, excerpt: string): boolean {
  const units = ["/mo", "month", "year", "/yr", "gb", "tb", "%"];
  return units.some((unit) => claim.includes(unit) && excerpt.includes(unit));
}

function sameAttributeContext(
  attribute: string | null | undefined,
  claim: string,
  excerpt: string,
): boolean {
  if (attribute) {
    return excerpt.includes(attribute.toLowerCase()) || claim.includes(attribute.toLowerCase());
  }
  return /(price|cost|plan|storage|feature)/.test(claim) &&
    /(price|cost|plan|storage|feature|\$)/.test(excerpt);
}

function significantTokens(text: string): string[] {
  return text
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .filter(
      (t) =>
        ![
          "the",
          "and",
          "for",
          "with",
          "from",
          "that",
          "this",
          "are",
          "was",
          "were",
          "has",
          "have",
          "includes",
          "costs",
        ].includes(t),
    );
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(significantTokens(a));
  const tb = new Set(significantTokens(b));
  if (ta.size === 0 || tb.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of ta) {
    if (tb.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(ta.size, tb.size);
}
