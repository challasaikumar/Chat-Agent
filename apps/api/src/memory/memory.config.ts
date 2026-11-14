import type { Env } from "../config/env.js";

export type MemoryConfig = {
  enabled: boolean;
  maxFactsPerExtraction: number;
  maxRetrievalResults: number;
  maxContextChars: number;
  minConfidence: number;
  minImportance: number;
  preferenceConfirmationThreshold: number;
  maxExtractionConcurrency: number;
  consolidationEnabled: boolean;
  decayEnabled: boolean;
  messageLimit: number;
};

export function loadMemoryConfig(env: Env): MemoryConfig {
  return {
    enabled: env.MEMORY_ENABLED,
    maxFactsPerExtraction: env.MEMORY_MAX_FACTS_PER_EXTRACTION,
    maxRetrievalResults: env.MEMORY_MAX_RETRIEVAL_RESULTS,
    maxContextChars: env.MEMORY_MAX_CONTEXT_CHARS,
    minConfidence: env.MEMORY_MIN_CONFIDENCE,
    minImportance: env.MEMORY_MIN_IMPORTANCE,
    preferenceConfirmationThreshold: env.MEMORY_PREFERENCE_CONFIRMATION_THRESHOLD,
    maxExtractionConcurrency: env.MEMORY_MAX_EXTRACTION_CONCURRENCY,
    consolidationEnabled: env.MEMORY_CONSOLIDATION_ENABLED,
    decayEnabled: env.MEMORY_DECAY_ENABLED,
    messageLimit: env.MEMORY_MESSAGE_LIMIT,
  };
}

/** Deterministic ranking weights (heuristic, not probabilities). */
export const MEMORY_RANK_WEIGHTS = {
  queryRelevance: 0.28,
  entityMatch: 0.18,
  projectMatch: 0.14,
  categoryMatch: 0.1,
  confidence: 0.1,
  importance: 0.08,
  validity: 0.06,
  assertionStrength: 0.04,
  recency: 0.02,
} as const;
