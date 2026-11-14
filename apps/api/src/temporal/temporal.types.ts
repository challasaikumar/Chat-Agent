export type ChangeCategory =
  | "pricing"
  | "features"
  | "product_updates"
  | "availability"
  | "general";

export type TemporalReferenceType =
  | "explicit_date"
  | "relative_date"
  | "previous_research"
  | "previous_conversation"
  | "date_range"
  | "unknown";

export type TemporalIntent = {
  isComparison: boolean;
  referenceType: TemporalReferenceType;
  originalExpression: string | null;
  startDate: string | null;
  endDate: string | null;
  comparisonDate: string;
  timeZone: string;
  comparisonTargets: string[];
  changeCategories: ChangeCategory[];
  ambiguous: boolean;
  ambiguityReason: string | null;
};

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export type PricingChangeType =
  | "PRICE_INCREASED"
  | "PRICE_DECREASED"
  | "PRICE_UNCHANGED"
  | "PRICE_STRUCTURE_CHANGED"
  | "PLAN_CHANGED"
  | "PROMOTION_CHANGED"
  | "NOT_COMPARABLE"
  | "UNKNOWN"
  | "CONFLICTING_EVIDENCE";

export type FeatureChangeType =
  | "FEATURE_ADDED"
  | "FEATURE_REMOVED"
  | "FEATURE_IMPROVED"
  | "FEATURE_DEPRECATED"
  | "FEATURE_CHANGED"
  | "PRODUCT_RELEASED"
  | "LIMIT_INCREASED"
  | "LIMIT_DECREASED"
  | "AVAILABILITY_CHANGED"
  | "NO_DETECTED_CHANGE"
  | "UNKNOWN"
  | "CONFLICTING_EVIDENCE";

export type ComparisonVerdict =
  | "CONFIRMED_CHANGE"
  | "SUPPORTED_NO_CHANGE"
  | "POSSIBLE_CHANGE"
  | "NOT_COMPARABLE"
  | "INSUFFICIENT_HISTORICAL_EVIDENCE"
  | "CONFLICTING_INFORMATION";

export type TemporalTimings = {
  intentMs: number;
  baselineMs: number;
  extractionMs: number;
  entityMatchMs: number;
  comparisonMs: number;
  totalMs: number;
};

export type TemporalPrepareResult = {
  intent: TemporalIntent;
  baselineSummary: string;
  historicalSnapshotIds: string[];
  entityNames: string[];
  needsCurrentResearch: boolean;
};

export type TemporalComparisonView = {
  comparisonId: string;
  status: string;
  confidence: ConfidenceLevel;
  verdict: ComparisonVerdict;
  resultSummary: string;
  items: Array<{
    attribute: string;
    category: string;
    changeType: string;
    historicalValue: string | null;
    currentValue: string | null;
    absoluteDifference: string | null;
    percentageDifference: string | null;
    currency: string | null;
    billingPeriod: string | null;
    confidence: ConfidenceLevel;
  }>;
  promptBlock: string;
};
