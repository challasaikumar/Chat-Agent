ALTER TABLE `agent_runs` ADD `client_request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_client_request_uidx` ON `agent_runs` (`user_id`,`client_request_id`);