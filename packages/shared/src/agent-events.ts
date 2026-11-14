/** Phase 08 — typed SSE agent events (server → browser). */

export type AgentStatusStage =
  | "retrieving_context"
  | "planning_research"
  | "searching"
  | "evaluating_sources"
  | "comparing_information"
  | "composing_answer";

export type AgentRunUiStatus =
  | "idle"
  | "submitting"
  | "retrieving_context"
  | "planning_research"
  | "searching"
  | "evaluating_sources"
  | "comparing_information"
  | "composing_answer"
  | "streaming"
  | "completed"
  | "cancelled"
  | "failed";

export type CitationReference = {
  id: string;
  title: string;
  url: string | null;
  domain: string | null;
  retrievedAt: string | null;
  publishedAt: string | null;
  contentExcerpt?: string | null;
  sourceType?: string | null;
};

export type AgentStreamRequest = {
  conversationId: string;
  message: string;
  timeZone?: string;
  clientRequestId?: string;
};

export type AgentEvent =
  | {
      type: "run.started";
      runId: string;
      conversationId: string;
      clientRequestId?: string | null;
    }
  | {
      type: "agent.status";
      stage: AgentStatusStage;
      message: string;
    }
  | {
      type: "tool.started";
      toolCallId: string;
      toolName: "web_search";
      query: string;
    }
  | {
      type: "tool.completed";
      toolCallId: string;
      toolName: "web_search";
      resultCount: number;
      snapshotId: string | null;
    }
  | {
      type: "citation.available";
      citation: CitationReference;
    }
  | {
      type: "message.delta";
      delta: string;
    }
  | {
      type: "run.completed";
      runId: string;
      messageId: number;
      conversationId: string;
      citations: CitationReference[];
      usage: {
        inputTokens: number | null;
        outputTokens: number | null;
      };
      execution: {
        toolCallCount: number;
        searchCallCount: number;
        durationMs: number;
      };
      status: "completed";
      answer: string;
      conversationTitle?: string | null;
    }
  | {
      type: "run.error";
      code: string;
      message: string;
      retryable: boolean;
    }
  | {
      type: "run.cancelled";
      runId: string;
      status: "cancelled";
    };

export type ConversationSummary = {
  id: string;
  title: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string | null;
};

export type ConversationMessage = {
  id: number;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};
