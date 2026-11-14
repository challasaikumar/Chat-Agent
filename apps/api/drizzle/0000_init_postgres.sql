CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"user_message_id" integer,
	"assistant_message_id" integer,
	"model" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"client_request_id" text,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"search_call_count" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"error_category" text,
	"error_message" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_metadata" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"result" text NOT NULL,
	"request_id" text,
	"ip_address_hash" text,
	"user_agent_hash" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_token_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent_hash" text,
	"ip_address_hash" text,
	"session_metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "claim_evidence_links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"source_id" text NOT NULL,
	"relationship" text NOT NULL,
	"evidence_excerpt" text NOT NULL,
	"directness" text NOT NULL,
	"confidence" double precision NOT NULL,
	"reasoning_summary" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_verification_results" (
	"id" text PRIMARY KEY NOT NULL,
	"verification_run_id" text NOT NULL,
	"evidence_link_id" text,
	"result" text NOT NULL,
	"assessment_reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_verification_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"status" text NOT NULL,
	"sufficiency_status" text NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"independent_source_count" integer DEFAULT 0 NOT NULL,
	"supporting_source_count" integer DEFAULT 0 NOT NULL,
	"contradicting_source_count" integer DEFAULT 0 NOT NULL,
	"assessment_summary" text NOT NULL,
	"metadata" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_entities" (
	"conversation_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_entities_conversation_id_entity_id_pk" PRIMARY KEY("conversation_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"version" integer NOT NULL,
	"summary" text NOT NULL,
	"covered_through_message_id" integer NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"canonical_name" text NOT NULL,
	"display_name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_memory_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"version" integer NOT NULL,
	"summary" text NOT NULL,
	"covered_through_message_id" integer,
	"model" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_entity_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_entity_id" text NOT NULL,
	"target_entity_id" text NOT NULL,
	"relationship_type" text NOT NULL,
	"description" text,
	"confidence" double precision DEFAULT 0.8 NOT NULL,
	"source_message_id" integer,
	"source_conversation_id" text,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_id" text,
	"category" text NOT NULL,
	"memory_type" text DEFAULT 'semantic' NOT NULL,
	"memory_key" text,
	"fact" text NOT NULL,
	"normalized_value" text,
	"confidence" double precision NOT NULL,
	"importance" double precision DEFAULT 0.5 NOT NULL,
	"assertion_type" text DEFAULT 'explicitly_stated' NOT NULL,
	"assertion_status" text DEFAULT 'confirmed' NOT NULL,
	"source_message_id" integer NOT NULL,
	"source_conversation_id" text NOT NULL,
	"evidence_excerpt" text NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"observed_at" timestamp with time zone,
	"last_confirmed_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"access_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"supersedes_fact_id" text,
	"superseded_by_fact_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_ingestion_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"covered_from_message_id" integer,
	"covered_through_message_id" integer,
	"facts_created" integer DEFAULT 0 NOT NULL,
	"relationships_created" integer DEFAULT 0 NOT NULL,
	"duplicates_rejected" integer DEFAULT 0 NOT NULL,
	"conflicts_detected" integer DEFAULT 0 NOT NULL,
	"error_category" text,
	"error_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"tool_name" text NOT NULL,
	"arguments" jsonb NOT NULL,
	"result" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_id" text,
	"entity_name" text NOT NULL,
	"category" text NOT NULL,
	"attribute" text NOT NULL,
	"original_value" text NOT NULL,
	"normalized_value" text,
	"numeric_value" text,
	"currency" text,
	"billing_period" text,
	"billing_basis" text,
	"unit" text,
	"plan_name" text,
	"region" text,
	"seat_count" integer,
	"feature_name" text,
	"source_id" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"source_url" text NOT NULL,
	"evidence_excerpt" text NOT NULL,
	"content_hash" text,
	"published_at" timestamp with time zone,
	"effective_at" timestamp with time zone,
	"observed_at" timestamp with time zone NOT NULL,
	"extraction_confidence" double precision NOT NULL,
	"extraction_model" text,
	"verification_status" text DEFAULT 'verified' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"query" text NOT NULL,
	"title" text NOT NULL,
	"provider" text DEFAULT 'tavily' NOT NULL,
	"provider_request_id" text,
	"search_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"response_time_ms" integer,
	"result_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"content_excerpt" text NOT NULL,
	"published_at" timestamp with time zone,
	"retrieved_at" timestamp with time zone NOT NULL,
	"content_hash" text,
	"relevance_score" double precision,
	"favicon_url" text
);
--> statement-breakpoint
CREATE TABLE "source_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_id" text NOT NULL,
	"content_hash" text,
	"source_type" text NOT NULL,
	"publisher_relationship" text NOT NULL,
	"authority_score" double precision NOT NULL,
	"relevance_score" double precision NOT NULL,
	"transparency_score" double precision NOT NULL,
	"freshness_score" double precision NOT NULL,
	"directness_score" double precision NOT NULL,
	"overall_suitability_score" double precision NOT NULL,
	"freshness_category" text DEFAULT 'unknown' NOT NULL,
	"assessment_status" text DEFAULT 'assessed' NOT NULL,
	"assessment_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"claim_category_hint" text,
	"suspicious_content" boolean DEFAULT false NOT NULL,
	"assessed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_id" text NOT NULL,
	"related_source_id" text NOT NULL,
	"relationship_type" text NOT NULL,
	"confidence" double precision NOT NULL,
	"evidence" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temporal_comparison_items" (
	"id" text PRIMARY KEY NOT NULL,
	"comparison_id" text NOT NULL,
	"attribute" text NOT NULL,
	"category" text NOT NULL,
	"historical_claim_id" text,
	"current_claim_id" text,
	"change_type" text NOT NULL,
	"historical_value" text,
	"current_value" text,
	"absolute_difference" text,
	"percentage_difference" text,
	"currency" text,
	"billing_period" text,
	"confidence" text NOT NULL,
	"evidence_metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temporal_comparisons" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"agent_run_id" text,
	"entity_id" text,
	"comparison_type" text NOT NULL,
	"reference_from" text,
	"reference_to" text NOT NULL,
	"time_zone" text NOT NULL,
	"status" text NOT NULL,
	"result_summary" text NOT NULL,
	"confidence" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_memory_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"summary" text NOT NULL,
	"covered_through_message_id" integer,
	"model" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"email_normalized" text,
	"password_hash" text,
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"password_updated_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_message_id_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_assistant_message_id_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence_links" ADD CONSTRAINT "claim_evidence_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence_links" ADD CONSTRAINT "claim_evidence_links_claim_id_research_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."research_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence_links" ADD CONSTRAINT "claim_evidence_links_source_id_research_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."research_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_verification_results" ADD CONSTRAINT "claim_verification_results_verification_run_id_claim_verification_runs_id_fk" FOREIGN KEY ("verification_run_id") REFERENCES "public"."claim_verification_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_verification_results" ADD CONSTRAINT "claim_verification_results_evidence_link_id_claim_evidence_links_id_fk" FOREIGN KEY ("evidence_link_id") REFERENCES "public"."claim_evidence_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_verification_runs" ADD CONSTRAINT "claim_verification_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_verification_runs" ADD CONSTRAINT "claim_verification_runs_claim_id_research_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."research_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_entities" ADD CONSTRAINT "conversation_entities_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_entities" ADD CONSTRAINT "conversation_entities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_covered_through_message_id_messages_id_fk" FOREIGN KEY ("covered_through_message_id") REFERENCES "public"."messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_memory_summaries" ADD CONSTRAINT "entity_memory_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_memory_summaries" ADD CONSTRAINT "entity_memory_summaries_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entity_relationships" ADD CONSTRAINT "memory_entity_relationships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entity_relationships" ADD CONSTRAINT "memory_entity_relationships_source_entity_id_entities_id_fk" FOREIGN KEY ("source_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entity_relationships" ADD CONSTRAINT "memory_entity_relationships_target_entity_id_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entity_relationships" ADD CONSTRAINT "memory_entity_relationships_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entity_relationships" ADD CONSTRAINT "memory_entity_relationships_source_conversation_id_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_source_conversation_id_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_ingestion_runs" ADD CONSTRAINT "memory_ingestion_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_ingestion_runs" ADD CONSTRAINT "memory_ingestion_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_tool_calls" ADD CONSTRAINT "message_tool_calls_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_claims" ADD CONSTRAINT "research_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_claims" ADD CONSTRAINT "research_claims_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_claims" ADD CONSTRAINT "research_claims_source_id_research_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."research_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_claims" ADD CONSTRAINT "research_claims_snapshot_id_research_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."research_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_snapshots" ADD CONSTRAINT "research_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_snapshots" ADD CONSTRAINT "research_snapshots_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_snapshot_id_research_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."research_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_assessments" ADD CONSTRAINT "source_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_assessments" ADD CONSTRAINT "source_assessments_source_id_research_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."research_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_relationships" ADD CONSTRAINT "source_relationships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_relationships" ADD CONSTRAINT "source_relationships_source_id_research_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."research_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_relationships" ADD CONSTRAINT "source_relationships_related_source_id_research_sources_id_fk" FOREIGN KEY ("related_source_id") REFERENCES "public"."research_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporal_comparison_items" ADD CONSTRAINT "temporal_comparison_items_comparison_id_temporal_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."temporal_comparisons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporal_comparison_items" ADD CONSTRAINT "temporal_comparison_items_historical_claim_id_research_claims_id_fk" FOREIGN KEY ("historical_claim_id") REFERENCES "public"."research_claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporal_comparison_items" ADD CONSTRAINT "temporal_comparison_items_current_claim_id_research_claims_id_fk" FOREIGN KEY ("current_claim_id") REFERENCES "public"."research_claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporal_comparisons" ADD CONSTRAINT "temporal_comparisons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporal_comparisons" ADD CONSTRAINT "temporal_comparisons_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporal_comparisons" ADD CONSTRAINT "temporal_comparisons_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporal_comparisons" ADD CONSTRAINT "temporal_comparisons_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memory_summaries" ADD CONSTRAINT "user_memory_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_user_id_idx" ON "agent_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_runs_conversation_id_idx" ON "agent_runs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_runs_started_at_idx" ON "agent_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_client_request_uidx" ON "agent_runs" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_created_idx" ON "audit_events" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_uidx" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "claim_evidence_links_user_id_idx" ON "claim_evidence_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "claim_evidence_links_claim_id_idx" ON "claim_evidence_links" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_evidence_links_source_id_idx" ON "claim_evidence_links" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_evidence_links_dedupe_uidx" ON "claim_evidence_links" USING btree ("claim_id","source_id","relationship");--> statement-breakpoint
CREATE INDEX "claim_verification_results_run_id_idx" ON "claim_verification_results" USING btree ("verification_run_id");--> statement-breakpoint
CREATE INDEX "claim_verification_results_link_id_idx" ON "claim_verification_results" USING btree ("evidence_link_id");--> statement-breakpoint
CREATE INDEX "claim_verification_runs_user_id_idx" ON "claim_verification_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "claim_verification_runs_claim_id_idx" ON "claim_verification_runs" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_verification_runs_status_idx" ON "claim_verification_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "claim_verification_runs_created_at_idx" ON "claim_verification_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversation_entities_entity_id_idx" ON "conversation_entities" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_summaries_conversation_version_uidx" ON "conversation_summaries" USING btree ("conversation_id","version");--> statement-breakpoint
CREATE INDEX "conversation_summaries_conversation_id_idx" ON "conversation_summaries" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_user_last_message_idx" ON "conversations" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_user_updated_idx" ON "conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_type_canonical_uidx" ON "entities" USING btree ("entity_type","canonical_name");--> statement-breakpoint
CREATE INDEX "entities_canonical_name_idx" ON "entities" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "entities_type_idx" ON "entities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "entity_memory_summaries_user_id_idx" ON "entity_memory_summaries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entity_memory_summaries_entity_id_idx" ON "entity_memory_summaries" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_memory_summaries_entity_version_uidx" ON "entity_memory_summaries" USING btree ("user_id","entity_id","version");--> statement-breakpoint
CREATE INDEX "memory_entity_relationships_user_id_idx" ON "memory_entity_relationships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memory_entity_relationships_source_idx" ON "memory_entity_relationships" USING btree ("source_entity_id");--> statement-breakpoint
CREATE INDEX "memory_entity_relationships_target_idx" ON "memory_entity_relationships" USING btree ("target_entity_id");--> statement-breakpoint
CREATE INDEX "memory_entity_relationships_type_idx" ON "memory_entity_relationships" USING btree ("relationship_type");--> statement-breakpoint
CREATE INDEX "memory_entity_relationships_lookup_idx" ON "memory_entity_relationships" USING btree ("user_id","source_entity_id","target_entity_id","relationship_type");--> statement-breakpoint
CREATE INDEX "memory_facts_user_id_idx" ON "memory_facts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memory_facts_user_active_idx" ON "memory_facts" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "memory_facts_user_active_key_idx" ON "memory_facts" USING btree ("user_id","is_active","memory_key");--> statement-breakpoint
CREATE INDEX "memory_facts_entity_id_idx" ON "memory_facts" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "memory_facts_category_idx" ON "memory_facts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "memory_facts_memory_type_idx" ON "memory_facts" USING btree ("memory_type");--> statement-breakpoint
CREATE INDEX "memory_facts_memory_key_idx" ON "memory_facts" USING btree ("memory_key");--> statement-breakpoint
CREATE INDEX "memory_facts_created_at_idx" ON "memory_facts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "memory_facts_valid_from_idx" ON "memory_facts" USING btree ("valid_from");--> statement-breakpoint
CREATE INDEX "memory_facts_assertion_status_idx" ON "memory_facts" USING btree ("assertion_status");--> statement-breakpoint
CREATE INDEX "memory_facts_source_message_idx" ON "memory_facts" USING btree ("source_message_id");--> statement-breakpoint
CREATE INDEX "memory_facts_source_conversation_idx" ON "memory_facts" USING btree ("source_conversation_id");--> statement-breakpoint
CREATE INDEX "memory_ingestion_runs_user_id_idx" ON "memory_ingestion_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memory_ingestion_runs_conversation_id_idx" ON "memory_ingestion_runs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "memory_ingestion_runs_status_idx" ON "memory_ingestion_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "message_tool_calls_message_id_idx" ON "message_tool_calls" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_role_created_idx" ON "messages" USING btree ("conversation_id","role","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "research_claims_user_id_idx" ON "research_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "research_claims_entity_id_idx" ON "research_claims" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "research_claims_category_idx" ON "research_claims" USING btree ("category");--> statement-breakpoint
CREATE INDEX "research_claims_attribute_idx" ON "research_claims" USING btree ("attribute");--> statement-breakpoint
CREATE INDEX "research_claims_observed_at_idx" ON "research_claims" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "research_claims_snapshot_id_idx" ON "research_claims" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "research_claims_source_id_idx" ON "research_claims" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "research_claims_dedupe_uidx" ON "research_claims" USING btree ("source_id","attribute","content_hash");--> statement-breakpoint
CREATE INDEX "research_snapshots_user_id_idx" ON "research_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "research_snapshots_conversation_id_idx" ON "research_snapshots" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "research_snapshots_captured_at_idx" ON "research_snapshots" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "research_snapshots_provider_idx" ON "research_snapshots" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "research_snapshots_user_conversation_captured_idx" ON "research_snapshots" USING btree ("user_id","conversation_id","captured_at");--> statement-breakpoint
CREATE INDEX "research_sources_snapshot_id_idx" ON "research_sources" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "research_sources_domain_idx" ON "research_sources" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "research_sources_url_idx" ON "research_sources" USING btree ("url");--> statement-breakpoint
CREATE INDEX "research_sources_content_hash_idx" ON "research_sources" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "source_assessments_user_id_idx" ON "source_assessments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "source_assessments_source_id_idx" ON "source_assessments" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_assessments_content_hash_idx" ON "source_assessments" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "source_assessments_assessed_at_idx" ON "source_assessments" USING btree ("assessed_at");--> statement-breakpoint
CREATE INDEX "source_relationships_user_id_idx" ON "source_relationships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "source_relationships_source_id_idx" ON "source_relationships" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_relationships_related_source_id_idx" ON "source_relationships" USING btree ("related_source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_relationships_dedupe_uidx" ON "source_relationships" USING btree ("source_id","related_source_id","relationship_type");--> statement-breakpoint
CREATE INDEX "temporal_comparison_items_comparison_id_idx" ON "temporal_comparison_items" USING btree ("comparison_id");--> statement-breakpoint
CREATE INDEX "temporal_comparison_items_change_type_idx" ON "temporal_comparison_items" USING btree ("change_type");--> statement-breakpoint
CREATE INDEX "temporal_comparisons_user_id_idx" ON "temporal_comparisons" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "temporal_comparisons_conversation_id_idx" ON "temporal_comparisons" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "temporal_comparisons_agent_run_id_idx" ON "temporal_comparisons" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "temporal_comparisons_entity_id_idx" ON "temporal_comparisons" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "temporal_comparisons_created_at_idx" ON "temporal_comparisons" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_memory_summaries_user_id_idx" ON "user_memory_summaries" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_memory_summaries_user_version_uidx" ON "user_memory_summaries" USING btree ("user_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_uidx" ON "users" USING btree ("email_normalized");