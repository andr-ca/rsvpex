# Phase 4: Admin Auth - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

The host can securely log in to the admin area at `/rsvp/admin/login`, be locked out after 5 failed attempts for 15 minutes, reset a forgotten password via a 15-minute single-use email token, and have their session stored in D1. 2FA record fields are present but inactive. A one-time bootstrap endpoint seeds the first admin user.

Admin UI (dashboard, event CRUD, RSVP list) is Phase 5. Email delivery via Queues is Phase 7 (Phase 4 sends reset emails directly via Resend HTTP API). Cloudflare Access is deferred post-v1.

</domain>

<decisions>
## Implementation Decisions

### Session Storage & Cookies
- Sessions stored in D1 `sessions` table — KV eventual consistency (up to 60s stale) is unacceptable for auth state
- Session expiry: 7 days rolling; `expires_at` updated on each authenticated request
- Cookie attributes: `HttpOnly; SameSite=Lax; Secure` — satisfies SEC-03
- Sessions table: `(id TEXT PK, admin_user_id TEXT FK, expires_at TEXT, created_at TEXT)` — minimal; no device tracking in v1

### Login & Lockout
- Lockout after 5 consecutive failed attempts; duration: 15 minutes — per ADMIN-01
- 423 response during lockout: `{"error":"account_locked","retry_after_seconds":N}` — per success criterion
- `failed_login_attempts` reset to 0 on successful login
- Password reset flow clears lockout state (sets `locked_until = NULL`, `failed_login_attempts = 0`)

### Password Reset
- Token delivered via Resend HTTP API directly (not via Queue — Phase 4 only, Phase 7 adds queue-based email)
- Token expiry: 15 minutes — per ADMIN-02
- Token storage: D1 `password_reset_tokens` table `(id, admin_user_id, token_hash, expires_at, used_at)`; store SHA-256 hash of token, not plaintext
- Second-use response: 410 Gone `{"error":"token_used"}` — per ADMIN-02

### argon2id & Admin Bootstrap
- `@noble/hashes` argon2id at `m=19456, t=2, p=1` — OWASP minimum; pure-JS (no WASM), Workers-compatible; must complete < 200ms CPU
- First admin: `POST /rsvp/admin/setup` single-use bootstrap endpoint; returns 409 if any admin user already exists
- Route guard: Hono middleware `requireAdmin` — reads session cookie, queries D1 `sessions`, sets `c.var.adminUser`; registered on all `/rsvp/admin/*` routes except `/login`, `/setup`, `/password-reset`
- Logout: `POST /rsvp/admin/logout` hard-deletes session row from D1, clears cookie (Max-Age=0)

### the agent's Discretion
- HTML styling of login/reset forms (consistent with existing inline template-string pattern)
- Session ID format (UUID v4 is fine)
- Whether to add a `sessions` cleanup job for expired rows (can be deferred to Phase 8 cron)
- Error message wording on locked account HTML page vs JSON response

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/db/schema.ts`: `admin_users` table already defined with `failed_login_attempts`, `locked_until`, `two_factor_enabled`, `two_factor_secret`, `is_active`, `password_hash`
- `app/migrations/0001_init.sql`: `admin_users` DDL already in the applied migration — no new migration needed for `admin_users` itself
- `app/src/routes/rsvpForm.ts`: `page()` + `escHtml()` helper pattern for inline HTML rendering — reuse for login/reset forms
- `app/src/domain/tokens.ts`: `generateToken()` (crypto.randomUUID) — reuse for session IDs and reset tokens
- `app/src/app.ts`: Hono app with `methodOverride` middleware already registered; new admin routes added here

### Established Patterns
- **HTML rendering**: Inline template literal strings via `page(title, body)` + `escHtml()` — consistent with all prior routes
- **Route files**: One Hono router per route group exported as default; registered in `app.ts` via `app.route('/rsvp', router)`
- **Domain layer**: Pure functions in `app/src/domain/` that accept `D1Database` directly — no `c.env` — testable without Miniflare
- **Integration tests**: `app.fetch(request, env)` pattern; seed data in `beforeEach`; `@cloudflare/vitest-pool-workers`
- **Zod validation**: `schema.safeParse(body)` in route handler; return 400 with issues on failure
- **Error responses**: `c.json({ error: '...' }, statusCode)` for API; `c.html(renderXxx(), statusCode)` for HTML pages

### Integration Points
- New migration `0002_sessions_and_reset_tokens.sql` adds `sessions` + `password_reset_tokens` tables
- `app/src/middleware/requireAdmin.ts` — new middleware; reads `session_id` cookie, queries D1, attaches `adminUser` to context
- New routes: `adminLoginRouter`, `adminLogoutRouter`, `adminSetupRouter`, `adminPasswordResetRouter`
- `app.ts`: register `requireAdmin` on `app.use('/rsvp/admin/*', ...)` with path exclusions for public auth routes
- `app/tests/apply-migrations.ts`: must include new migration

</code_context>

<specifics>
## Specific Ideas

- The `sessions` table must be created in a new migration (not 0001_init.sql which is already applied)
- `password_reset_tokens` stores `token_hash` (SHA-256 hex) — never the raw token; raw token sent once via email only
- The `requireAdmin` middleware must NOT block `/rsvp/admin/login`, `/rsvp/admin/setup`, `/rsvp/admin/password-reset` routes
- argon2id benchmark test: the domain test must measure wall-clock time and assert < 200ms (Workers CPU limit concern)

</specifics>

<deferred>
## Deferred Ideas

- Cloudflare Access as admin guard — post-v1 architecture decision
- Session device tracking (`user_agent`, `ip_hash` on sessions row) — not needed for v1
- `sessions` expired-row cleanup job — deferred to Phase 8 cron

</deferred>

---

*Phase: 04-admin-auth*
*Context gathered: 2026-03-23*
