CREATE TABLE `research_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entity_id` text,
	`entity_name` text NOT NULL,
	`category` text NOT NULL,
	`attribute` text NOT NULL,
	`original_value` text NOT NULL,
	`normalized_value` text,
	`numeric_value` text,
	`currency` text,
	`billing_period` text,
	`billing_basis` text,
	`unit` text,
	`plan_name` text,
	`region` text,
	`seat_count` integer,
	`feature_name` text,
	`source_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`source_url` text NOT NULL,
	`evidence_excerpt` text NOT NULL,
	`content_hash` text,
	`published_at` integer,
	`effective_at` integer,
	`observed_at` integer NOT NULL,
	`extraction_confidence` real NOT NULL,
	`extraction_model` text,
	`verification_status` text DEFAULT 'verified' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_id`) REFERENCES `research_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_id`) REFERENCES `research_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_claims_user_id_idx` ON `research_claims` (`user_id`);--> statement-breakpoint
CREATE INDEX `research_claims_entity_id_idx` ON `research_claims` (`entity_id`);--> statement-breakpoint
CREATE INDEX `research_claims_category_idx` ON `research_claims` (`category`);--> statement-breakpoint
CREATE INDEX `research_claims_attribute_idx` ON `research_claims` (`attribute`);--> statement-breakpoint
CREATE INDEX `research_claims_observed_at_idx` ON `research_claims` (`observed_at`);--> statement-breakpoint
CREATE INDEX `research_claims_snapshot_id_idx` ON `research_claims` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `research_claims_source_id_idx` ON `research_claims` (`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `research_claims_dedupe_uidx` ON `research_claims` (`source_id`,`attribute`,`content_hash`);--> statement-breakpoint
CREATE TABLE `temporal_comparison_items` (
	`id` text PRIMARY KEY NOT NULL,
	`comparison_id` text NOT NULL,
	`attribute` text NOT NULL,
	`category` text NOT NULL,
	`historical_claim_id` text,
	`current_claim_id` text,
	`change_type` text NOT NULL,
	`historical_value` text,
	`current_value` text,
	`absolute_difference` text,
	`percentage_difference` text,
	`currency` text,
	`billing_period` text,
	`confidence` text NOT NULL,
	`evidence_metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`comparison_id`) REFERENCES `temporal_comparisons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`historical_claim_id`) REFERENCES `research_claims`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`current_claim_id`) REFERENCES `research_claims`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `temporal_comparison_items_comparison_id_idx` ON `temporal_comparison_items` (`comparison_id`);--> statement-breakpoint
CREATE INDEX `temporal_comparison_items_change_type_idx` ON `temporal_comparison_items` (`change_type`);--> statement-breakpoint
CREATE TABLE `temporal_comparisons` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`agent_run_id` text,
	`entity_id` text,
	`comparison_type` text NOT NULL,
	`reference_from` text,
	`reference_to` text NOT NULL,
	`time_zone` text NOT NULL,
	`status` text NOT NULL,
	`result_summary` text NOT NULL,
	`confidence` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `temporal_comparisons_user_id_idx` ON `temporal_comparisons` (`user_id`);--> statement-breakpoint
CREATE INDEX `temporal_comparisons_conversation_id_idx` ON `temporal_comparisons` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `temporal_comparisons_agent_run_id_idx` ON `temporal_comparisons` (`agent_run_id`);--> statement-breakpoint
CREATE INDEX `temporal_comparisons_entity_id_idx` ON `temporal_comparisons` (`entity_id`);--> statement-breakpoint
CREATE INDEX `temporal_comparisons_created_at_idx` ON `temporal_comparisons` (`created_at`);