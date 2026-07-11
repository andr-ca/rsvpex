-- S-12 resolution in recommendations.md: re-add role column to admin_users with proper Owner/Editor role split
-- Also add admin_invites table for invite-based admin provisioning
PRAGMA foreign_keys = ON;
--> statement-breakpoint
ALTER TABLE `admin_users` ADD COLUMN `role` text DEFAULT 'editor' NOT NULL;
--> statement-breakpoint
CREATE TABLE `admin_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_admin_invites_email` ON `admin_invites` (`email`);
--> statement-breakpoint
CREATE INDEX `idx_admin_invites_token_hash` ON `admin_invites` (`token_hash`);
