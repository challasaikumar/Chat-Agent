import type { EvidenceRecord } from "./citations/citation.types.js";

export type AgentTurnStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentTurnRequest = {
  conversationId: string;
  message: string;
  timeZone?: string;
};

export type AgentTurnContext = {
  userId: string;
  requestId?: string;
};

export type AgentUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export type AgentExecutionMeta = {
  toolCallCount: number;
  searchCallCount: number;
  durationMs: number;
};

export type AgentTurnResult = {
  runId: string;
  conversationId: string;
  answer: string;
  citations: EvidenceRecord[];
  usage: AgentUsage;
  execution: AgentExecutionMeta;
  status: AgentTurnStatus;
};

export type AgentRunView = {
  id: string;
  conversationId: string;
  status: AgentTurnStatus;
  model: string;
  toolCallCount: number;
  searchCallCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorCategory: string | null;
  errorMessage: string | null;
  toolCalls: Array<{
    id: string;
    toolName: string;
    status: string;
    arguments: Record<string, unknown>;
    result: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
  }>;
};
