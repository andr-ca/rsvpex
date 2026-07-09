PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE `admin_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text,
	`role` text DEFAULT 'admin' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`failed_login_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`two_factor_enabled` integer DEFAULT false NOT NULL,
	`two_factor_secret` text,
	`recovery_codes` text DEFAULT '[]' NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_email_unique` ON `admin_users` (`email`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`diff_json` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_created_at` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_entity` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_actor` ON `audit_logs` (`actor_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_action` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`host_name` text,
	`description_html` text,
	`timezone` text DEFAULT 'America/Toronto' NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text,
	`location_text` text,
	`wishlist_url` text,
	`visibility` text DEFAULT 'public' NOT NULL,
	`access_token` text,
	`access_token_expires_at` text,
	`is_kids_event` integer DEFAULT false NOT NULL,
	`allow_children` integer DEFAULT true NOT NULL,
	`allow_siblings` integer DEFAULT true NOT NULL,
	`allow_parents` integer DEFAULT true NOT NULL,
	`allow_status_choice` integer DEFAULT true NOT NULL,
	`enable_waitlist` integer DEFAULT false NOT NULL,
	`enable_heuristic_dup_check` integer DEFAULT false NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`max_guests_total` integer,
	`max_party_size_per_rsvp` integer DEFAULT 10 NOT NULL,
	`opens_at` text,
	`closes_at` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`questions` text DEFAULT '[]' NOT NULL,
	`notify_via_email` integer DEFAULT true NOT NULL,
	`notify_via_sms` integer DEFAULT false NOT NULL,
	`reminder_days_before` integer DEFAULT 7,
	`threshold_80_notified_at` text,
	`threshold_100_notified_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_events_status` ON `events` (`status`);--> statement-breakpoint
CREATE INDEX `idx_events_visibility` ON `events` (`visibility`);--> statement-breakpoint
CREATE INDEX `idx_events_start_at` ON `events` (`start_at`);--> statement-breakpoint
CREATE TABLE `notification_log` (
	`id` text PRIMARY KEY NOT NULL,
	`rsvp_id` text NOT NULL,
	`notification_type` text NOT NULL,
	`sent_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`rsvp_id`) REFERENCES `rsvps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_notification_log_rsvp_type` ON `notification_log` (`rsvp_id`,`notification_type`);--> statement-breakpoint
CREATE TABLE `rsvps` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`adults` integer DEFAULT 1 NOT NULL,
	`parents_count` integer DEFAULT 0 NOT NULL,
	`siblings_count` integer DEFAULT 0 NOT NULL,
	`children_count` integer DEFAULT 0 NOT NULL,
	`children_ages` text DEFAULT '[]',
	`dietary` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`answers` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'attending' NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`rsvp_token` text NOT NULL,
	`submitted_at` text DEFAULT (datetime('now')) NOT NULL,
	`client_submitted_at` text,
	`ip_hash` text,
	`user_agent` text,
	`party_total` integer GENERATED ALWAYS AS (adults + parents_count + siblings_count + children_count) STORED,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_rsvps_event` ON `rsvps` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_rsvps_submitted_at` ON `rsvps` (`submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_rsvps_status` ON `rsvps` (`status`);--> statement-breakpoint
CREATE INDEX `idx_rsvps_token` ON `rsvps` (`rsvp_token`);
--> statement-breakpoint
-- Partial unique indexes for duplicate prevention
CREATE UNIQUE INDEX IF NOT EXISTS `uidx_rsvps_event_email`
  ON `rsvps`(`event_id`, lower(`email`))
  WHERE `email` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uidx_rsvps_event_phone`
  ON `rsvps`(`event_id`, `phone`)
  WHERE `phone` IS NOT NULL;
--> statement-breakpoint
-- updated_at triggers
CREATE TRIGGER IF NOT EXISTS `trg_admin_users_updated_at`
BEFORE UPDATE ON `admin_users`
FOR EACH ROW BEGIN
  UPDATE `admin_users` SET `updated_at` = datetime('now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `trg_events_updated_at`
BEFORE UPDATE ON `events`
FOR EACH ROW BEGIN
  UPDATE `events` SET `updated_at` = datetime('now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `trg_rsvps_updated_at`
BEFORE UPDATE ON `rsvps`
FOR EACH ROW BEGIN
  UPDATE `rsvps` SET `updated_at` = datetime('now') WHERE `id` = NEW.`id`;
END;