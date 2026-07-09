-- S-12 in recommendations.md: `role` (admin/editor) was never read by any
-- query or enforced by requireAdmin middleware, and there is no admin-user
-- management UI that could ever set it to anything but the 'admin' default.
-- A column that looks like an access control but isn't is worse than no
-- column — drop it until role-based access is actually implemented.
PRAGMA foreign_keys = ON;
--> statement-breakpoint
ALTER TABLE `admin_users` DROP COLUMN `role`;
