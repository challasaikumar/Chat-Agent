import type { Env } from "../config/env.js";

export type TemporalConfig = {
  enabled: boolean;
  maxHistoricalSnapshots: number;
  maxClaimsPerComparison: number;
  minExtractionConfidence: number;
  maxSourceAgeDays: number;
  defaultTimeZone: string;
};

export function loadTemporalConfig(env: Env): TemporalConfig {
  return {
    enabled: env.TEMPORAL_COMPARISON_ENABLED,
    maxHistoricalSnapshots: env.TEMPORAL_MAX_HISTORICAL_SNAPSHOTS,
    maxClaimsPerComparison: env.TEMPORAL_MAX_CLAIMS_PER_COMPARISON,
    minExtractionConfidence: env.TEMPORAL_MIN_EXTRACTION_CONFIDENCE,
    maxSourceAgeDays: env.TEMPORAL_MAX_SOURCE_AGE_DAYS,
    defaultTimeZone: env.APP_TIME_ZONE,
  };
}
