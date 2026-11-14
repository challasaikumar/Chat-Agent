ALTER TABLE `research_snapshots` ADD `provider` text DEFAULT 'tavily' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_snapshots` ADD `provider_request_id` text;--> statement-breakpoint
ALTER TABLE `research_snapshots` ADD `search_parameters` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_snapshots` ADD `response_time_ms` integer;--> statement-breakpoint
ALTER TABLE `research_snapshots` ADD `result_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `research_snapshots_provider_idx` ON `research_snapshots` (`provider`);--> statement-breakpoint
ALTER TABLE `research_sources` ADD `relevance_score` real;--> statement-breakpoint
ALTER TABLE `research_sources` ADD `favicon_url` text;--> statement-breakpoint
CREATE INDEX `research_sources_url_idx` ON `research_sources` (`url`);--> statement-breakpoint
CREATE INDEX `research_sources_content_hash_idx` ON `research_sources` (`content_hash`);