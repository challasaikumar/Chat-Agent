CREATE TABLE `claim_evidence_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`source_id` text NOT NULL,
	`relationship` text NOT NULL,
	`evidence_excerpt` text NOT NULL,
	`directness` text NOT NULL,
	`confidence` real NOT NULL,
	`reasoning_summary` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`claim_id`) REFERENCES `research_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `research_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `claim_evidence_links_user_id_idx` ON `claim_evidence_links` (`user_id`);--> statement-breakpoint
CREATE INDEX `claim_evidence_links_claim_id_idx` ON `claim_evidence_links` (`claim_id`);--> statement-breakpoint
CREATE INDEX `claim_evidence_links_source_id_idx` ON `claim_evidence_links` (`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `claim_evidence_links_dedupe_uidx` ON `claim_evidence_links` (`claim_id`,`source_id`,`relationship`);--> statement-breakpoint
CREATE TABLE `claim_verification_results` (
	`id` text PRIMARY KEY NOT NULL,
	`verification_run_id` text NOT NULL,
	`evidence_link_id` text,
	`result` text NOT NULL,
	`assessment_reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`verification_run_id`) REFERENCES `claim_verification_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_link_id`) REFERENCES `claim_evidence_links`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `claim_verification_results_run_id_idx` ON `claim_verification_results` (`verification_run_id`);--> statement-breakpoint
CREATE INDEX `claim_verification_results_link_id_idx` ON `claim_verification_results` (`evidence_link_id`);--> statement-breakpoint
CREATE TABLE `claim_verification_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`status` text NOT NULL,
	`sufficiency_status` text NOT NULL,
	`source_count` integer DEFAULT 0 NOT NULL,
	`independent_source_count` integer DEFAULT 0 NOT NULL,
	`supporting_source_count` integer DEFAULT 0 NOT NULL,
	`contradicting_source_count` integer DEFAULT 0 NOT NULL,
	`assessment_summary` text NOT NULL,
	`metadata` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`claim_id`) REFERENCES `research_claims`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `claim_verification_runs_user_id_idx` ON `claim_verification_runs` (`user_id`);--> statement-breakpoint
CREATE INDEX `claim_verification_runs_claim_id_idx` ON `claim_verification_runs` (`claim_id`);--> statement-breakpoint
CREATE INDEX `claim_verification_runs_status_idx` ON `claim_verification_runs` (`status`);--> statement-breakpoint
CREATE INDEX `claim_verification_runs_created_at_idx` ON `claim_verification_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `source_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_id` text NOT NULL,
	`content_hash` text,
	`source_type` text NOT NULL,
	`publisher_relationship` text NOT NULL,
	`authority_score` real NOT NULL,
	`relevance_score` real NOT NULL,
	`transparency_score` real NOT NULL,
	`freshness_score` real NOT NULL,
	`directness_score` real NOT NULL,
	`overall_suitability_score` real NOT NULL,
	`freshness_category` text DEFAULT 'unknown' NOT NULL,
	`assessment_status` text DEFAULT 'assessed' NOT NULL,
	`assessment_reasons` text DEFAULT '[]' NOT NULL,
	`claim_category_hint` text,
	`suspicious_content` integer DEFAULT false NOT NULL,
	`assessed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `research_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `source_assessments_user_id_idx` ON `source_assessments` (`user_id`);--> statement-breakpoint
CREATE INDEX `source_assessments_source_id_idx` ON `source_assessments` (`source_id`);--> statement-breakpoint
CREATE INDEX `source_assessments_content_hash_idx` ON `source_assessments` (`content_hash`);--> statement-breakpoint
CREATE INDEX `source_assessments_assessed_at_idx` ON `source_assessments` (`assessed_at`);--> statement-breakpoint
CREATE TABLE `source_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_id` text NOT NULL,
	`related_source_id` text NOT NULL,
	`relationship_type` text NOT NULL,
	`confidence` real NOT NULL,
	`evidence` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `research_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_source_id`) REFERENCES `research_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `source_relationships_user_id_idx` ON `source_relationships` (`user_id`);--> statement-breakpoint
CREATE INDEX `source_relationships_source_id_idx` ON `source_relationships` (`source_id`);--> statement-breakpoint
CREATE INDEX `source_relationships_related_source_id_idx` ON `source_relationships` (`related_source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `source_relationships_dedupe_uidx` ON `source_relationships` (`source_id`,`related_source_id`,`relationship_type`);