ALTER TABLE `users` ADD `email_normalized` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `password_updated_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_normalized_uidx` ON `users` (`email_normalized`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`csrf_token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`absolute_expires_at` integer NOT NULL,
	`revoked_at` integer,
	`user_agent_hash` text,
	`ip_address_hash` text,
	`session_metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_hash_uidx` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_id_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expires_at_idx` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`resource_type` text,
	`resource_id` text,
	`result` text NOT NULL,
	`request_id` text,
	`ip_address_hash` text,
	`user_agent_hash` text,
	`metadata` text,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `audit_events_actor_idx` ON `audit_events` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `audit_events_action_created_idx` ON `audit_events` (`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_created_at_idx` ON `audit_events` (`created_at`);
