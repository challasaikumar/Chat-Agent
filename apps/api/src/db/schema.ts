import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Phase 01 bootstrap table — preserved across Phase 02.
 */
export const appMetadata = pgTable("app_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    emailNormalized: text("email_normalized"),
    passwordHash: text("password_hash"),
    role: text("role", { enum: ["admin", "user"] })
      .notNull()
      .default("user"),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true, mode: "date" }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("users_email_normalized_uidx").on(table.emailNormalized),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    csrfTokenHash: text("csrf_token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    userAgentHash: text("user_agent_hash"),
    ipAddressHash: text("ip_address_hash"),
    sessionMetadata: jsonb("session_metadata").$type<
      Record<string, unknown> | null
    >(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_uidx").on(table.tokenHash),
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    result: text("result", {
      enum: ["success", "failure", "denied"],
    }).notNull(),
    requestId: text("request_id"),
    ipAddressHash: text("ip_address_hash"),
    userAgentHash: text("user_agent_hash"),
    metadata: jsonb("metadata").$type<
      Record<string, unknown> | null
    >(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("audit_events_actor_idx").on(table.actorUserId),
    index("audit_events_action_created_idx").on(table.action, table.createdAt),
    index("audit_events_created_at_idx").on(table.createdAt),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("conversations_user_id_idx").on(table.userId),
    index("conversations_user_last_message_idx").on(
      table.userId,
      table.lastMessageAt,
    ),
    index("conversations_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["user", "assistant", "system", "tool"],
    }).notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("messages_conversation_id_idx").on(table.conversationId),
    index("messages_conversation_role_created_idx").on(
      table.conversationId,
      table.role,
      table.createdAt,
    ),
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    index("messages_created_at_idx").on(table.createdAt),
  ],
);

export const messageToolCalls = pgTable(
  "message_tool_calls",
  {
    id: text("id").primaryKey(),
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    arguments: jsonb("arguments")
      .notNull()
      .$type<Record<string, unknown>>(),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("message_tool_calls_message_id_idx").on(table.messageId)],
);

export const conversationSummaries = pgTable(
  "conversation_summaries",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    summary: text("summary").notNull(),
    coveredThroughMessageId: integer("covered_through_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "restrict" }),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("conversation_summaries_conversation_version_uidx").on(
      table.conversationId,
      table.version,
    ),
    index("conversation_summaries_conversation_id_idx").on(table.conversationId),
  ],
);

export const entities = pgTable(
  "entities",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type", {
      enum: [
        "user",
        "project",
        "company",
        "product",
        "technology",
        "person",
        "service",
        "organization",
        "topic",
        "other",
      ],
    }).notNull(),
    canonicalName: text("canonical_name").notNull(),
    displayName: text("display_name").notNull(),
    aliases: jsonb("aliases")
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("entities_type_canonical_uidx").on(
      table.entityType,
      table.canonicalName,
    ),
    index("entities_canonical_name_idx").on(table.canonicalName),
    index("entities_type_idx").on(table.entityType),
  ],
);

export const conversationEntities = pgTable(
  "conversation_entities",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.entityId] }),
    index("conversation_entities_entity_id_idx").on(table.entityId),
  ],
);

export const memoryFacts = pgTable(
  "memory_facts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityId: text("entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),
    category: text("category", {
      enum: [
        "user_context",
        "project_context",
        "preference",
        "decision",
        "requirement",
        "goal",
        "constraint",
        "technical_context",
        "relationship",
        "research_reference",
        "other",
      ],
    }).notNull(),
    memoryType: text("memory_type", {
      enum: [
        "episodic",
        "semantic",
        "project",
        "preference",
        "decision",
        "relationship",
      ],
    })
      .notNull()
      .default("semantic"),
    memoryKey: text("memory_key"),
    fact: text("fact").notNull(),
    normalizedValue: text("normalized_value"),
    confidence: doublePrecision("confidence").notNull(),
    importance: doublePrecision("importance").notNull().default(0.5),
    assertionType: text("assertion_type", {
      enum: [
        "explicitly_stated",
        "repeated_statement",
        "confirmed_inference",
        "unconfirmed_inference",
      ],
    })
      .notNull()
      .default("explicitly_stated"),
    assertionStatus: text("assertion_status", {
      enum: [
        "proposed",
        "considered",
        "confirmed",
        "implemented",
        "rejected",
        "superseded",
        "retracted",
        "uncertain",
      ],
    })
      .notNull()
      .default("confirmed"),
    sourceMessageId: integer("source_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    sourceConversationId: text("source_conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    evidenceExcerpt: text("evidence_excerpt").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }),
    validTo: timestamp("valid_to", { withTimezone: true, mode: "date" }),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true, mode: "date" }),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true, mode: "date" }),
    accessCount: integer("access_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    supersedesFactId: text("supersedes_fact_id"),
    supersededByFactId: text("superseded_by_fact_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("memory_facts_user_id_idx").on(table.userId),
    index("memory_facts_user_active_idx").on(table.userId, table.isActive),
    index("memory_facts_user_active_key_idx").on(
      table.userId,
      table.isActive,
      table.memoryKey,
    ),
    index("memory_facts_entity_id_idx").on(table.entityId),
    index("memory_facts_category_idx").on(table.category),
    index("memory_facts_memory_type_idx").on(table.memoryType),
    index("memory_facts_memory_key_idx").on(table.memoryKey),
    index("memory_facts_created_at_idx").on(table.createdAt),
    index("memory_facts_valid_from_idx").on(table.validFrom),
    index("memory_facts_assertion_status_idx").on(table.assertionStatus),
    index("memory_facts_source_message_idx").on(table.sourceMessageId),
    index("memory_facts_source_conversation_idx").on(table.sourceConversationId),
  ],
);

export const researchSnapshots = pgTable(
  "research_snapshots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    title: text("title").notNull(),
    provider: text("provider").notNull().default("tavily"),
    providerRequestId: text("provider_request_id"),
    searchParameters: jsonb("search_parameters")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    responseTimeMs: integer("response_time_ms"),
    resultCount: integer("result_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("research_snapshots_user_id_idx").on(table.userId),
    index("research_snapshots_conversation_id_idx").on(table.conversationId),
    index("research_snapshots_captured_at_idx").on(table.capturedAt),
    index("research_snapshots_provider_idx").on(table.provider),
    index("research_snapshots_user_conversation_captured_idx").on(
      table.userId,
      table.conversationId,
      table.capturedAt,
    ),
  ],
);

export const researchSources = pgTable(
  "research_sources",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => researchSnapshots.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    contentExcerpt: text("content_excerpt").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    contentHash: text("content_hash"),
    relevanceScore: doublePrecision("relevance_score"),
    faviconUrl: text("favicon_url"),
  },
  (table) => [
    index("research_sources_snapshot_id_idx").on(table.snapshotId),
    index("research_sources_domain_idx").on(table.domain),
    index("research_sources_url_idx").on(table.url),
    index("research_sources_content_hash_idx").on(table.contentHash),
  ],
);

export type AppMetadata = typeof appMetadata.$inferSelect;
export type NewAppMetadata = typeof appMetadata.$inferInsert;
export type User = typeof users.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MessageToolCall = typeof messageToolCalls.$inferSelect;
export type ConversationSummary = typeof conversationSummaries.$inferSelect;
export type Entity = typeof entities.$inferSelect;
export type ConversationEntity = typeof conversationEntities.$inferSelect;
export type MemoryFact = typeof memoryFacts.$inferSelect;
export type ResearchSnapshot = typeof researchSnapshots.$inferSelect;
export type ResearchSource = typeof researchSources.$inferSelect;

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userMessageId: integer("user_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    assistantMessageId: integer("assistant_message_id").references(
      () => messages.id,
      { onDelete: "set null" },
    ),
    model: text("model").notNull(),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("pending"),
    clientRequestId: text("client_request_id"),
    toolCallCount: integer("tool_call_count").notNull().default(0),
    searchCallCount: integer("search_call_count").notNull().default(0),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    durationMs: integer("duration_ms"),
    errorCategory: text("error_category"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("agent_runs_user_id_idx").on(table.userId),
    index("agent_runs_conversation_id_idx").on(table.conversationId),
    index("agent_runs_status_idx").on(table.status),
    index("agent_runs_started_at_idx").on(table.startedAt),
    uniqueIndex("agent_runs_client_request_uidx").on(
      table.userId,
      table.clientRequestId,
    ),
  ],
);

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;

/**
 * Phase 05 — structured research claims extracted from persisted sources.
 */
export const researchClaims = pgTable(
  "research_claims",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityId: text("entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),
    entityName: text("entity_name").notNull(),
    category: text("category", {
      enum: [
        "pricing",
        "feature",
        "product_release",
        "availability",
        "plan",
        "limit",
        "policy",
        "other",
      ],
    }).notNull(),
    attribute: text("attribute").notNull(),
    originalValue: text("original_value").notNull(),
    normalizedValue: text("normalized_value"),
    numericValue: text("numeric_value"),
    currency: text("currency"),
    billingPeriod: text("billing_period"),
    billingBasis: text("billing_basis"),
    unit: text("unit"),
    planName: text("plan_name"),
    region: text("region"),
    seatCount: integer("seat_count"),
    featureName: text("feature_name"),
    sourceId: text("source_id")
      .notNull()
      .references(() => researchSources.id, { onDelete: "cascade" }),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => researchSnapshots.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    evidenceExcerpt: text("evidence_excerpt").notNull(),
    contentHash: text("content_hash"),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    effectiveAt: timestamp("effective_at", { withTimezone: true, mode: "date" }),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }).notNull(),
    extractionConfidence: doublePrecision("extraction_confidence").notNull(),
    extractionModel: text("extraction_model"),
    verificationStatus: text("verification_status", {
      enum: ["verified", "unverified", "rejected"],
    })
      .notNull()
      .default("verified"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("research_claims_user_id_idx").on(table.userId),
    index("research_claims_entity_id_idx").on(table.entityId),
    index("research_claims_category_idx").on(table.category),
    index("research_claims_attribute_idx").on(table.attribute),
    index("research_claims_observed_at_idx").on(table.observedAt),
    index("research_claims_snapshot_id_idx").on(table.snapshotId),
    index("research_claims_source_id_idx").on(table.sourceId),
    uniqueIndex("research_claims_dedupe_uidx").on(
      table.sourceId,
      table.attribute,
      table.contentHash,
    ),
  ],
);

export const temporalComparisons = pgTable(
  "temporal_comparisons",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    agentRunId: text("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    entityId: text("entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),
    comparisonType: text("comparison_type").notNull(),
    referenceFrom: text("reference_from"),
    referenceTo: text("reference_to").notNull(),
    timeZone: text("time_zone").notNull(),
    status: text("status", {
      enum: [
        "completed",
        "partially_completed",
        "insufficient_evidence",
        "conflicting_evidence",
        "failed",
      ],
    }).notNull(),
    resultSummary: text("result_summary").notNull(),
    confidence: text("confidence", {
      enum: ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"],
    }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("temporal_comparisons_user_id_idx").on(table.userId),
    index("temporal_comparisons_conversation_id_idx").on(table.conversationId),
    index("temporal_comparisons_agent_run_id_idx").on(table.agentRunId),
    index("temporal_comparisons_entity_id_idx").on(table.entityId),
    index("temporal_comparisons_created_at_idx").on(table.createdAt),
  ],
);

export const temporalComparisonItems = pgTable(
  "temporal_comparison_items",
  {
    id: text("id").primaryKey(),
    comparisonId: text("comparison_id")
      .notNull()
      .references(() => temporalComparisons.id, { onDelete: "cascade" }),
    attribute: text("attribute").notNull(),
    category: text("category").notNull(),
    historicalClaimId: text("historical_claim_id").references(
      () => researchClaims.id,
      { onDelete: "set null" },
    ),
    currentClaimId: text("current_claim_id").references(() => researchClaims.id, {
      onDelete: "set null",
    }),
    changeType: text("change_type").notNull(),
    historicalValue: text("historical_value"),
    currentValue: text("current_value"),
    absoluteDifference: text("absolute_difference"),
    percentageDifference: text("percentage_difference"),
    currency: text("currency"),
    billingPeriod: text("billing_period"),
    confidence: text("confidence", {
      enum: ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"],
    }).notNull(),
    evidenceMetadata: jsonb("evidence_metadata").$type<
      Record<string, unknown> | null
    >(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("temporal_comparison_items_comparison_id_idx").on(table.comparisonId),
    index("temporal_comparison_items_change_type_idx").on(table.changeType),
  ],
);

/**
 * Phase 06 — entity relationships (relational graph, not a graph DB).
 */
export const memoryEntityRelationships = pgTable(
  "memory_entity_relationships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceEntityId: text("source_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    targetEntityId: text("target_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type").notNull(),
    description: text("description"),
    confidence: doublePrecision("confidence").notNull().default(0.8),
    sourceMessageId: integer("source_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    sourceConversationId: text("source_conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }),
    validTo: timestamp("valid_to", { withTimezone: true, mode: "date" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("memory_entity_relationships_user_id_idx").on(table.userId),
    index("memory_entity_relationships_source_idx").on(table.sourceEntityId),
    index("memory_entity_relationships_target_idx").on(table.targetEntityId),
    index("memory_entity_relationships_type_idx").on(table.relationshipType),
    index("memory_entity_relationships_lookup_idx").on(
      table.userId,
      table.sourceEntityId,
      table.targetEntityId,
      table.relationshipType,
    ),
  ],
);

export const userMemorySummaries = pgTable(
  "user_memory_summaries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    summary: text("summary").notNull(),
    coveredThroughMessageId: integer("covered_through_message_id"),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("user_memory_summaries_user_id_idx").on(table.userId),
    uniqueIndex("user_memory_summaries_user_version_uidx").on(
      table.userId,
      table.version,
    ),
  ],
);

export const entityMemorySummaries = pgTable(
  "entity_memory_summaries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    summary: text("summary").notNull(),
    coveredThroughMessageId: integer("covered_through_message_id"),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("entity_memory_summaries_user_id_idx").on(table.userId),
    index("entity_memory_summaries_entity_id_idx").on(table.entityId),
    uniqueIndex("entity_memory_summaries_entity_version_uidx").on(
      table.userId,
      table.entityId,
      table.version,
    ),
  ],
);

export const memoryIngestionRuns = pgTable(
  "memory_ingestion_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "processing", "completed", "failed", "retryable"],
    })
      .notNull()
      .default("pending"),
    coveredFromMessageId: integer("covered_from_message_id"),
    coveredThroughMessageId: integer("covered_through_message_id"),
    factsCreated: integer("facts_created").notNull().default(0),
    relationshipsCreated: integer("relationships_created").notNull().default(0),
    duplicatesRejected: integer("duplicates_rejected").notNull().default(0),
    conflictsDetected: integer("conflicts_detected").notNull().default(0),
    errorCategory: text("error_category"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("memory_ingestion_runs_user_id_idx").on(table.userId),
    index("memory_ingestion_runs_conversation_id_idx").on(table.conversationId),
    index("memory_ingestion_runs_status_idx").on(table.status),
  ],
);

/**
 * Phase 07 — evidence intelligence assessments (append-only history).
 */
export const sourceAssessments = pgTable(
  "source_assessments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => researchSources.id, { onDelete: "cascade" }),
    contentHash: text("content_hash"),
    sourceType: text("source_type").notNull(),
    publisherRelationship: text("publisher_relationship").notNull(),
    authorityScore: doublePrecision("authority_score").notNull(),
    relevanceScore: doublePrecision("relevance_score").notNull(),
    transparencyScore: doublePrecision("transparency_score").notNull(),
    freshnessScore: doublePrecision("freshness_score").notNull(),
    directnessScore: doublePrecision("directness_score").notNull(),
    overallSuitabilityScore: doublePrecision("overall_suitability_score").notNull(),
    freshnessCategory: text("freshness_category").notNull().default("unknown"),
    assessmentStatus: text("assessment_status", {
      enum: ["assessed", "partially_assessed", "unknown"],
    })
      .notNull()
      .default("assessed"),
    assessmentReasons: jsonb("assessment_reasons")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    claimCategoryHint: text("claim_category_hint"),
    suspiciousContent: boolean("suspicious_content")
      .notNull()
      .default(false),
    assessedAt: timestamp("assessed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("source_assessments_user_id_idx").on(table.userId),
    index("source_assessments_source_id_idx").on(table.sourceId),
    index("source_assessments_content_hash_idx").on(table.contentHash),
    index("source_assessments_assessed_at_idx").on(table.assessedAt),
  ],
);

export const claimEvidenceLinks = pgTable(
  "claim_evidence_links",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    claimId: text("claim_id")
      .notNull()
      .references(() => researchClaims.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => researchSources.id, { onDelete: "cascade" }),
    relationship: text("relationship", {
      enum: [
        "supports",
        "partially_supports",
        "contradicts",
        "contextualizes",
        "mentions",
        "insufficient",
      ],
    }).notNull(),
    evidenceExcerpt: text("evidence_excerpt").notNull(),
    directness: text("directness", {
      enum: ["direct", "indirect", "ambiguous"],
    }).notNull(),
    confidence: doublePrecision("confidence").notNull(),
    reasoningSummary: text("reasoning_summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("claim_evidence_links_user_id_idx").on(table.userId),
    index("claim_evidence_links_claim_id_idx").on(table.claimId),
    index("claim_evidence_links_source_id_idx").on(table.sourceId),
    uniqueIndex("claim_evidence_links_dedupe_uidx").on(
      table.claimId,
      table.sourceId,
      table.relationship,
    ),
  ],
);

export const sourceRelationships = pgTable(
  "source_relationships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => researchSources.id, { onDelete: "cascade" }),
    relatedSourceId: text("related_source_id")
      .notNull()
      .references(() => researchSources.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type", {
      enum: [
        "duplicate",
        "syndicated",
        "cites",
        "derives_from",
        "independent",
        "related",
        "unknown",
      ],
    }).notNull(),
    confidence: doublePrecision("confidence").notNull(),
    evidence: text("evidence"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("source_relationships_user_id_idx").on(table.userId),
    index("source_relationships_source_id_idx").on(table.sourceId),
    index("source_relationships_related_source_id_idx").on(table.relatedSourceId),
    uniqueIndex("source_relationships_dedupe_uidx").on(
      table.sourceId,
      table.relatedSourceId,
      table.relationshipType,
    ),
  ],
);

export const claimVerificationRuns = pgTable(
  "claim_verification_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    claimId: text("claim_id")
      .notNull()
      .references(() => researchClaims.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: [
        "supported",
        "partially_supported",
        "contradicted",
        "insufficient_evidence",
        "outdated_evidence",
        "conflicting_evidence",
        "not_verifiable",
      ],
    }).notNull(),
    sufficiencyStatus: text("sufficiency_status", {
      enum: [
        "sufficient",
        "partially_sufficient",
        "insufficient",
        "conflicting",
      ],
    }).notNull(),
    sourceCount: integer("source_count").notNull().default(0),
    independentSourceCount: integer("independent_source_count")
      .notNull()
      .default(0),
    supportingSourceCount: integer("supporting_source_count")
      .notNull()
      .default(0),
    contradictingSourceCount: integer("contradicting_source_count")
      .notNull()
      .default(0),
    assessmentSummary: text("assessment_summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("claim_verification_runs_user_id_idx").on(table.userId),
    index("claim_verification_runs_claim_id_idx").on(table.claimId),
    index("claim_verification_runs_status_idx").on(table.status),
    index("claim_verification_runs_created_at_idx").on(table.createdAt),
  ],
);

export const claimVerificationResults = pgTable(
  "claim_verification_results",
  {
    id: text("id").primaryKey(),
    verificationRunId: text("verification_run_id")
      .notNull()
      .references(() => claimVerificationRuns.id, { onDelete: "cascade" }),
    evidenceLinkId: text("evidence_link_id").references(
      () => claimEvidenceLinks.id,
      { onDelete: "set null" },
    ),
    result: text("result").notNull(),
    assessmentReason: text("assessment_reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("claim_verification_results_run_id_idx").on(table.verificationRunId),
    index("claim_verification_results_link_id_idx").on(table.evidenceLinkId),
  ],
);

export type ResearchClaim = typeof researchClaims.$inferSelect;
export type NewResearchClaim = typeof researchClaims.$inferInsert;
export type TemporalComparison = typeof temporalComparisons.$inferSelect;
export type NewTemporalComparison = typeof temporalComparisons.$inferInsert;
export type TemporalComparisonItem = typeof temporalComparisonItems.$inferSelect;
export type NewTemporalComparisonItem = typeof temporalComparisonItems.$inferInsert;
export type MemoryEntityRelationship =
  typeof memoryEntityRelationships.$inferSelect;
export type UserMemorySummary = typeof userMemorySummaries.$inferSelect;
export type EntityMemorySummary = typeof entityMemorySummaries.$inferSelect;
export type MemoryIngestionRun = typeof memoryIngestionRuns.$inferSelect;
export type SourceAssessment = typeof sourceAssessments.$inferSelect;
export type ClaimEvidenceLink = typeof claimEvidenceLinks.$inferSelect;
export type SourceRelationship = typeof sourceRelationships.$inferSelect;
export type ClaimVerificationRun = typeof claimVerificationRuns.$inferSelect;
export type ClaimVerificationResultRow =
  typeof claimVerificationResults.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type UserRole = User["role"];
export type UserStatus = User["status"];

export type MessageRole = Message["role"];
export type EntityType = Entity["entityType"];
export type FactCategory = MemoryFact["category"];
export type MemoryType = MemoryFact["memoryType"];
export type AssertionType = MemoryFact["assertionType"];
export type AssertionStatus = MemoryFact["assertionStatus"];
export type ClaimCategory = ResearchClaim["category"];
export type TemporalComparisonStatus = TemporalComparison["status"];
