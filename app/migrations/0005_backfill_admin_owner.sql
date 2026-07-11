-- Fixes a bug in migration 0004: `ALTER TABLE admin_users ADD COLUMN role
-- text DEFAULT 'editor' NOT NULL` applies that default to every PRE-EXISTING
-- row too, not just future inserts. On any install that already had an admin
-- before this feature shipped (e.g. production), that silently demoted the
-- only admin to Editor, leaving zero active Owners the instant 0004 ran —
-- Editors cannot access admin-management routes at all, so this locks
-- everyone out of inviting/promoting/deactivating anyone.
--
-- Backfill: if no active Owner currently exists, promote the earliest-created
-- active admin_users row to Owner. Idempotent and safe as a no-op on a fresh
-- install (zero rows) and on any install that already has an active Owner
-- (including production, already manually corrected before this migration
-- was written).
PRAGMA foreign_keys = ON;
--> statement-breakpoint
UPDATE admin_users
SET role = 'owner'
WHERE id = (
    -- Match by id (not created_at) so two rows sharing the same timestamp
    -- can never both match this UPDATE — exactly one row is promoted.
    SELECT id FROM admin_users
    WHERE is_active = 1 AND role = 'editor'
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM admin_users WHERE is_active = 1 AND role = 'owner'
  );
