PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `admin_user_id` text NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_admin_user` ON `sessions` (`admin_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_sessions_expires_at` ON `sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `admin_user_id` text NOT NULL,
  `token_hash` text NOT NULL,
  `expires_at` text NOT NULL,
  `used_at` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_prt_token_hash` ON `password_reset_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_prt_admin_user` ON `password_reset_tokens` (`admin_user_id`);
