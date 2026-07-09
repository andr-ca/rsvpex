# RSVPex — Full Project Review & Recommendations

**Date:** 2026-07-09
**Scope:** Idea & product, architecture, implementation (all 40 modules in `app/src/`, migrations, tests), CI/CD, static marketing site, planning docs.
**Method:** Every source file was read line-by-line; behavioral claims were verified against library source (e.g. Hono `parseBody`) and migrations. Each finding cites file:line evidence.

---

## Executive Summary

The architecture is genuinely good: a single Worker exporting `fetch`/`queue`/`scheduled`, pure-function `domain/` layer, atomic conditional-INSERT capacity enforcement, D1 sessions instead of KV, idempotency table for at-least-once queue delivery. The phase-by-phase GSD discipline shows — each phase in isolation is competently built and well-tested (25 test files).

**But the app cannot ship today.** The dominant failure mode is *cross-phase integration rot*: later phases broke earlier ones, and integration tests mask it because they bypass the real browser flows:

- Phase 10's CSRF middleware **blocks every admin form** (no form embeds a token — only tests set the header).
- Phase 10's CSP **blocks Phase 5's admin charts** (inline scripts, no nonce).
- The public form ships a **literal Turnstile sitekey placeholder**, so no real user can ever pass CAPTCHA.
- Dietary restrictions — a headline feature — are **silently dropped** due to a form-field/parser name mismatch.
- Custom questions are validated server-side but **never rendered** in the form, so a required question makes the event un-RSVP-able.
- `wrangler.jsonc` still has `PLACEHOLDER` binding IDs and there is **no deploy pipeline for the Worker at all**.

Counts: **7 ship blockers (P0), 17 correctness/data-integrity issues (P1), 16 security findings (P1–P2), 8 CI/CD gaps, plus product/doc hygiene items.** Estimated effort to first shippable release: the P0 list is ~2–4 focused days; P1+security another 1–2 weeks.

**Single most valuable process fix:** add one Playwright E2E happy path (create event → publish → submit RSVP in a real browser → edit → admin edits → export). It would have caught every P0 below.

---

## 1. Idea & Product

**Verdict: strong, focused, viable.** "RSVP in under 30s, host owns the data, no third-party platform" is a crisp value proposition, and the Cloudflare-only stack matches it (single-tenant, near-zero hosting cost, EU-region D1 available).

| # | Finding | Recommendation |
|---|---------|----------------|
| I-1 | **Privacy-story contradiction.** The pitch is "no third-party storage of guest data", yet the landing waitlist posts name+email to Web3Forms (`static-web/index.html:60-67`). Waitlist ≠ guest RSVPs, but it's the same audience reading the promise. | Either disclose Web3Forms explicitly in `privacy.html`, or (better, post-launch) point the waitlist form at the Worker and store it in D1 — it's a one-table feature and makes the marketing claim literally true end-to-end. |
| I-2 | **`unlisted` visibility is cosmetic.** PUB-06 promises "no index", but unlisted events render identically to public ones — no `X-Robots-Tag: noindex` header, no `<meta name="robots">` (`app/src/routes/rsvpForm.ts:62-120`). | Emit `X-Robots-Tag: noindex` (and meta tag) for unlisted/private events; exclude them from any future sitemap. |
| I-3 | **Waitlist promotion sends no guest notification.** Admin promotes (`adminRsvps.ts:224-242`) but the guest is never told they're in. This undermines the waitlist feature's purpose. | Enqueue a `waitlist_promoted` notification message on successful promotion (idempotent via `notification_log`). |
| I-4 | **PUB-07 "countdown teaser" not implemented** — pre-open page shows a static date (`rsvpForm.ts:242-255`). Low stakes; either build the countdown or amend the requirement. | Amend REQUIREMENTS.md or add a small (CSP-compliant, external-file) countdown script. |
| I-5 | **PUB-03 deviation.** Kids mode should require children ≥ 1 and default adults to 0; code defaults `adults: 1` and lets `children_count: 0` pass (`rsvpSubmit.ts:39-43,139`). | Enforce kids-mode invariants in the Zod schema branch for kids events. |

---

## 2. Architecture

**Verdict: sound choices, two structural inconsistencies worth fixing before they calcify.**

What's right: Hono on a single Worker; pure `domain/` functions testable without Miniflare; conditional `INSERT … SELECT … WHERE` for capacity (correct answer to D1's no-`BEGIN IMMEDIATE` constraint); D1 sessions over KV (documented decision with correct reasoning); partial unique indexes for duplicate prevention; `notification_log` idempotency table.

| # | Finding | Recommendation |
|---|---------|----------------|
| A-1 | **Drizzle ORM is declared but unused at runtime.** Every query in the app is raw `db.prepare()` SQL; `drizzle-orm` (pinned 0.45.1, while CLAUDE.md documents 1.0.0-beta.2) is only referenced by `src/db/schema.ts` for migration generation. Schema enums have already drifted from reality (see C-13). | Pick one: (a) adopt Drizzle in the data layer so the schema is the single source of truth, or (b) demote it honestly — move `drizzle-orm` usage to a `schema.ts` consumed only by `drizzle-kit`, and update CLAUDE.md. Option (b) is less work and matches the current code style. |
| A-2 | **Both queues funnel into one handler that ignores `batch.queue`.** `wrangler.jsonc` configures `rsvpex-notifications` **and** `rsvpex-audit` consumers, but `handleQueue` (`app/src/handlers/queue.ts:35-49`) assumes every message is a `NotificationMessage`. Nothing ever produces to `AUDIT_QUEUE`, so today it's dead config; the day someone sends an audit message it will be misprocessed. | Either delete the audit queue + binding (audit writes go straight to D1 via `waitUntil`, which works fine), or branch on `batch.queue` in the handler. Deleting is simpler and matches actual usage. |
| A-3 | **Route-mounting is inconsistent** — some routers mount under `/rsvp` prefix, admin routers use full paths mounted at `/` with a warning comment (`app/src/app.ts:44-57`), and `requireAdmin` is re-attached per router (4 places: adminEvents:38, adminRsvps:38, adminQr:15, adminData:19). One forgotten `use()` in a future router = unauthenticated admin surface. | Mount one admin parent router: `admin.use('*', requireAdmin)` then `app.route('/rsvp/admin', admin)`. Single choke point for auth (and later, role checks). |
| A-4 | **`adminPage()` / `page()` / `escHtml()` duplicated 6×** with already-diverging CSS (`adminEvents.ts:364`, `adminRsvps.ts:350`, `adminDashboard.ts:70`, `adminLogin.ts:104`, `adminSetup.ts:71`, `adminPasswordReset.ts:146`). This duplication is *why* the CSRF hidden field is missing everywhere — there was no single form helper to fix. | Extract `src/views/layout.ts` (page shell, nav, styles) and a `form()` helper that always injects `_csrf`. |
| A-5 | **`SESSION_KV` binding is misnamed** — sessions live in D1; KV is used only by the rate limiter (`middleware/rateLimit.ts:34`). | Rename binding to `RATE_LIMIT_KV` (`wrangler.jsonc` + `wrangler types`). |
| A-6 | **i18n stack drift.** CLAUDE.md prescribes i18next/react-i18next; the implementation is a hand-rolled string map (`src/i18n/translations.ts`) — which is actually the *better* choice for SSR string templates on Workers. | Keep the implementation; fix CLAUDE.md. |

---

## 3. Ship Blockers (P0)

These make the deployed product non-functional for real users, while all 25 test files stay green.

| # | Finding | Evidence | Fix |
|---|---------|----------|-----|
| P0-1 | **Turnstile sitekey is a hardcoded placeholder.** The rendered widget uses `data-sitekey="TURNSTILE_SITE_KEY_PLACEHOLDER"`, so it never issues a token; with a real secret configured, every submission returns `captcha_missing`. | `rsvpForm.ts:326` | Add `TURNSTILE_SITE_KEY` as a Wrangler var (it's public, vars are fine) and interpolate it. |
| P0-2 | **Every admin mutation 403s in a real browser.** `csrfProtection()` requires an `X-CSRF-Token` header or `_csrf` form field on admin POSTs, but **no admin form embeds either** (`grep _csrf src/` → only the middleware). Integration tests pass because they set the header manually (`tests/integration/admin-events.test.ts` etc.). Create/edit/publish/archive event, RSVP edit/promote/delete, CSV import — all broken. | `middleware/csrf.ts:88-116` vs. all forms in `adminEvents.ts`, `adminRsvps.ts` | Via the A-4 form helper, render `<input type="hidden" name="_csrf" value="${token}">` into every admin form (read token from cookie server-side or generate per-render and set cookie). Add one browser-level E2E to prove it. |
| P0-3 | **Dietary restrictions are silently discarded.** Form inputs are named `dietary_kind[]` / `dietary_value[]` (`rsvpForm.ts:190,310-314`), but Hono's `parseBody()` keeps the brackets in the key (verified in `hono/dist/utils/body.js` — `form["dietary_kind[]"]`), while the handler reads `body.dietary_kind` (`rsvpSubmit.ts:44-45,160-169`; same in `rsvpPatch.ts:27-28`). Zod marks it optional → always empty → every RSVP stores `dietary: []`. No test covers the bracketed names. | as cited | Rename the Zod fields to `'dietary_kind[]'`/`'dietary_value[]'`, or drop brackets in the HTML and use `parseBody({ all: true })`. Add a regression test posting the exact HTML field names. |
| P0-4 | **Custom questions are never rendered.** `renderForm()` outputs no question fields, yet the submit handler enforces `required` answers (`rsvpSubmit.ts:195-230`). An event with one required question is impossible to RSVP to; optional questions can never be answered. Thank-you page renders answer rows that are always `—`. | `rsvpForm.ts:268-335` (no questions), `rsvpSubmit.ts:195-230` | Render `questionDefs` from `event.questions` in the form (all 5 types) and in the edit form. Note the admin UI also has no way to author questions (`eventForm()` hardcodes `questions: '[]'`, `adminEvents.ts:168`) — either build question authoring or de-scope GUEST-04 for v1. |
| P0-5 | **Admin charts and the archive-confirm are blocked by the app's own CSP.** `ADMIN_CSP` has no `'unsafe-inline'`/nonce for scripts (`middleware/securityHeaders.ts:31-42`), but the event page injects an inline `<script>` for Chart.js (`adminEvents.ts:554-579`) and an inline `onclick` confirm (`adminEvents.ts:228`). Result: no charts, and Archive submits **without** confirmation. | as cited | Move chart bootstrap to a static JS file served by the Worker (data via `data-*` attribute or JSON endpoint); replace `onclick` with an addEventListener in that file. Bundle Chart.js locally instead of jsdelivr (also fixes the third-party-CDN privacy leak and removes `cdn.jsdelivr.net` from CSP). |
| P0-6 | **Not deployable as configured.** `database_id: "PLACEHOLDER"`, KV `id: "PLACEHOLDER"` (`wrangler.jsonc:12,20`), and `TURNSTILE_SECRET_KEY: ""` sits in `vars` — Wrangler refuses to create a secret with the same name as a var, so the empty var permanently shadows the real secret. There is also **no CI job that deploys the Worker or applies D1 migrations** (deploy.yml only handles the static site). | `wrangler.jsonc`, `.github/workflows/deploy.yml` | Remove `TURNSTILE_SECRET_KEY` from `vars` entirely (secrets need no declaration). Provision real IDs (per-env via `env.production`/`env.staging` blocks). Add a Worker deploy workflow: `wrangler d1 migrations apply --remote` → `wrangler deploy`, gated on CI. |
| P0-7 | **Thank-you page "Edit RSVP" links to itself.** `href="?rid=${token}"` resolves to `/rsvp/thank-you?rid=…` — reloading the same page — while the real edit form lives at `/rsvp/:slug?rid=…` (`rsvpForm.ts:109-116`). Guests cannot reach the edit flow from the site (only from emails). | `rsvpThankYou.ts:134` | The thank-you query doesn't fetch `slug`; add it to the event SELECT and link `/rsvp/${slug}?rid=${token}`. |

---

## 4. Correctness & Data Integrity (P1)

| # | Finding | Evidence | Fix |
|---|---------|----------|-----|
| C-1 | **Guest edits bypass capacity entirely.** PATCH lets a guest flip `maybe`→`attending` or raise party size 1→50 with zero capacity check — GAP-04 guarded only *admin* edits. It also skips `max_party_size_per_rsvp`, the dietary ≤10 cap, children-age bounds (0–18 filter present on submit, absent on patch), and `closes_at` (edits allowed after RSVP closes). | `rsvpPatch.ts:32-117` vs. `rsvpSubmit.ts:137-245` | Route PATCH through the same validation pipeline as submit, and use a conditional-UPDATE capacity guard (like `promoteFromWaitlist`) when status/party increases. |
| C-2 | **Event edit silently resets settings.** `eventForm()` omits many fields the Zod schema defaults: saving an edit resets `allow_children/siblings/parents/status_choice` → true, `enable_heuristic_dup_check` → false, `notify_via_sms` → false, `max_party_size_per_rsvp` → 10, `reminder_days_before` → untouched-but-uneditable; `opens_at`/`closes_at`/`host_name` are uneditable. `updateEvent` writes every defined field (`adminEvents.ts` route :257-313, domain :203-318). | as cited | Render every schema field in the form (checkboxes for all `allow_*`, numbers for caps, datetime for open/close). For checkboxes, remember unchecked boxes are absent from form bodies — the current `default(...)` semantics only work if the control exists in the UI. |
| C-3 | **Guest edit form loses data.** Edit render shows only name/email/phone/adults/status/one dietary row/notes (`rsvpForm.ts:133-210`); PATCH then overwrites `children_count`/`parents_count`/`siblings_count` with 0-defaults, `answers` with `{}`, and dietary with the single row (`rsvpPatch.ts:56-113`). A kids-event guest who fixes a typo silently un-registers their children. | as cited | Render all party fields (kids-aware), all dietary rows, and question answers in the edit form; or make PATCH merge (only update supplied fields). |
| C-4 | **Concurrent duplicate submits → 500.** Duplicate check is check-then-insert; the partial unique indexes (`migrations/0001_init.sql:120-124`) then throw an unhandled constraint error on the loser. Same for PATCH email changes and CSV import phone duplicates. | `rsvpSubmit.ts:248-273`, `capacity.ts` inserts | Wrap inserts in try/catch for `UNIQUE constraint failed` → re-query token → return the friendly 409 `resend_edit_link` response. |
| C-5 | **Timezone handling is wrong end-to-end.** Admin enters `datetime-local` (no zone, no seconds, e.g. `2026-07-08T18:00`); it's stored raw, then (a) compared lexicographically against `new Date().toISOString()` for opens/closes/published checks (`rsvpSubmit.ts:120-125`), (b) parsed by `new Date(start_at)` — which treats zoneless strings as *local time*, i.e. UTC on Workers — for ICS (`ics.ts:177`), reminders (`date(start_at, …) = date('now')`, `cron.ts:48-57`), and thank-you display. Events show/fire offset by the event's UTC offset. | as cited | Normalize at the write boundary: interpret admin input in `event.timezone`, store UTC ISO-8601 with `Z`. Add a domain helper (`localToUtc(tz, localStr)` via `Intl`) and a test matrix around DST transitions. |
| C-6 | **Admin capacity guard is not atomic** despite GAP-04 claiming "same D1 atomic pattern": it's read-then-UPDATE (`adminRsvps.ts` domain :155-181), racing concurrent public submits. `promoteFromWaitlist` does it right (:277-292). | as cited | Reuse the conditional-UPDATE pattern from `promoteFromWaitlist` for the edit path. |
| C-7 | **Duplicate admin-alert emails.** `handleAdminAlert` has no `notification_log` guard (`handlers/queue.ts:109-121`) — a batch retry after a later message fails resends it. Threshold notify is also read-check-update racy (:123-145). | as cited | Log `admin_alert` per rsvpId like the others; make threshold marking a conditional `UPDATE … WHERE threshold_X_notified_at IS NULL` and check `meta.changes`. |
| C-8 | **CSV import can exceed Workers subrequest limits and capacity.** Up to 1,000 rows × 2 sequential D1 calls ≈ 2,000 subrequests (limit ~1,000/request) → import dies midway; imports also ignore `max_guests_total` entirely. | `adminData.ts:150-200` | Batch: one query to prefetch existing emails, then `db.batch()` chunks of ~50 inserts. Decide and document capacity semantics for imports (probably: allow but warn). |
| C-9 | **No retry backoff.** `msg.retry()` is called without `delaySeconds` (`handlers/queue.ts:46`) although the stack doc promises exponential backoff — Resend/Twilio outages will burn retries in seconds. | as cited | `msg.retry({ delaySeconds: Math.min(2 ** msg.attempts * 30, 3600) })`. |
| C-10 | **Hardcoded base URL + host-derived reset URL.** Emails link to hardcoded `https://rsvpex.app` (`handlers/queue.ts:33`), while password-reset links are built from the request's Host header (`adminPasswordReset.ts:66`) — the latter enables reset-link poisoning if the Worker answers on any extra hostname. | as cited | Single `DEPLOYMENT_DOMAIN` env var used for **all** outbound links; it's already typed in `worker-configuration.d.ts:19` but documented nowhere (see S-8). |
| C-11 | **One-reminder-forever.** `notification_log` UNIQUE(rsvp_id, 'reminder') means an RSVP can never receive a second reminder — even if the event is postponed a year. | `handlers/queue.ts:161-188` | Include a date component in the type (`reminder:2026-07-01`) or add a `dedupe_key` column. |
| C-12 | **`consumeResetToken` and `adminSetup` are check-then-act.** Two concurrent uses of one reset token both succeed (`adminAuth.ts:197-220`); two concurrent setup POSTs on a fresh deploy can both create admins (`adminSetup.ts:43-48`). | as cited | Reset: `UPDATE … SET used_at = ? WHERE id = ? AND used_at IS NULL`, check `meta.changes`. Setup: rely on the email UNIQUE index + catch, or an `INSERT … SELECT WHERE NOT EXISTS`. |
| C-13 | **Audit log is drifting and half-dead.** Routes write actions `publish`, `archive`, `rsvp_edit`, `rsvp_promote`, `rsvp_delete` that aren't in the schema enum (`db/schema.ts:178-191` — no DB CHECK, so they insert, but types lie). `redactPii()` and `buildDiff()` are never called; diffs are hand-rolled `{title}`/`{status}` stubs; exports and imports (enum members!) are never audited. | `grep redactPii\|buildDiff src/` → only `audit.ts` | Align the enum with reality; wire `buildDiff(before, after)` + `redactPii` into event/RSVP updates; audit export/import (they touch all guest PII — the most audit-worthy actions in the app). |
| C-14 | **GUEST-05 (token revocation) unimplemented.** `revokeToken()` exists (`rsvpEdit.ts:117-124`) but no route calls it. Also the RSVP-delete route exists but no UI links to it (`adminRsvps.ts:244-261` — orphan endpoint). | as cited | Add "Regenerate link" + "Delete" buttons on the admin RSVP edit page (with real confirms, CSP-compliant). |
| C-15 | **Admin RSVP-edit validation failures show the wrong error.** Any Zod failure redirects to `flash=capacity_error` ("Edit would exceed capacity") (`adminRsvps.ts:190-193`). | as cited | Distinct flash for validation errors, ideally re-rendering the form with messages. |
| C-16 | **JSON export re-auth `next` param goes nowhere.** The 403 points to `/rsvp/admin/login?next=…` but the login handler ignores `next` and always redirects to `/rsvp/admin` (`adminLogin.ts:99`). Also the manual cookie parsing here should be `getCookie` (`adminData.ts:55-60`). | as cited | Honor a same-origin-validated `next` after login (whitelist paths starting `/rsvp/admin`). |
| C-17 | **ICS DST scan is CPU-heavy.** `generateVtimezone` instantiates ~370 `Intl.DateTimeFormat` objects per download (`ics.ts:82-120` — one per day of the year via `getUtcOffsetMinutes`). On the 10 ms free-plan CPU budget this can exceed the limit. | as cited | Memoize per-timezone VTIMEZONE in a module-level `Map` (isolates live long enough to amortize), and binary-search the transition day instead of scanning 365 days. |

---

## 5. Security

The fundamentals are better than typical (argon2id at OWASP params with constant-time compare, hashed reset tokens, HttpOnly/Secure/SameSite cookies, parameterized SQL throughout, consistent HTML escaping in templates). Findings, highest impact first:

| # | Finding | Evidence | Fix |
|---|---------|----------|-----|
| S-1 | **Turnstile fails open.** Network error → `next()` (`middleware/turnstile.ts:53-63`). Any siteverify outage (or an attacker who can induce one) disables CAPTCHA silently. Also the `'test-secret'` bypass is compared against a production-settable value. | as cited | Fail closed with a friendly retry page; log a metric. Gate the test bypass on an explicit `ENVIRONMENT !== 'production'` check, not a magic secret value. |
| S-2 | **Secrets in logs.** `requestLogger` logs the full query string; `stripPii` redacts only `email/phone/dietary` — so `rid` edit tokens (`/rsvp/thank-you?rid=…`), private-event access tokens (`?t=…`), and **password-reset tokens** (`/rsvp/admin/password-reset/confirm?token=…`) all land in Cloudflare logs. These are bearer credentials. | `middleware/requestLogger.ts:36,68` | Add `rid`, `t`, `token` to the redaction regex; longer-term, move reset confirmation to POST-only consumption. |
| S-3 | **Unsalted IP hash is reversible.** SHA-256 of the raw IP (`domain/tokens.ts:28-34`) — the IPv4 space (2³²) brute-forces in seconds, defeating SEC-01's purpose. | as cited | HMAC-SHA-256 with a server-side secret (`IP_HASH_KEY` via `wrangler secret`), or at minimum a fixed pepper. |
| S-4 | **Rate limiter is best-effort only.** KV read-modify-write races (burst > 5 easily), KV is eventually consistent across POPs (global attacker gets ~5/min *per POP*), TTL resets on every write (window extension), and the `X-Forwarded-For` fallback is client-spoofable (`middleware/rateLimit.ts:26-47`; same XFF fallback in `turnstile.ts:44-45`, `rsvpSubmit.ts:281-282`). | as cited | Trust only `CF-Connecting-IP` in production. For enforcement that matters, use Cloudflare's native rate-limiting rules (zone-level, free tier includes it) or a Durable Object counter; keep the KV limiter as defense-in-depth only. |
| S-5 | **No rate limit or dummy-hash on admin login.** Login and password-reset endpoints have no IP throttle (the KV limiter mounts only on RSVP POST), and the unknown-user path returns without running argon2id (`adminLogin.ts:73-75` — the comment claims "always run the same checks" but doesn't), a timing oracle for account enumeration. Account lockout (5 fails/15 min) also lets an attacker lock the admin out at will. | as cited | Apply the rate limiter to `/rsvp/admin/login` and `/password-reset`; hash a dummy password when the user is missing; consider lockout keyed on (account × IP) rather than account alone. |
| S-6 | **Password reset doesn't invalidate sessions.** After a reset (the "my account is compromised" flow), existing attacker sessions stay valid for up to 7 days (`adminPasswordReset.ts:100-123` never touches `sessions`). | as cited | `DELETE FROM sessions WHERE admin_user_id = ?` on reset (and offer logout-all). Also: purge expired sessions + used/expired reset tokens in the daily cron. |
| S-7 | **CSV formula injection.** `csvCell` quotes but never escapes leading `= + - @` (`dataManagement.ts:58-64`); guest-controlled `name`/`notes` become executable formulas in the host's Excel/Sheets — a guest-to-host attack in a product whose buyer is the host. | as cited | Prefix cells matching `/^[=+\-@\t\r]/` with `'`. |
| S-8 | **CSRF's Origin check is dormant and the token is weak-mode.** The Origin comparison only runs if `DEPLOYMENT_DOMAIN` is set (`middleware/csrf.ts:69-86`) — and that var is documented in no sample file, so realistically it's unset. The double-submit cookie is unsigned and unbound to the session (subdomain cookie-injection bypass), compared non-constant-time, and login/logout are exempt (login CSRF possible). | as cited | Document + require `DEPLOYMENT_DOMAIN` (fail closed on missing Origin match for mutations). Bind the CSRF token to the session (store hash in the sessions row) or sign it with the already-documented-but-unused `SESSION_SECRET`. |
| S-9 | **`/rsvp/admin/setup` is a race-to-claim on every fresh deploy** (`adminSetup.ts:43-66`). Anyone who finds the URL before the owner becomes the admin. | as cited | Require a `SETUP_SECRET` (set via `wrangler secret`, shown once in deploy docs) as a form field; delete or no-op the route after first use. |
| S-10 | **`description_html` renders unsanitized** (`rsvpForm.ts:279`). Admin-authored today, so low risk — but combined with the future `editor` role (see S-12) it's stored XSS against the public form. CSP blocks inline *scripts* but not, e.g., markup/phishing content. | as cited | Sanitize server-side on write with an allowlist (no `<script>`, `on*`, `javascript:` URLs); keep CSP as backstop. |
| S-11 | **Documented security features that don't exist:** `SESSION_SECRET` ("used to sign session tokens") and `ARGON2_PEPPER` ("pepper applied to all argon2id hashes") appear in `.dev.vars.sample:17-23` but no code reads them. Misleading during a security audit. | as cited | Implement (pepper is a few lines in `hashPassword`/`verifyPassword`; note it breaks existing hashes — fine pre-launch) or remove from the sample. |
| S-12 | **`role` column (`admin`/`editor`) is never enforced** — `requireAdmin` checks session existence only (`middleware/requireAdmin.ts:15-28`). | as cited | Either enforce roles (editors: no export/import/delete?) or remove the column until needed. |
| S-13 | **Missing headers:** no HSTS (`Strict-Transport-Security`), no `Permissions-Policy`; CSP lacks `frame-ancestors` (X-Frame-Options covers it, but CSP is the modern control). | `middleware/securityHeaders.ts` | Add `Strict-Transport-Security: max-age=31536000; includeSubDomains`, minimal `Permissions-Policy`, `frame-ancestors 'none'`. |
| S-14 | **Non-constant-time comparisons of secrets:** private-event access token (`rsvpSubmit.ts:111`, `rsvpForm.ts:89`) and CSRF token (`csrf.ts:114`). Low practical exploitability over the network, but `crypto.subtle.timingSafeEqual` is available in Workers. | as cited | Use timing-safe compare for token equality checks. |
| S-15 | **Session hardening (nice-to-have):** session IDs are UUIDs stored plaintext in D1 — a DB read-leak = session hijack. | `adminAuth.ts:122-134` | Store SHA-256(sessionId), look up by hash; 32-byte random tokens instead of UUID. |
| S-16 | **QR page escaping is partial** — title escaped only for `<` (`adminQr.ts:32,37`), dashboard likewise (`adminDashboard.ts:140`). Admin-authored, low risk, but inconsistent with the rest. | as cited | Use the shared `escHtml` everywhere (falls out of A-4). |

---

## 6. Testing

**Strengths:** 25 test files; real Workers runtime via vitest-pool-workers; a genuine 20-way concurrency test for capacity (`tests/integration/capacity-concurrency.test.ts`); the `app.fetch(request, env)` isolation lesson is captured in STATE.md.

| # | Finding | Recommendation |
|---|---------|----------------|
| T-1 | **Integration tests exercise the API, not the product.** They post well-formed bodies with correct field names and manual CSRF headers — exactly why P0-2/3/4/7 survived. | Add one Playwright happy-path E2E driving real rendered HTML (the config exists at `playwright.config.ts` but `tests/e2e/` contains only `.gitkeep` and `@playwright/test`/`@axe-core/playwright` aren't even in `package.json`). This is the highest-ROI item in this document. |
| T-2 | **Coverage constraint (≥80%, 100% critical) is unenforced** — pool-workers can't instrument (documented in `vitest.config.ts`), so thresholds are decorative and CI runs `vitest run` without coverage. | Split a second vitest project running `src/domain/**` tests in the plain Node pool with coverage on (domain/ is pure by design — this is exactly what that layering buys you); keep pool-workers for integration. |
| T-3 | **Zero tests for:** dietary parsing from real form field names, custom-question render/submit round-trip, admin form CSRF round-trip, timezone/DST (ICS + reminders), CSV formula injection, PATCH capacity bypass. | Each P0/C-item fix above should land with its regression test; the ESLint `@req` rule (nice work, incidentally) makes traceability easy. |
| T-4 | **axe-core accessibility gate (TEST-02) absent.** | Add `@axe-core/playwright` checks on public form + thank-you + admin dashboard in the E2E job. |

---

## 7. CI/CD & Deployment

| # | Finding | Recommendation |
|---|---------|----------------|
| D-1 | **The Worker has no deployment pipeline.** `deploy.yml` covers only the static site; nothing runs `wrangler deploy` or `wrangler d1 migrations apply --remote` for `app/`. Migrations-then-deploy ordering, staging env, secret provisioning — all undefined. | Add `deploy-app.yml`: on main push (app paths) → CI green → `d1 migrations apply` → `wrangler deploy`. Define `env.staging`/`env.production` in `wrangler.jsonc` with distinct DB/KV/queue IDs. |
| D-2 | **Static deploy publishes internal files.** `wrangler pages deploy static-web` uploads the whole directory; the `[env.production] exclude` list in `static-web/wrangler.toml` is **not honored** by direct-upload Pages deploys. `specs/`, `.specify/`, `DEPLOY_NOW.md`, `GITEA_ACTIONS_SETUP.md` etc. are very likely live on the site. Verify: `curl https://<site>/specs/001-landing-page/spec.md`. | Build step: `rsync` the deployable files (html/css/js/images/robots/sitemap) into `dist/` and deploy that. |
| D-3 | **Package-manager split-brain:** root is a pnpm workspace (`pnpm-workspace.yaml`, `pnpm-lock.yaml`) while `app/` has `package-lock.json` and CI uses `npm ci`. Two lockfiles for one dependency tree. | Standardize on pnpm end-to-end (`pnpm install --frozen-lockfile` in CI, `cache: 'pnpm'`), delete `app/package-lock.json`. |
| D-4 | **CI shape:** lint → typecheck → test strictly serial, three full `npm ci` runs (~3× install cost); no build/bundle check; PR-only path filters mean workflow-adjacent changes (e.g. root lockfile) skip CI. | Run lint/typecheck/test as parallel jobs; add `wrangler deploy --dry-run --outdir dist` as a build gate (bundle-size + binding errors); consider `wrangler types` drift check (`git diff --exit-code worker-configuration.d.ts`). |
| D-5 | **No supply-chain hygiene:** no Dependabot/Renovate, no audit step, no CodeQL. | Add Renovate (grouped weekly) + `pnpm audit --prod` gate + CodeQL default setup. |
| D-6 | **Unused/odd dependencies:** `@touch4it/ical-timezones` (superseded by the hand-rolled VTIMEZONE), both `@vitest/coverage-v8` **and** `-istanbul` (neither usable, per T-2), `@hono/zod-validator` (declared, never used — validation is manual `safeParse`), `drizzle-orm` runtime dep per A-1. | Prune; each is bundle/install weight and audit surface. |
| D-7 | **`nodejs_compat` + `compatibility_date: 2025-01-01`** — date is over a year stale; `qrcode` (pngjs/zlib) is the only thing likely needing nodejs_compat. | Bump compat date deliberately (test suite makes this safe); consider a Workers-native QR lib to drop nodejs_compat entirely. |
| D-8 | **Cron timing is UTC-fixed** (`0 6 * * *`) — fine, but reminder "N days before" combined with C-5's UTC parsing means off-by-one reminder days for western-hemisphere events. | Covered by C-5's normalization; then document that reminders fire at 06:00 UTC. |

---

## 8. Planning & Documentation Hygiene

| # | Finding | Recommendation |
|---|---------|----------------|
| H-1 | **STATE.md is badly stale:** says "2/11 phases complete, Phase 3 pending" while git shows Phase 11 committed. ROADMAP/phase summaries stopped being written after Phase 2 (only `01-SUMMARY.md`, `02-SUMMARY.md` exist). The GSD state no longer reflects reality, which undermines every future `/gsd:*` invocation. | Run a state reconciliation (`/gsd:health` or manual): mark phases 3–11 complete with dates from git log, backfill or waive summaries. |
| H-2 | **PROJECT.md contradicts itself post-pivot:** Active requirements still headed "RSVP Application (Next.js / Self-Hosted)" and "Gitea Actions CI/CD" (`PROJECT.md:34,51`) despite the 2026-03-23 Cloudflare pivot note. | Update Active section to the Workers/D1 reality; move shipped items to Validated. |
| H-3 | **Repo carries three generations of dead scaffolding:** `rsvp/` (v5.2 Gitea/Proxmox architecture, superseded), `static-web-spec/` (duplicate of `static-web/.specify`), `.superpowers/brainstorm/` artifacts, `docs/superpowers/`. ~80 of 224 tracked files are legacy. | Archive: `git rm -r rsvp static-web-spec .superpowers docs/superpowers` (history preserves them); or move under `archive/` if you want them browsable. Keeps future agents (and humans) from reading superseded architecture as current. |
| H-4 | **CLAUDE.md tech-stack table drifts from reality:** drizzle-orm 1.0.0-beta.2 vs installed 0.45.1; i18next vs hand-rolled i18n; pino vs `console.log(JSON.stringify(...))` (the latter is *fine* on Workers — say so); React Router v7/Chart.js-react rows describe an app that was never built (SSR templates, no React). | Refresh the stack table to match `app/package.json` and actual patterns; it's the first thing every agent session reads. |
| H-5 | **No runbook.** Nothing documents: first deploy (create D1/KV/queues, set 8 secrets, apply migrations, visit `/rsvp/admin/setup`), local dev bootstrap, or backup/restore (D1 time-travel). | Add `app/README.md` runbook; include the secret list from `.dev.vars.sample` + `DEPLOYMENT_DOMAIN`, `TURNSTILE_SITE_KEY`, `SETUP_SECRET`. |

---

## 9. Prioritized Action Plan

**Milestone A — "It actually works" (P0, ~2–4 days)**
1. Turnstile sitekey env var (P0-1) + remove secret from `vars` (P0-6)
2. Shared layout/form helper injecting `_csrf` (P0-2, A-4)
3. Fix dietary field names + regression test (P0-3)
4. Render custom questions, or de-scope GUEST-04 (P0-4)
5. Externalize admin JS; bundle Chart.js locally (P0-5)
6. Fix thank-you edit link (P0-7)
7. Worker deploy workflow + real binding IDs (P0-6, D-1)
8. One Playwright happy-path E2E in CI (T-1) — the guard rail for all of the above

**Milestone B — "It's correct" (~1 week)**
- PATCH validation/capacity parity (C-1, C-3); event-edit field coverage (C-2)
- Timezone normalization + DST tests (C-5, D-8); duplicate-race 409s (C-4)
- Queue idempotency/backoff (C-7, C-9); DEPLOYMENT_DOMAIN everywhere (C-10)
- Import batching + capacity policy (C-8); audit wiring (C-13); revoke/delete UI (C-14)

**Milestone C — "It's hardened" (~1 week)**
- Turnstile fail-closed (S-1); log redaction (S-2); HMAC ip_hash (S-3)
- Login throttle + dummy hash (S-5); reset invalidates sessions (S-6)
- CSV injection escape (S-7); CSRF origin+binding (S-8); SETUP_SECRET (S-9)
- HTML sanitization (S-10); headers (S-13); implement or delete pepper/secret (S-11)

**Milestone D — pipeline & hygiene (parallel/ongoing)**
- Domain-layer coverage project (T-2); axe gate (T-4)
- pnpm unification (D-3); parallel CI + build gate (D-4); Renovate/CodeQL (D-5)
- Static-site dist deploy (D-2); dependency prune (D-6)
- GSD state reconciliation (H-1); PROJECT/CLAUDE.md refresh (H-2, H-4); legacy purge (H-3); runbook (H-5)

---

*Review performed 2026-07-09 against branch `fix/web3forms-json-submission` @ `828ee19` (== main tip). All file:line references are to that commit.*
