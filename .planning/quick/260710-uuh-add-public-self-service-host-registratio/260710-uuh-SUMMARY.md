# Quick Task 260710-uuh: Public Self-Service Host Registration — Summary

**Status:** Complete — merged to `main` via [PR #8](https://github.com/andr-ca/rsvpex/pull/8), deployed to production  
**Date:** 2026-07-10 (executor), 2026-07-11 (manual review, fixes, merge)  
**Branch:** `feat/host-self-registration` (rescued from a stray direct-to-`main` commit — see Commits below)

## What Was Built

Implemented public self-service host registration with strict event ownership scoping, enabling hosts to self-register without invite codes and manage only their own events, while Owner/Editor roles retain global visibility.

### Core Features

1. **Public Host Signup** — Self-service registration without invite codes at `/rsvp/admin/signup`
   - GET/POST endpoints for account creation
   - Email stored lowercase (case-insensitive)
   - Password hashing with pepper
   - Duplicate email detection (409 response)
   - Rate-limiting (adminAuthRateLimit middleware)

2. **Event Ownership Tracking** — `events.created_by` column added
   - Nullable column to maintain backward compatibility with legacy events
   - Indexed for efficient ownership queries
   - Set to creator's admin_user_id on event creation

3. **Authorization Domain Module** — New `src/domain/authorization.ts`
   - `appendOwnershipFilter()` — Generate ownership-scoped WHERE clauses
   - `verifyEventOwnership()` — Check if host owns event (strict equality, no NULL matching)
   - Single source of truth for ownership logic

4. **Role-Based Access Control** — Implemented across 6 admin routes
   - **adminDashboard.ts** — Stats queries filtered by ownership for hosts
   - **adminEvents.ts** — List/get/create/update/publish/archive with ownership checks
   - **adminRsvps.ts** — RSVP management with event ownership verification
   - **adminData.ts** — CSV/JSON export/import with ownership checks
   - **adminQr.ts** — QR code rendering with ownership verification
   - **adminManagement.ts** — Admin list filtered to exclude hosts (Owner/Editor only)

5. **Home Page Navigation** — Updated landing page
   - Added "Sign Up as Host" and "Admin Login" navigation links
   - Static nav (no client-side session detection)
   - Responsive CSS styling

### Files Created

- `app/migrations/0006_add_event_ownership_and_host_role.sql` — Migration adding created_by column and index
- `app/src/domain/authorization.ts` — Ownership verification helpers
- `app/src/routes/adminSignup.ts` — Public self-service signup route
- `tests/unit/authorization.test.ts` — Unit tests for authorization helpers
- `tests/integration/admin-signup.test.ts` — Integration tests for signup and ownership scoping

### Files Modified

- `app/src/db/schema.ts` — Extended role enum to ['owner', 'editor', 'host'], added createdBy column
- `app/src/domain/adminAuth.ts` — Added getAdminRole() helper
- `app/src/domain/adminEvents.ts` — Modified createEvent() to accept optional createdBy parameter
- `app/src/app.ts` — Registered adminSignupRouter
- `app/src/routes/adminDashboard.ts` — Applied ownership filtering to stats queries
- `app/src/routes/adminEvents.ts` — Added ownership checks to all CRUD routes
- `app/src/routes/adminRsvps.ts` — Added ownership verification to RSVP routes
- `app/src/routes/adminData.ts` — Added ownership checks to export/import routes
- `app/src/routes/adminQr.ts` — Added ownership check to QR rendering
- `app/src/routes/adminManagement.ts` — Filtered admin list to exclude hosts
- `static-web/index.html` — Updated home page navigation
- `static-web/css/main.css` — Added styling for navigation links

## Key Design Decisions

1. **Strict Equality Ownership Check** — Hosts cannot see legacy NULL-owner events
   - `event.created_by === adminUserId` (not: `OR created_by IS NULL`)
   - Result: Hosts see only events they created; legacy events remain Owner/Editor only

2. **Authorization Domain Layer** — Single source of truth
   - Pure functions in `authorization.ts` testable without HTTP context
   - Imported and used consistently across all routes
   - Clear separation of concerns

3. **404 Not 403** — Security by obscurity
   - Ownership verification failures return 404 (not Found)
   - Prevents attackers from discovering event existence via status codes

4. **Static Navigation** — No client-side session detection
   - httpOnly cookies cannot be read by JavaScript (security property S-15)
   - Nav links always visible and functional regardless of authentication state
   - Simplified frontend (no client-side session checking logic)

5. **Role-Based Filtering** — Conditional query construction
   - Owner/Editor queries unfiltered (see all events)
   - Host queries apply ownership filter with binding parameters
   - Prevents query optimization issues from mismatched parameter counts

## Corrections Applied

**Correction #1:** Strict ownership checking for hosts
- Research doc proposed: `event.created_by === adminUserId || event.created_by === null`
- Applied: `event.created_by === adminUserId` only
- Result: Hosts NEVER see legacy NULL-owner events

**Correction #2:** Static home page navigation
- Research doc proposed: Client-side session detection via `document.cookie`
- Applied: Removed all client-side session detection JavaScript
- Reason: httpOnly cookies are not readable by JavaScript (deliberate security property)

## Post-Execution Review: Issues Found and Fixed

The executor self-reported "336 passed, all clean." That report was incomplete — a full manual review (typecheck/lint/format re-run, direct code review of every ownership-checked route, and an exhaustive `grep` for every `FROM events`/`FROM rsvps`/`JOIN` across `src/`) found three real defects before merge, none caught by the executor's own validation pass:

1. **Unguarded route — `adminRsvps.ts` `POST /rsvp/admin/events/:id/rsvps/:rsvpId/revoke-token`.** This route was missing entirely from the original research doc's route inventory and had zero ownership verification. Any authenticated host could revoke or regenerate another admin's RSVP edit token for *any* event, host-owned or not. Fixed by adding the same `getAdminRole` → `verifyEventOwnership` → `404` pattern used everywhere else.

2. **D1 `.bind()` misuse — `adminDashboard.ts`.** All four dashboard stat queries called `.bind(role === 'host' ? [now, adminUserId] : [now])` — a single array literal passed to D1's variadic `bind(...values: unknown[])`. This binds one array as *one* parameter instead of spreading positional `?` placeholders, which D1 rejects at query time. The surrounding `try/catch` silently swallowed the error and returned all-zero stats with a "database error" tile — for **every role**, not just hosts, since even the non-host branch passed `[now]` as a single-element array rather than a spread value. This meant the entire dashboard was broken in production before this fix, invisibly (no test exercised it, no error surfaced to the user beyond a red status tile). Fixed by spreading: `.bind(...(role === 'host' ? [now, adminUserId] : [now]))`. Verified the fix is load-bearing by reverting it and confirming the new dashboard test fails without it.

3. **Missing CSRF exemption — `/rsvp/admin/signup`.** The new public signup route wasn't added to `EXEMPT_PATHS` in `csrf.ts`, so every signup POST 403'd with `csrf_token_missing`. Same category of bug as the invite-accept route in the prior multi-user task (260710-rkt) — pre-auth admin routes must be explicitly exempted.

Also rewrote `admin-signup.test.ts`'s ownership-scoping tests to exercise the real `POST /rsvp/admin/events` route (with a fetched CSRF token) instead of asserting only against direct DB inserts, and added `tests/integration/admin-dashboard.test.ts` to give the dashboard ownership-scoped queries test coverage for the first time.

All three fixes plus the new test file were committed as a single follow-up commit (`5ffc6e6`) before the PR was opened, so PR #8's CI run reflects the corrected code, not the executor's original state.

## Validation Results (final, post-fix)

✓ TypeScript typecheck: 0 errors  
✓ ESLint: 0 errors  
✓ Prettier format check: All files compliant  
✓ Vitest suite: 343 passed (341 executor baseline + 2 new dashboard tests)  
✓ Wrangler deploy --dry-run: Succeeds with all bindings recognized  
✓ PR #8 CI: Lint, Typecheck, Unit Tests, E2E Tests, Build (dry-run), Dependency audit, CodeQL, Analyze — all green  
✓ Production: migration 0006 applied (`events.created_by` column confirmed present via `wrangler d1 execute --remote`), `/healthz` → 200, `/rsvp/admin/signup` → 200, home page nav links live

### Test Coverage Notes

- **Unit tests:** appendOwnershipFilter() and verifyEventOwnership() logic
- **Integration tests:**
  - Ownership checks return 404 for unauthorized access
  - Legacy NULL-owner events invisible to hosts
  - Owner/Editor see all events including legacy
  - Real `POST /rsvp/admin/events` → `created_by` persisted correctly, cross-host 404
  - Dashboard stat queries return correct ownership-scoped counts for hosts and correct global counts for owners (regression coverage for the `.bind()` bug above)

## Backward Compatibility

- Legacy events with `created_by = NULL` visible to Owner/Editor (unchanged behavior)
- Legacy events with `created_by = NULL` invisible to hosts (new behavior, correct)
- Existing Owner/Editor functionality unchanged
- No breaking changes to existing routes

## Known Limitations

- No Turnstile/CAPTCHA on `/rsvp/admin/signup` — relies on `adminAuthRateLimit` (5/min/IP) only. Acceptable for now given the admin surface isn't the public RSVP form, but worth revisiting if bot signups become a problem.
- No E2E (Playwright) coverage for the signup → create-event → cross-host-404 flow specifically; integration tests cover it at the HTTP layer but not through a real browser.

## Commits

1. `7cd7aaf` — Task 1: Migration and schema extensions
2. `326c5f4` — Task 2: Authorization domain module
3. `56b77de` — Task 3: Public signup route
4. `56cdaf4` — Task 4: adminDashboard ownership filtering
5. `65e05cd` — Task 5: adminEvents ownership checks
6. `9126250` — Task 6: adminRsvps ownership checks
7. `4fadefb` — Task 7: adminData ownership checks
8. `1645c4e` — Task 8: adminQr ownership check
9. `bef3927` — Task 9: adminManagement host filtering
10. `0c9b1b1` — Task 10: Home page navigation
11. `0c75662` — Tasks 11-12: Unit and integration tests
12. `842c1c7` — Format fixes and test simplification
13. `a399a7c` — Docs: Task 13 SUMMARY.md (executor's original, pre-review version)
14. `5ffc6e6` — **Post-review fixes**: revoke-token ownership gap, D1 `.bind()` regression + test, CSRF exemption
15. Merged to `main` as `86d62d4` (PR #8, squash merge)

## Next Steps (Not in Scope)

- Playwright E2E tests for full user workflows
- Host profile page (`/rsvp/admin/host/profile`)
- Host password reset flow
- Host account deactivation workflow
- Invite-based host provisioning (if organizational accounts needed)
