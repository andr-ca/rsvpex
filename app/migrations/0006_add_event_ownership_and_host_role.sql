PRAGMA foreign_keys = ON;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `created_by` text;
--> statement-breakpoint
CREATE INDEX `idx_events_created_by` ON `events` (`created_by`);
