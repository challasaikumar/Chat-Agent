import type { AgentEvent, AgentStreamRequest, CitationReference } from "@minimi/shared";
import { apiRequest } from "./api.client.js";
import { consumeAgentSse } from "./stream.client.js";

export async function streamAgentTurn(
  body: AgentStreamRequest,
  handlers: {
    onEvent: (event: AgentEvent) => void;
    onError?: (error: Error) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  await consumeAgentSse("/api/agent/turn/stream", body, handlers);
}

export async function getAgentRun(runId: string): Promise<{
  id: string;
  conversationId: string;
  status: string;
  errorCategory: string | null;
  errorMessage: string | null;
}> {
  return apiRequest(`/api/agent/runs/${runId}`);
}

export type SourcePreviewData = {
  source: {
    id: string;
    title: string;
    url: string;
    domain: string;
    publishedAt: string | null;
    retrievedAt: string;
    contentExcerpt: string;
  };
  classification: {
    sourceType: string;
    publisherRelationship: string;
    assessmentStatus: string;
  } | null;
  freshness: {
    freshnessCategory: string;
    freshnessScore: number;
  } | null;
  quality: {
    authorityScore: number;
    overallSuitabilityScore: number;
    reasons: string[];
    suspiciousContent: boolean;
  } | null;
};

export async function getEvidenceSource(
  sourceId: string,
): Promise<SourcePreviewData> {
  return apiRequest(`/api/evidence/sources/${sourceId}`);
}

export type { CitationReference };
