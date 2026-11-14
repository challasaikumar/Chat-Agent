import type { DateIntent } from "./context.date-parser.js";
import type { EvidenceRecord } from "../citations/citation.types.js";

export type BuiltContext = {
  timeZone: string;
  nowIso: string;
  localDate: string;
  dateIntent: DateIntent | null;
  conversationId: string;
  userMessageId: number;
  promptText: string;
  evidence: EvidenceRecord[];
  recentMessageCount: number;
  historicalMessageCount: number;
  factCount: number;
  researchSnapshotCount: number;
};
