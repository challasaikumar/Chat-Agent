export type EvidenceSourceType =
  | "web_search"
  | "historical_research"
  | "conversation_message"
  | "memory_fact"
  | "historical_research_claim";

export type EvidenceRecord = {
  evidenceId: string;
  sourceType: EvidenceSourceType;
  title: string;
  contentExcerpt: string;
  url: string | null;
  domain: string | null;
  sourceMessageId: number | null;
  sourceFactId: string | null;
  sourceId: string | null;
  snapshotId: string | null;
  observedAt: string | null;
  publishedAt: string | null;
  retrievedAt: string | null;
};
