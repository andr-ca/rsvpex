# Quick Task 260710-rkt: Plan and implement multi-user admin functionality for RSVPex - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Task Boundary

RSVPex currently supports exactly one admin account, created once via the
`/rsvp/admin/setup` bootstrap route (which 409s once any admin exists). There
is no way to add a second admin through the app, no role/permission model,
and no admin-account management UI. This task adds real multi-user support:
invite-based provisioning of additional admins, an Owner/Editor role split,
and admin-account management (deactivation) restricted to Owners.

Event/RSVP data model is explicitly OUT of scope for scoping changes — all
events stay global/shared across all admins regardless of role.

</domain>

<decisions>
## Implementation Decisions

### Provisioning (how new admins are created)
- Invite-by-email flow, not direct account creation by another admin.
- Reuse the existing `password_reset_tokens` pattern (hashed token, 15-min-style
  expiry — pick an appropriate invite expiry, e.g. 7 days, since this isn't a
  password reset) for the invite token rather than inventing a new mechanism.
- The invited user sets their own password when they redeem the invite link —
  the inviting admin never sees or sets the new admin's password.
- Email delivery is best-effort via the existing Resend integration
  (`RESEND_API_KEY`, same pattern as `sendResetEmail` in
  `adminPasswordReset.ts`, no-op if the key isn't configured). **Production
  currently has no `RESEND_API_KEY` secret set** (confirmed via
  `wrangler secret list`), so email sending will silently no-op in prod today
  — the invite UI MUST always display/copy the invite link directly so the
  flow works even with email unconfigured. This mirrors the current
  (currently non-functional in prod) password-reset email behavior — not a
  regression introduced by this task, but worth being aware of.

### Roles
- Add a `role` column to `admin_users`: `'owner' | 'editor'`.
- Owners and Editors have identical access to events/RSVPs/dashboard/exports/audit
  log — the role split ONLY gates admin-account management (inviting,
  deactivating, promoting/demoting other admins).
- Only Owners can: send invites, deactivate/reactivate other admin accounts,
  change another admin's role.
- Editors cannot access any admin-management UI/routes at all (403, not just
  hidden UI — enforce server-side).
- The first admin created via `/rsvp/admin/setup` (the bootstrap route) is
  always created as `owner`.
- At least one active Owner must exist at all times — block any action
  (deactivate, demote) that would leave zero active Owners.

### Event scoping
- No change. Events remain global — every admin (Owner or Editor) sees and
  manages every event. No `owner`/`created_by` column added to `events`.

### Deactivation
- Only Owners can deactivate/reactivate admin accounts (see Roles above).
- Self-deactivation is blocked (can't lock yourself out) — consistent with
  the "at least one active Owner" invariant.
- Deactivating an admin immediately invalidates all of their existing
  sessions (reuse `deleteAllSessionsForUser`, same as the password-reset flow
  already does for S-6).
- No separate "remove/delete" admin account feature — deactivate (`is_active
  = 0`) is sufficient; matches how `is_active` is already used elsewhere in
  the schema.

### Claude's Discretion
- Exact invite token expiry window (proposed: 7 days — long enough to not be
  annoying, short enough to bound a leaked-link risk; open to adjusting).
- Whether promote/demote (owner ↔ editor) ships in this round or is deferred —
  lean toward shipping it since it's a small addition once the role column
  and Owner-only admin routes exist.
- UI/UX details for the admin-management page (list of admins, invite form,
  status badges) — follow existing admin dashboard conventions
  (`src/views/layout.ts`, server-rendered HTML, no client framework).
- Whether to add a dedicated `admin_invites` table vs. reusing
  `password_reset_tokens` with a type discriminator — planner/executor should
  pick whichever is cleaner given the existing schema (a new table is
  probably cleaner: reset tokens don't carry an email/role for an
  account that doesn't exist yet).

</decisions>

<specifics>
## Specific Ideas

No specific UI mockups or examples provided — follow the existing admin
dashboard's plain server-rendered HTML style (see `adminLogin.ts`,
`adminSetup.ts`, `adminPasswordReset.ts` for the established page/form/CSS
pattern).

</specifics>

<canonical_refs>
## Canonical References

- `app/src/db/schema.ts` — `adminUsers`, `passwordResetTokens`, `sessions` table definitions to extend/mirror.
- `app/src/domain/adminAuth.ts` — `hashPassword`, `createResetToken`/`consumeResetToken` pattern, `deleteAllSessionsForUser`, `timingSafeEqual` usage to reuse for invite tokens.
- `app/src/routes/adminPasswordReset.ts` — closest existing analog for a token-based, email-delivered flow (`sendResetEmail` pattern) to mirror for invites.
- `app/src/routes/adminSetup.ts` — bootstrap route; must be updated so the first-created admin gets `role = 'owner'`.
- `app/src/routes/adminLogin.ts` — `requireAdmin`-style middleware location; will need an `requireOwner`-style guard for admin-management routes.

</canonical_refs>
