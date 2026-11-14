export type EvaluationMode = "deterministic" | "integration" | "live";

export type EvaluationCaseStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "error"
  | "cancelled";

export type FailureCategory =
  | "MEMORY_RETRIEVAL_FAILURE"
  | "WRONG_CONVERSATION"
  | "WRONG_DATE"
  | "ENTITY_MATCH_FAILURE"
  | "SEARCH_DECISION_FAILURE"
  | "SEARCH_PROVIDER_FAILURE"
  | "SEARCH_RESULT_QUALITY_FAILURE"
  | "TEMPORAL_COMPARISON_FAILURE"
  | "PRICE_NORMALIZATION_FAILURE"
  | "EVIDENCE_VERIFICATION_FAILURE"
  | "CITATION_FAILURE"
  | "UNSUPPORTED_CLAIM"
  | "TOOL_EXECUTION_FAILURE"
  | "CONTEXT_OVERFLOW"
  | "STREAMING_FAILURE"
  | "PERSISTENCE_FAILURE"
  | "TIMEOUT"
  | "OTHER";

export type GradeAssertion = {
  id: string;
  description: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  explanation: string;
  failureCategory?: FailureCategory;
  critical?: boolean;
};

export type CaseMetricBag = Record<string, number | null>;

export type EvaluationCaseResult = {
  caseId: string;
  name: string;
  category: string;
  mode: EvaluationMode;
  status: EvaluationCaseStatus;
  durationMs: number;
  assertions: GradeAssertion[];
  metrics: CaseMetricBag;
  failureCategories: FailureCategory[];
  trace: {
    agentRunIds: string[];
    conversationIds: string[];
    snapshotIds: string[];
    notes: string[];
  };
  error?: string;
};

export type EvaluationRunSummary = {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  datasetName: string;
  datasetVersion: number;
  gitCommit: string | null;
  mode: EvaluationMode;
  config: Record<string, unknown>;
  totals: {
    executed: number;
    passed: number;
    failed: number;
    skipped: number;
    error: number;
    cancelled: number;
    successRate: number;
  };
  criticalFailures: number;
};

export type EvaluationRunReport = {
  summary: EvaluationRunSummary;
  results: EvaluationCaseResult[];
  metrics: Record<string, number | null>;
  failures: Array<{
    caseId: string;
    category: FailureCategory;
    explanation: string;
  }>;
};

export type MetricFormulas = {
  precisionAtK: string;
  recallAtK: string;
  mrr: string;
  ndcgAtK: string;
};
