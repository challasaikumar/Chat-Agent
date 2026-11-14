import { createHash } from "node:crypto";
import type { SourcePairRelationship, SourceRelationshipType } from "../evidence.types.js";
import {
  canonicalizeSourceUrl,
  sameRegistrableDomain,
  urlsAreCanonicallyEquivalent,
} from "./source.url-normalizer.js";

export type IndependenceSource = {
  id: string;
  url: string;
  title?: string | null;
  content?: string | null;
  contentHash?: string | null;
};

export type IndependenceAnalysis = {
  relationships: SourcePairRelationship[];
  /** Representative source id per independent group. */
  independentGroups: string[][];
  independentSourceCount: number;
};

/**
 * Multiple search results ≠ multiple independent confirmations.
 * Three copies of one press release must not count as three confirmations.
 */
export function analyzeSourceIndependence(
  sources: IndependenceSource[],
): IndependenceAnalysis {
  const relationships: SourcePairRelationship[] = [];
  const parent = new Map<string, string>();

  for (const source of sources) {
    parent.set(source.id, source.id);
  }

  const find = (id: string): string => {
    const p = parent.get(id)!;
    if (p !== id) {
      const root = find(p);
      parent.set(id, root);
      return root;
    }
    return id;
  };

  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent.set(rb, ra);
    }
  };

  for (let i = 0; i < sources.length; i += 1) {
    for (let j = i + 1; j < sources.length; j += 1) {
      const left = sources[i]!;
      const right = sources[j]!;
      const relation = classifyPair(left, right);
      relationships.push(relation);
      if (
        relation.relationshipType === "duplicate" ||
        relation.relationshipType === "syndicated" ||
        relation.relationshipType === "derives_from"
      ) {
        union(left.id, right.id);
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const source of sources) {
    const root = find(source.id);
    const list = groups.get(root) ?? [];
    list.push(source.id);
    groups.set(root, list);
  }

  const independentGroups = [...groups.values()];
  return {
    relationships,
    independentGroups,
    independentSourceCount: independentGroups.length,
  };
}

function classifyPair(
  left: IndependenceSource,
  right: IndependenceSource,
): SourcePairRelationship {
  if (urlsAreCanonicallyEquivalent(left.url, right.url)) {
    return {
      sourceId: left.id,
      relatedSourceId: right.id,
      relationshipType: "duplicate",
      confidence: 0.99,
      evidence: `canonical_url_match:${canonicalizeSourceUrl(left.url)}`,
    };
  }

  // Content-body hash (URL excluded) so syndicated republications can match.
  const leftHash =
    left.contentHash ?? bodyHash(left.title, left.content);
  const rightHash =
    right.contentHash ?? bodyHash(right.title, right.content);

  if (leftHash && rightHash && leftHash === rightHash) {
    return {
      sourceId: left.id,
      relatedSourceId: right.id,
      relationshipType: sameRegistrableDomain(left.url, right.url)
        ? "duplicate"
        : "syndicated",
      confidence: 0.95,
      evidence: `identical_content_hash:${leftHash}`,
    };
  }

  const titleSimilarity = tokenOverlap(
    left.title ?? "",
    right.title ?? "",
  );
  const contentSimilarity = tokenOverlap(
    (left.content ?? "").slice(0, 800),
    (right.content ?? "").slice(0, 800),
  );

  if (
    titleSimilarity >= 0.85 &&
    contentSimilarity >= 0.7 &&
    !sameRegistrableDomain(left.url, right.url)
  ) {
    return {
      sourceId: left.id,
      relatedSourceId: right.id,
      relationshipType: "syndicated",
      confidence: 0.8,
      evidence: `high_title_content_overlap:title=${titleSimilarity.toFixed(2)},content=${contentSimilarity.toFixed(2)}`,
    };
  }

  if (
    sameRegistrableDomain(left.url, right.url) &&
    (titleSimilarity >= 0.7 || contentSimilarity >= 0.75)
  ) {
    return {
      sourceId: left.id,
      relatedSourceId: right.id,
      relationshipType: "related",
      confidence: 0.7,
      evidence: "same_domain_near_duplicate",
    };
  }

  if (
    citesOriginal(left.content ?? "", right.url) ||
    citesOriginal(right.content ?? "", left.url)
  ) {
    return {
      sourceId: left.id,
      relatedSourceId: right.id,
      relationshipType: "cites",
      confidence: 0.65,
      evidence: "explicit_url_citation",
    };
  }

  if (!sameRegistrableDomain(left.url, right.url) && contentSimilarity < 0.35) {
    return {
      sourceId: left.id,
      relatedSourceId: right.id,
      relationshipType: "independent",
      confidence: 0.55,
      evidence: "different_domain_low_overlap",
    };
  }

  return {
    sourceId: left.id,
    relatedSourceId: right.id,
    relationshipType: "unknown",
    confidence: 0.3,
    evidence: "insufficient_independence_signals",
  };
}

function tokenOverlap(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
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

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function citesOriginal(content: string, url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return content.toLowerCase().includes(host.toLowerCase());
  } catch {
    return false;
  }
}

function bodyHash(
  title: string | null | undefined,
  content: string | null | undefined,
): string | null {
  if (!content) {
    return null;
  }
  return createHash("sha256")
    .update(`${title ?? ""}\n${content}`)
    .digest("hex");
}

export function countIndependentSupporters(
  supportingSourceIds: string[],
  relationships: SourcePairRelationship[],
): number {
  if (supportingSourceIds.length === 0) {
    return 0;
  }
  const dependent = new Set<string>();
  for (const rel of relationships) {
    if (
      !supportingSourceIds.includes(rel.sourceId) ||
      !supportingSourceIds.includes(rel.relatedSourceId)
    ) {
      continue;
    }
    const dependentTypes: SourceRelationshipType[] = [
      "duplicate",
      "syndicated",
      "derives_from",
    ];
    if (dependentTypes.includes(rel.relationshipType)) {
      // Keep lexicographically smaller id as representative.
      const drop =
        rel.sourceId < rel.relatedSourceId
          ? rel.relatedSourceId
          : rel.sourceId;
      dependent.add(drop);
    }
  }
  return supportingSourceIds.filter((id) => !dependent.has(id)).length;
}
