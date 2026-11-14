import type {
  AssertionStatus,
  AssertionType,
  EntityType,
  FactCategory,
  MemoryType,
  Message,
} from "../db/schema.js";

export type ExtractedEntity = {
  entityType: EntityType;
  displayName: string;
  aliases: string[];
  supportingMessageIds: number[];
};

export type ExtractedFact = {
  category: FactCategory;
  fact: string;
  confidence: number;
  importance?: number;
  memoryType?: MemoryType;
  memoryKey?: string | null;
  normalizedValue?: string | null;
  assertionType?: AssertionType;
  assertionStatus?: AssertionStatus;
  sourceMessageId: number;
  evidenceExcerpt: string;
  entityDisplayName?: string | null;
  entityType?: EntityType | null;
  projectDisplayName?: string | null;
  supersedesMemoryKey?: string | null;
};

export type ExtractedRelationship = {
  sourceEntityDisplayName: string;
  sourceEntityType: EntityType;
  targetEntityDisplayName: string;
  targetEntityType: EntityType;
  relationshipType: string;
  description?: string | null;
  confidence: number;
  sourceMessageId?: number | null;
};

export type MemoryExtractionResult = {
  summary: string;
  entities: ExtractedEntity[];
  facts: ExtractedFact[];
  relationships?: ExtractedRelationship[];
  supportingMessageIds: number[];
};

export type MemoryExtractionRequest = {
  conversationId: string;
  previousSummary: string | null;
  messages: Message[];
  model: string;
};

export type MemoryProcessResult = {
  conversationId: string;
  summaryVersion: number;
  summary: string;
  coveredThroughMessageId: number;
  entitiesUpserted: number;
  factsUpserted: number;
  relationshipsUpserted?: number;
  duplicatesRejected?: number;
  conflictsDetected?: number;
  model: string;
  ingestionRunId?: string;
};

export type MemoryQueryIntent =
  | "current_project"
  | "past_conversation"
  | "preference"
  | "decision"
  | "architecture"
  | "technology_stack"
  | "requirements"
  | "change_history"
  | "personal_context"
  | "general";

export type RankedMemoryFact = {
  factId: string;
  score: number;
  reasons: string[];
};
