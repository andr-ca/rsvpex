# Quick Task 260710-ttv: Fix migration 0004 owner-backfill bug — Summary

**Date Completed:** 2026-07-11
**Status:** ✓ COMPLETE

---

## Objective

Fix a production bug discovered while manually validating quick task 260710-rkt (multi-user admin): migration `0004_admin_invites_and_roles.sql` added `admin_users.role` with `DEFAULT 'editor' NOT NULL`, which silently applied to every *pre-existing* row too, not just future inserts. On production — which already had one admin before this feature shipped — that left **zero active Owners** the instant migration 0004 ran, since the sole existing admin became an Editor. Editors cannot access any admin-management route, so this locked the real admin out of inviting/promoting/deactivating anyone.

Also folds in a broader validation pass explicitly requested alongside this fix: build real Playwright E2E coverage for the multi-user admin feature to prove it actually works end-to-end (not just that unit/integration tests pass against `app.fetch()` directly), and fix whatever that uncovers.

---

## What Was Built

### 1. Production hotfix (applied immediately, before this migration existed)
Ran a direct `UPDATE admin_users SET role = 'owner' WHERE email = 'andr@andr.ca'` against production to restore Owner access. Confirmed via `wrangler d1 execute --remote`.

### 2. Migration 0005 — idempotent backfill (`app/migrations/0005_backfill_admin_owner.sql`)
For any environment replaying migrations against a table with pre-existing rows (a developer's local persisted D1, a staging environment, etc.) where migration 0004 already ran: if no active Owner currently exists, promotes the earliest-created active `admin_users` row to Owner. Matches by `id` (not `created_at`) so two rows sharing a timestamp can never both match. No-ops on a fresh install (zero rows) and on any install that already has an active Owner (including production, already fixed manually).

### 3. Integration tests (`app/tests/integration/admin-management-backfill.test.ts`)
6 tests covering: empty table, sole editor promoted, only-the-oldest-of-many promoted, no-op when an owner exists, inactive rows never promoted, idempotency across repeated runs. Re-executes the exact backfill SQL directly (kept in sync with the migration file) rather than relying on migration-application timing, since migrations only run once at suite bootstrap — seeding rows afterward can't retroactively trigger a migration to re-run. Required a `beforeEach` table wipe: this pool shares D1 storage across tests within a file (confirmed empirically, not documented), so a test asserting on table-wide state (unlike most other tests here, which scope everything to their own seeded row's id) needs an explicit clean slate.

### 4. E2E validation (`app/tests/e2e/multi-user-admin.spec.ts`)
New Playwright spec driving the full invite → accept → promote → demote → deactivate → reactivate flow through a real `wrangler dev` server, plus axe-core WCAG 2 A/AA scans on every new page (admin list, invite form, invite-accept form). This is the layer that actually exercises the CSRF double-submit cookie flow and the `confirm()` dialogs on the management buttons — invisible to `app.fetch()`-based integration tests.

Writing and running this for real (not just writing it and trusting it) surfaced three additional real bugs, all fixed here:

- **`playwright.config.ts`**: local E2E runs never overrode `DEPLOYMENT_DOMAIN`, so server-rendered absolute links (admin-invite links, password-reset links) pointed at production (`https://rsvpex.com`) even during local test runs. The first E2E spec to navigate to one of those links (this one) would have silently made a real request against production instead of the local dev server. Added `--var DEPLOYMENT_DOMAIN:http://localhost:8787`.
- **`src/middleware/csrf.ts`**: fixing the above broke local CSRF validation in a different way — `wrangler dev --local-upstream` strips the port from the incoming `Origin` header before the Worker sees it (confirmed empirically: browser sends `Origin: http://localhost:8787`, Worker observes `http://localhost`). The pre-existing `http://localhost` fallback only activated when `DEPLOYMENT_DOMAIN` did *not* contain "localhost" — true before this task (production value), false now that E2E overrides it. Added a port-stripped variant of `DEPLOYMENT_DOMAIN` to the allowed-origins list specifically when it's localhost-based, so this only affects local/E2E behavior — production's `DEPLOYMENT_DOMAIN` is `https://rsvpex.com`, never matches the localhost branch.
- **`src/routes/adminManagement.ts`**: the "(self)" label in the admin list table used `color:#999` on white — a real WCAG AA contrast failure (2.84:1, needs 4.5:1), caught by the E2E spec's axe scan, not by any prior manual review. Changed to `#555`, matching the muted-text color already used elsewhere in the admin UI (e.g. `.tile-label`).

---

## Validation

- `pnpm run typecheck` — clean
- `pnpm run lint` — clean
- `pnpm run format:check` — clean
- `pnpm test` — 332/332 passing (37 files), up from 326 (new backfill test file)
- `pnpm exec playwright test` — 2/2 passing (`happy-path.spec.ts`, `multi-user-admin.spec.ts`), including all axe-core scans
- `pnpm run migrate:local` — migration 0005 applies cleanly on top of existing local state
- `pnpm run build` (`wrangler deploy --dry-run`) — succeeds
- Production: `andr@andr.ca` confirmed `role = 'owner'` via direct `wrangler d1 execute --remote` (manual fix applied before this migration existed; migration 0005 will be a no-op there when deployed, by design)

---

## Files Changed

- `app/migrations/0005_backfill_admin_owner.sql` (new)
- `app/tests/integration/admin-management-backfill.test.ts` (new)
- `app/tests/e2e/multi-user-admin.spec.ts` (new)
- `app/playwright.config.ts` (DEPLOYMENT_DOMAIN override for local E2E)
- `app/src/middleware/csrf.ts` (port-stripped localhost origin fix)
- `app/src/routes/adminManagement.ts` (WCAG AA contrast fix)
