CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`user_message_id` integer,
	`assistant_message_id` integer,
	`model` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`tool_call_count` integer DEFAULT 0 NOT NULL,
	`search_call_count` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`duration_ms` integer,
	`error_category` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assistant_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_runs_user_id_idx` ON `agent_runs` (`user_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_conversation_id_idx` ON `agent_runs` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_status_idx` ON `agent_runs` (`status`);--> statement-breakpoint
CREATE INDEX `agent_runs_started_at_idx` ON `agent_runs` (`started_at`);