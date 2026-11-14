import type {
  ConfidenceLevel,
  ComparisonVerdict,
  FeatureChangeType,
  PricingChangeType,
} from "../temporal.types.js";

export type ComparisonItemResult = {
  attribute: string;
  category: string;
  historicalClaimId: string | null;
  currentClaimId: string | null;
  changeType: PricingChangeType | FeatureChangeType | string;
  historicalValue: string | null;
  currentValue: string | null;
  absoluteDifference: string | null;
  percentageDifference: string | null;
  currency: string | null;
  billingPeriod: string | null;
  confidence: ConfidenceLevel;
  evidenceMetadata: Record<string, unknown>;
};

export type ComparisonEngineResult = {
  status:
    | "completed"
    | "partially_completed"
    | "insufficient_evidence"
    | "conflicting_evidence"
    | "failed";
  confidence: ConfidenceLevel;
  verdict: ComparisonVerdict;
  resultSummary: string;
  items: ComparisonItemResult[];
};
