CREATE TABLE `entity_memory_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`version` integer NOT NULL,
	`summary` text NOT NULL,
	`covered_through_message_id` integer,
	`model` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entity_memory_summaries_user_id_idx` ON `entity_memory_summaries` (`user_id`);--> statement-breakpoint
CREATE INDEX `entity_memory_summaries_entity_id_idx` ON `entity_memory_summaries` (`entity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entity_memory_summaries_entity_version_uidx` ON `entity_memory_summaries` (`user_id`,`entity_id`,`version`);--> statement-breakpoint
CREATE TABLE `memory_entity_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_entity_id` text NOT NULL,
	`target_entity_id` text NOT NULL,
	`relationship_type` text NOT NULL,
	`description` text,
	`confidence` real DEFAULT 0.8 NOT NULL,
	`source_message_id` integer,
	`source_conversation_id` text,
	`valid_from` integer,
	`valid_to` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `memory_entity_relationships_user_id_idx` ON `memory_entity_relationships` (`user_id`);--> statement-breakpoint
CREATE INDEX `memory_entity_relationships_source_idx` ON `memory_entity_relationships` (`source_entity_id`);--> statement-breakpoint
CREATE INDEX `memory_entity_relationships_target_idx` ON `memory_entity_relationships` (`target_entity_id`);--> statement-breakpoint
CREATE INDEX `memory_entity_relationships_type_idx` ON `memory_entity_relationships` (`relationship_type`);--> statement-breakpoint
CREATE INDEX `memory_entity_relationships_lookup_idx` ON `memory_entity_relationships` (`user_id`,`source_entity_id`,`target_entity_id`,`relationship_type`);--> statement-breakpoint
CREATE TABLE `memory_ingestion_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`covered_from_message_id` integer,
	`covered_through_message_id` integer,
	`facts_created` integer DEFAULT 0 NOT NULL,
	`relationships_created` integer DEFAULT 0 NOT NULL,
	`duplicates_rejected` integer DEFAULT 0 NOT NULL,
	`conflicts_detected` integer DEFAULT 0 NOT NULL,
	`error_category` text,
	`error_message` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memory_ingestion_runs_user_id_idx` ON `memory_ingestion_runs` (`user_id`);--> statement-breakpoint
CREATE INDEX `memory_ingestion_runs_conversation_id_idx` ON `memory_ingestion_runs` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `memory_ingestion_runs_status_idx` ON `memory_ingestion_runs` (`status`);--> statement-breakpoint
CREATE TABLE `user_memory_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`version` integer NOT NULL,
	`summary` text NOT NULL,
	`covered_through_message_id` integer,
	`model` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_memory_summaries_user_id_idx` ON `user_memory_summaries` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_memory_summaries_user_version_uidx` ON `user_memory_summaries` (`user_id`,`version`);--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `memory_type` text DEFAULT 'semantic' NOT NULL;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `memory_key` text;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `normalized_value` text;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `importance` real DEFAULT 0.5 NOT NULL;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `assertion_type` text DEFAULT 'explicitly_stated' NOT NULL;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `assertion_status` text DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `valid_from` integer;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `valid_to` integer;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `observed_at` integer;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `last_confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `last_accessed_at` integer;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `access_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `supersedes_fact_id` text;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `superseded_by_fact_id` text;--> statement-breakpoint
CREATE INDEX `memory_facts_category_idx` ON `memory_facts` (`category`);--> statement-breakpoint
CREATE INDEX `memory_facts_memory_type_idx` ON `memory_facts` (`memory_type`);--> statement-breakpoint
CREATE INDEX `memory_facts_memory_key_idx` ON `memory_facts` (`memory_key`);--> statement-breakpoint
CREATE INDEX `memory_facts_created_at_idx` ON `memory_facts` (`created_at`);--> statement-breakpoint
CREATE INDEX `memory_facts_valid_from_idx` ON `memory_facts` (`valid_from`);--> statement-breakpoint
CREATE INDEX `memory_facts_assertion_status_idx` ON `memory_facts` (`assertion_status`);--> statement-breakpoint
CREATE INDEX `entities_type_idx` ON `entities` (`entity_type`);