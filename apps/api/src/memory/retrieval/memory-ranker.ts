import type { MemoryFact } from "../../db/schema.js";
import { MEMORY_RANK_WEIGHTS } from "../memory.config.js";
import { decayFactor } from "../consolidation/memory-decay.js";
import type { AnalyzedMemoryQuery } from "./memory-query-analyzer.js";
import type { RankedMemoryFact } from "../memory.types.js";

function tokenOverlap(queryTokens: string[], text: string): number {
  if (queryTokens.length === 0) {
    return 0;
  }
  const hay = text.toLowerCase();
  let hits = 0;
  for (const token of queryTokens) {
    if (hay.includes(token.toLowerCase())) {
      hits += 1;
    }
  }
  return hits / queryTokens.length;
}

export function rankMemoryFacts(options: {
  facts: MemoryFact[];
  analysis: AnalyzedMemoryQuery;
  projectEntityIds?: string[];
  entityIds?: string[];
  ftsBoostIds?: Set<string>;
  decayEnabled?: boolean;
  now?: Date;
}): RankedMemoryFact[] {
  const projectIds = new Set(options.projectEntityIds ?? []);
  const entityIds = new Set(options.entityIds ?? []);
  const fts = options.ftsBoostIds ?? new Set<string>();
  const now = options.now ?? new Date();

  return options.facts
    .map((fact) => {
      const reasons: string[] = [];
      let score = 0;

      const relevance = Math.max(
        tokenOverlap(options.analysis.keywords, fact.fact),
        tokenOverlap(options.analysis.keywords, fact.evidenceExcerpt),
        fts.has(fact.id) ? 0.85 : 0,
      );
      score += MEMORY_RANK_WEIGHTS.queryRelevance * relevance;
      if (relevance > 0.2) {
        reasons.push("query_relevance");
      }

      if (fact.entityId && entityIds.has(fact.entityId)) {
        score += MEMORY_RANK_WEIGHTS.entityMatch;
        reasons.push("entity_match");
      }

      if (fact.entityId && projectIds.has(fact.entityId)) {
        score += MEMORY_RANK_WEIGHTS.projectMatch;
        reasons.push("project_match");
      }

      if (
        options.analysis.categories.length === 0 ||
        options.analysis.categories.includes(fact.category)
      ) {
        score += MEMORY_RANK_WEIGHTS.categoryMatch;
        reasons.push("category_match");
      }

      score += MEMORY_RANK_WEIGHTS.confidence * fact.confidence;
      score += MEMORY_RANK_WEIGHTS.importance * (fact.importance ?? 0.5);

      const validNow =
        (!fact.validFrom || fact.validFrom <= now) &&
        (!fact.validTo || fact.validTo >= now) &&
        fact.isActive &&
        !["retracted", "superseded"].includes(fact.assertionStatus);
      if (options.analysis.wantsCurrent && validNow) {
        score += MEMORY_RANK_WEIGHTS.validity;
        reasons.push("currently_valid");
      }
      if (
        options.analysis.wantsHistorical &&
        (fact.assertionStatus === "superseded" || fact.validTo)
      ) {
        score += MEMORY_RANK_WEIGHTS.validity * 0.8;
        reasons.push("historical_version");
      }

      if (fact.assertionType === "explicitly_stated") {
        score += MEMORY_RANK_WEIGHTS.assertionStrength;
        reasons.push("explicit");
      } else if (fact.assertionType === "unconfirmed_inference") {
        score -= MEMORY_RANK_WEIGHTS.assertionStrength * 0.5;
      }

      const ageMs = now.getTime() - fact.createdAt.getTime();
      const recency = Math.max(0, 1 - ageMs / (180 * 24 * 60 * 60 * 1000));
      score += MEMORY_RANK_WEIGHTS.recency * recency;

      score *= decayFactor(fact, now, options.decayEnabled !== false);

      return { factId: fact.id, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}
