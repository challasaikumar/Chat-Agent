CREATE TABLE `conversation_entities` (
	`conversation_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	PRIMARY KEY(`conversation_id`, `entity_id`),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_entities_entity_id_idx` ON `conversation_entities` (`entity_id`);--> statement-breakpoint
CREATE TABLE `conversation_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`version` integer NOT NULL,
	`summary` text NOT NULL,
	`covered_through_message_id` integer NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`covered_through_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_summaries_conversation_version_uidx` ON `conversation_summaries` (`conversation_id`,`version`);--> statement-breakpoint
CREATE INDEX `conversation_summaries_conversation_id_idx` ON `conversation_summaries` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT 'New conversation' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_message_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_user_id_idx` ON `conversations` (`user_id`);--> statement-breakpoint
CREATE INDEX `conversations_user_last_message_idx` ON `conversations` (`user_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `conversations_user_updated_idx` ON `conversations` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`canonical_name` text NOT NULL,
	`display_name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entities_type_canonical_uidx` ON `entities` (`entity_type`,`canonical_name`);--> statement-breakpoint
CREATE INDEX `entities_canonical_name_idx` ON `entities` (`canonical_name`);--> statement-breakpoint
CREATE TABLE `memory_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entity_id` text,
	`category` text NOT NULL,
	`fact` text NOT NULL,
	`confidence` real NOT NULL,
	`source_message_id` integer NOT NULL,
	`source_conversation_id` text NOT NULL,
	`evidence_excerpt` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memory_facts_user_id_idx` ON `memory_facts` (`user_id`);--> statement-breakpoint
CREATE INDEX `memory_facts_user_active_idx` ON `memory_facts` (`user_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `memory_facts_entity_id_idx` ON `memory_facts` (`entity_id`);--> statement-breakpoint
CREATE INDEX `memory_facts_source_message_idx` ON `memory_facts` (`source_message_id`);--> statement-breakpoint
CREATE INDEX `memory_facts_source_conversation_idx` ON `memory_facts` (`source_conversation_id`);--> statement-breakpoint
CREATE TABLE `message_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` integer NOT NULL,
	`tool_name` text NOT NULL,
	`arguments` text NOT NULL,
	`result` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_tool_calls_message_id_idx` ON `message_tool_calls` (`message_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `messages_conversation_created_idx` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_created_at_idx` ON `messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `research_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`query` text NOT NULL,
	`title` text NOT NULL,
	`captured_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_snapshots_user_id_idx` ON `research_snapshots` (`user_id`);--> statement-breakpoint
CREATE INDEX `research_snapshots_conversation_id_idx` ON `research_snapshots` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `research_snapshots_captured_at_idx` ON `research_snapshots` (`captured_at`);--> statement-breakpoint
CREATE TABLE `research_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`domain` text NOT NULL,
	`content_excerpt` text NOT NULL,
	`published_at` integer,
	`retrieved_at` integer NOT NULL,
	`content_hash` text,
	FOREIGN KEY (`snapshot_id`) REFERENCES `research_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_sources_snapshot_id_idx` ON `research_sources` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `research_sources_domain_idx` ON `research_sources` (`domain`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
  content,
  conversation_id UNINDEXED,
  tokenize = 'porter unicode61'
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO message_fts(rowid, content, conversation_id)
  VALUES (new.id, new.content, new.conversation_id);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM message_fts WHERE rowid = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  DELETE FROM message_fts WHERE rowid = old.id;
  INSERT INTO message_fts(rowid, content, conversation_id)
  VALUES (new.id, new.content, new.conversation_id);
END;
