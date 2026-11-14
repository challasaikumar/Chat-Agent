-- Phase 10: composite indexes for common temporal + memory retrieval paths
CREATE INDEX IF NOT EXISTS `research_snapshots_user_conversation_captured_idx`
  ON `research_snapshots` (`user_id`,`conversation_id`,`captured_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `memory_facts_user_active_key_idx`
  ON `memory_facts` (`user_id`,`is_active`,`memory_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `messages_conversation_role_created_idx`
  ON `messages` (`conversation_id`,`role`,`created_at`);
