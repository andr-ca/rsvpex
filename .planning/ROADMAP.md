# Roadmap: RSVPex — RSVP Application

**Project:** RSVPex — self-hosted RSVP management on Cloudflare Workers + D1 + Queues + Pages  
**Granularity:** Fine (11 phases)  
**Coverage:** 44/44 requirements mapped (40 v1 + 4 actionable gap requirements)  
**Last updated:** 2026-03-23

---

## Phases

- [ ] **Phase 1: Foundation** — Monorepo scaffold, D1 schema + Drizzle, Worker bindings, health endpoint, CI toolchain
- [ ] **Phase 2: Public RSVP Form Core** — RSVP submit flow, capacity enforcement, duplicate prevention, rate limiting, Turnstile CAPTCHA
- [ ] **Phase 3: Thank-You, ICS & Edit Flow** — Thank-you page, ICS calendar download, gift registry, RSVP token edit flow, guest data model
- [ ] **Phase 4: Admin Auth** — argon2id login, account lockout, password reset, KV sessions, 2FA fields
- [ ] **Phase 5: Admin Dashboard** — Event CRUD, RSVP list + filters, waitlist promotion, QR code, charts
- [ ] **Phase 6: Data Management** — CSV/JSON export (re-auth gated), CSV import with row-level error summary
- [ ] **Phase 7: Notifications** — Queue consumer, guest confirmation email, admin alert, capacity threshold emails, SMS
- [ ] **Phase 8: Cron & Audit** — Reminder emails via scheduled handler, audit log write path + 365-day purge
- [ ] **Phase 9: Internationalisation** — Event locale (en/fr/es) on public form, fallback to browser locale
- [ ] **Phase 10: Observability & Security Hardening** — Structured logging, OTEL traces, CSRF, strict CSP
- [ ] **Phase 11: Testing & CI** — GitHub Actions CI pipeline, coverage gates, E2E Playwright, axe-core CI gate, JSDoc tags

---

## Phase Details

### Phase 1: Foundation

**Goal:** The Worker project is scaffolded, wired to D1 + KV + Queues, runs locally and in CI, and proves the binding surface is correct before any feature code is written.

**Depends on:** Nothing (first phase — static site already deployed)

**Requirements:** SEC-05

**Success Criteria:**
1. `GET /rsvp/healthz` returns `{"status":"ok","db":"ok"}` with a live `SELECT 1` D1 probe; returns `{"status":"error","db":"down"}` with 503 when D1 is unreachable
2. `wrangler deploy --dry-run` succeeds with bundle gzip < 9 MB; `wrangler types` produces a typed `Env` interface with `DB`, `SESSION_KV`, `NOTIFICATIONS_QUEUE`, and `AUDIT_QUEUE` bindings
3. Vitest runs in `@cloudflare/vitest-pool-workers` pool with D1 migrations applied in `beforeAll`; a smoke test verifies `env.DB.prepare` is callable
4. D1 schema migration `0001_init.sql` (Drizzle-generated) applies cleanly with `wrangler d1 migrations apply --local` and `--remote`
5. `.env.sample` documents every secret (`RESEND_API_KEY`, `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `TURNSTILE_SECRET_KEY`, `SESSION_SECRET`, `ARGON2_PEPPER`); `.dev.vars` is gitignored

**Plans:** TBD

---

### Phase 2: Public RSVP Form Core

**Goal:** A guest can open an event's RSVP form, fill it out, and submit in under 30 seconds — with capacity enforcement, duplicate prevention, rate limiting, and CAPTCHA blocking bots.

**Depends on:** Phase 1

**Requirements:** PUB-01, PUB-02, PUB-03, PUB-04, PUB-05, PUB-06, PUB-07, PUB-08, CAP-01, CAP-02, CAP-03, CAP-04, CAP-05, SEC-01, SEC-02, GAP-02, GAP-06

**Gap Requirements:**
- **GAP-02** — When duplicate email/phone is detected (CAP-03), the API returns a user-friendly 409 response that offers to resend the edit link email; guests are not shown a bare error code
- **GAP-06** — When a private event's `access_token_expires_at` has passed, `GET /rsvp/:slug?t=<token>` returns 403 with message "Link expired" (not a generic 404 or empty page)

**Success Criteria:**
1. Concurrent load test: 20 simultaneous RSVP POSTs against a capacity-1 event results in exactly 1 `attending` RSVP and 19 `waitlist` (or 19 rejections when `enable_waitlist=false`); `meta.changes === 0` check is exercised in the test
2. Guest submitting with a duplicate email receives a 409 JSON response with `{"error":"already_rsvped","action":"resend_edit_link"}` and can trigger a resend of their edit link by confirming
3. Public form renders for events in `public`, `unlisted` visibility; `private` events redirect to an access-denied page without a valid `?t=` token; an expired token shows "Link expired" (403) not a blank page
4. Events before `opens_at` show a countdown teaser; events after `closes_at` show a closed page — neither renders the submit form
5. RSVP POST is blocked with 429 + `Retry-After` header after 5 submissions in 60 seconds from the same IP; Turnstile token is validated server-side before any D1 write

**Plans:** TBD

---

### Phase 3: Thank-You, ICS & Edit Flow

**Goal:** After submitting, a guest sees a confirmation page with their RSVP summary, can download a correct ICS calendar file, optionally visit the gift registry, and can return later to edit their RSVP using a token link.

**Depends on:** Phase 2

**Requirements:** PUB-09, PUB-10, GUEST-01, GUEST-02, GUEST-03, GUEST-04, GUEST-05, GAP-01

**Gap Requirements:**
- **GAP-01** — ICS file generated for PUB-09 includes a `VTIMEZONE` block matching the event's IANA timezone; changing the event timezone field alters ICS UTC offsets correctly; file is valid per RFC 5545

**Success Criteria:**
1. After RSVP submission, guest is redirected to `/rsvp/thank-you?rid=<token>`; the page shows their name, party size, dietary choices, event title, and (if set) a "View Gift Registry" button linking to the event's registry URL
2. Clicking "Download Calendar" on the thank-you page downloads a valid `.ics` file with `VEVENT`, `VTIMEZONE`, correct `DTSTART`/`DTEND` in the event's timezone, and a `SUMMARY` matching the event title; file opens correctly in Outlook, Google Calendar, and Apple Calendar
3. Visiting `/rsvp/:slug?rid=<token>` prefills the form with the guest's existing data; submitting the prefilled form calls `PATCH /rsvp/:id` and updates the RSVP; the `rid` token is required — editing without it returns 401
4. Admin revoking a guest's token (GUEST-05) via the admin dashboard regenerates the token; the old token becomes invalid within 60 seconds; the guest's new token is accessible via re-fetch of their RSVP record
5. Dietary restrictions (GUEST-01) are stored as a normalized JSON array with canonical lowercase values; custom dietary entries are persisted alongside predefined options; maximum 10 entries per RSVP is enforced with a clear validation error

**Plans:** TBD

---

### Phase 4: Admin Auth

**Goal:** The host can securely log in to the admin area with email and password, be locked out after failed attempts, reset a forgotten password, and have their session stored safely — with 2FA record fields in place for the future.

**Depends on:** Phase 1

**Requirements:** ADMIN-01, ADMIN-02, ADMIN-11

**Success Criteria:**
1. `POST /rsvp/admin/login` with valid credentials issues an HTTP-only `SameSite=Lax` session cookie backed by a D1 `sessions` table entry; the cookie is absent from JavaScript (`document.cookie` returns empty); subsequent admin requests are authenticated via this cookie
2. Five consecutive failed login attempts lock the account for 15 minutes; the 6th attempt during lockout returns 423 with `{"error":"account_locked","retry_after_seconds":N}`; a successful login resets the counter
3. `POST /rsvp/admin/password-reset` sends a single-use, 15-minute token to the registered email; using the token once sets the new password; a second use of the same token returns 410 Gone
4. `@noble/hashes` argon2id (pure-JS, no WASM) hashes passwords with OWASP minimum parameters (`m=19456, t=2, p=1`) and completes in < 200ms measured via `wrangler dev` CPU profiling on a cold isolate
5. `admin_users` table includes `two_factor_enabled INTEGER DEFAULT 0` and `two_factor_secret TEXT` columns; both are present and nullable; no 2FA logic is active (fields are inactive placeholders)

**Plans:** TBD

---

### Phase 5: Admin Dashboard

**Goal:** The host can create and manage events, view and filter the full RSVP list, promote waitlisted guests, download a QR code, and read at-a-glance charts — all with capacity guard on admin edits.

**Depends on:** Phase 2, Phase 3, Phase 4

**Requirements:** ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-06, ADMIN-07, ADMIN-10, GAP-04

**Gap Requirements:**
- **GAP-04** — Admin edits to an RSVP's party size that would push total attendance beyond `max_guests_total` trigger a transactional capacity recheck; the edit is blocked (with a clear error) or offered a waitlist slot, matching the same logic as the public submit path

**Success Criteria:**
1. Admin can create an event (title, slug, dates, capacity, visibility, locale, gift registry URL, kids-event toggle, reminder days) and publish it; auto-generated slug handles collisions by appending `-2`, `-3`; editing a published event saves changes and reflects them on the public form immediately
2. RSVP list shows all RSVPs for an event with pagination (50/page), filterable by status (attending/waitlist/declined), dietary restriction, date range, and free-text name search; all filter combinations return correct subsets
3. Admin promoting a waitlisted guest performs a transactional capacity recheck before setting status to `attending`; if capacity was filled by a concurrent promotion, the action is rejected with "No capacity available" — no overbooking occurs
4. Admin editing an RSVP's party size to a value that would exceed event capacity is blocked with a clear error message; the capacity guard uses the same D1 atomic transaction pattern as the public submit path
5. Dashboard tiles show count of active, upcoming, and recent events plus system status; charts render status pie, guest-type stacked bar, RSVPs-over-time line, and dietary bar using Chart.js with accessible `aria-label` and keyboard navigation; QR code PNG (512×512) is downloadable and encodes the correct event URL including `?t=` for private events

**Plans:** TBD

---

### Phase 6: Data Management

**Goal:** The host can export the guest list as CSV (safe for sharing with caterers) or JSON (with optional tokens), and import guests from a CSV with per-row error feedback.

**Depends on:** Phase 5

**Requirements:** ADMIN-08, ADMIN-09

**Success Criteria:**
1. `GET /rsvp/admin/events/:id/export.csv` returns a UTF-8 CSV with all RSVP fields except tokens; `Content-Disposition: attachment` header triggers browser download; dietary restrictions are expanded to human-readable comma-separated text
2. `GET /rsvp/admin/events/:id/export.json?include_tokens=true` requires a recent re-authentication step (session must have been issued within the last 15 minutes or re-auth modal completed); without re-auth, the endpoint returns 403; with re-auth, JSON includes `rsvp_token` per row
3. `POST /rsvp/admin/events/:id/import` accepts a CSV upload, validates each row against the RSVP schema, and returns `{"imported":N,"failed":M,"errors":[{"row":R,"reason":"..."}]}`; partial imports are committed (valid rows saved, invalid rows skipped); a row with a duplicate email reports the error without aborting the batch

**Plans:** TBD

---

### Phase 7: Notifications

**Goal:** Guests receive a confirmation email after RSVPing, the host is alerted on each new RSVP, capacity threshold emails fire at 80% and 100%, and optional SMS notifications work — all delivered reliably via Cloudflare Queues with idempotency guards against duplicate delivery.

**Depends on:** Phase 2, Phase 3

**Requirements:** NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-05

**Success Criteria:**
1. Guest confirmation email is sent via Resend HTTP API within ~5 seconds of RSVP submission; the email contains the guest's name, event title, RSVP summary, and a tokenized edit link (`/rsvp/:slug?rid=<token>`); email send is non-blocking (dispatched via `ctx.waitUntil` queue send, not in the HTTP response path)
2. Replaying the same queue message 3 times (simulating at-least-once retry) results in exactly 1 email sent; a `notification_log` table with `UNIQUE (rsvp_id, notification_type)` and `INSERT OR IGNORE` prevents duplicate sends
3. When attendance crosses 80% of `max_guests_total`, exactly one capacity threshold email is sent to the admin; crossing 100% sends a second; 5% hysteresis prevents re-triggering; emails are not resent if the threshold was already notified (D1 check on `events.threshold_80_notified_at`, `threshold_100_notified_at`)
4. Per-event SMS toggle (`notify_via_sms = true`) routes guest confirmation through Twilio HTTP API; with toggle off, Twilio is never called; SMS delivery errors are retried via queue `max_retries` without blocking the confirmation email path
5. Dead-letter queues are configured for both `rsvpex-notifications` and `rsvpex-audit` in `wrangler.jsonc`; a message exhausting all retries lands in the DLQ and does not silently disappear

**Plans:** TBD

---

### Phase 8: Cron & Audit

**Goal:** Reminder emails fire automatically N days before each event, old audit log rows are purged on a daily schedule, and every privileged admin action is durably recorded with PII-redacted diffs.

**Depends on:** Phase 7

**Requirements:** NOTIF-04, SEC-04

**Success Criteria:**
1. Cron trigger `0 6 * * *` fires the `scheduled` handler; it queries events where `date(start_at, '-' || reminder_days_before || ' days') = date('now')` and enqueues a `reminder` message per attending RSVP with an email; test with an event set to fire "today" confirms messages appear in the queue
2. Reminder emails contain the event title, date/time formatted in the event's timezone, the guest's name, and a tokenized edit link; guests with `notify_via_email = false` on their RSVP record are skipped
3. Every privileged admin action (event create/edit/delete, RSVP status change, waitlist promotion, token revocation) produces an `audit_log` row via `rsvpex-audit` queue; the diff is a JSON Merge Patch with email and phone fields replaced by their first-8-characters SHA-256 hex prefix
4. Daily purge job deletes `audit_log` rows where `created_at < datetime('now', '-365 days')`; a test seeding 370-day-old rows confirms they are removed after a simulated cron run; rows ≤ 365 days old are untouched
5. `scheduled` handler completes within the 30-second CPU budget for a realistic dataset (100 events × 200 RSVPs = 20,000 rows); batch enqueue via `sendBatch` is used to avoid N+1 queue sends

**Plans:** TBD

---

### Phase 9: Internationalisation

**Goal:** Public RSVP forms are displayed in the event's configured language (English, French, or Spanish), falling back to the browser's language when the event locale is not set.

**Depends on:** Phase 2, Phase 3

**Requirements:** I18N-01

**Success Criteria:**
1. An event with `locale = 'fr'` renders all public form labels, placeholders, error messages, and button text in French; an event with `locale = 'es'` renders in Spanish; `locale = 'en'` (default) renders in English
2. When `locale` is null or absent, the form falls back to the browser's `Accept-Language` header (first supported language, en/fr/es); if no match, English is used
3. The thank-you page, closed-event page, capacity-full page, and duplicate-detected message all respect the event's locale; no English strings leak into a French or Spanish event flow
4. Admin UI remains English-only; locale switching only affects routes under `/rsvp/:slug` (public form paths)

**Plans:** TBD

---

### Phase 10: Observability & Security Hardening

**Goal:** Every request produces structured logs for debugging, critical paths have OTEL traces, the admin area is hardened with CSRF protection and strict CSP, and all security controls meet the SEC requirements.

**Depends on:** Phase 4, Phase 5

**Requirements:** SEC-03, SEC-06

**Success Criteria:**
1. Every HTTP request produces a structured JSON log line (pino-compatible: `level`, `msg`, `reqId`, `method`, `path`, `status`, `durationMs`) written via `console.log`; no PII (email, phone, dietary data) appears in log output; logs are visible in `wrangler tail`
2. OTEL traces are emitted with custom spans for `domain/capacity.ts` (capacity check duration), `domain/duplicates.ts` (duplicate check duration), and queue send operations; trace IDs appear in log lines for correlation
3. All mutating admin endpoints (`POST`, `PATCH`, `DELETE`) validate a double-submit CSRF token (cookie value must match `X-CSRF-Token` header); requests missing or mismatching the token return 403; `Origin` header is checked against the deployment domain
4. HTTP response headers on all pages include `Content-Security-Policy: default-src 'self'; frame-src challenges.cloudflare.com; script-src 'self'` (adjusted for Turnstile); `X-Frame-Options: DENY`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`

**Plans:** TBD

---

### Phase 11: Testing & CI

**Goal:** The GitHub Actions CI pipeline enforces lint, typecheck, ≥80% unit coverage (100% on critical modules), E2E Playwright tests, and axe-core accessibility assertions — all gates must pass before any merge.

**Depends on:** All prior phases (validates the complete application)

**Requirements:** TEST-01, TEST-02, TEST-03

**Success Criteria:**
1. GitHub Actions CI runs on every push and PR: `lint` (ESLint + Prettier) → `typecheck` (tsc --noEmit) → `unit` (Vitest in Workers pool, D1 via Miniflare) → `e2e` (Playwright against `wrangler dev`); any failing step blocks merge; the pipeline completes in < 10 minutes
2. Unit test coverage report shows ≥80% globally and 100% on `domain/capacity.ts`, `domain/tokens.ts`, and `domain/duplicates.ts`; CI fails if these thresholds are not met; coverage is measured inside the Workers pool (not standard Node.js coverage)
3. axe-core accessibility assertions run in Playwright on the public RSVP form, thank-you page, and admin dashboard RSVP list; zero `critical` or `serious` violations are allowed; CI step fails if any violation is detected
4. Every exported function in `domain/`, `routes/`, and `handlers/` has a JSDoc `@req` tag referencing at least one requirement ID (e.g., `@req CAP-01`) and an `@adr` tag where an architectural decision was applied; ESLint custom rule enforces this and fails CI on missing tags

**Plans:** TBD

---

## Progress Table

| Phase | Name | Plans Complete | Status | Completed |
|-------|------|----------------|--------|-----------|
| 1 | Foundation | 0/? | Not started | — |
| 2 | Public RSVP Form Core | 0/? | Not started | — |
| 3 | Thank-You, ICS & Edit Flow | 0/? | Not started | — |
| 4 | Admin Auth | 0/? | Not started | — |
| 5 | Admin Dashboard | 0/? | Not started | — |
| 6 | Data Management | 0/? | Not started | — |
| 7 | Notifications | 0/? | Not started | — |
| 8 | Cron & Audit | 0/? | Not started | — |
| 9 | Internationalisation | 0/? | Not started | — |
| 10 | Observability & Security Hardening | 0/? | Not started | — |
| 11 | Testing & CI | 0/? | Not started | — |

---

## Coverage Map

| Requirement | Phase | Notes |
|-------------|-------|-------|
| SEC-05 | Phase 1 | Health endpoint proves D1 binding |
| PUB-01 | Phase 2 | Public form route + 30s submit |
| PUB-02 | Phase 2 | Form fields spec |
| PUB-03 | Phase 2 | Kids event mode validation |
| PUB-04 | Phase 2 | Standard event mode validation |
| PUB-05 | Phase 2 | Dietary restrictions on form |
| PUB-06 | Phase 2 | Visibility modes + access token |
| PUB-07 | Phase 2 | Time window enforcement |
| PUB-08 | Phase 2 | Waitlist mode when at capacity |
| CAP-01 | Phase 2 | D1 atomic transaction capacity check |
| CAP-02 | Phase 2 | Waitlist FIFO ordering |
| CAP-03 | Phase 2 | Duplicate prevention (email/phone) |
| CAP-04 | Phase 2 | Heuristic duplicate check |
| CAP-05 | Phase 2 | party_total computed; children_count == ages count |
| SEC-01 | Phase 2 | Rate limit 5/min/IP |
| SEC-02 | Phase 2 | Turnstile CAPTCHA server-side verification |
| GAP-02 | Phase 2 | Duplicate-detected UX: offer resend edit link |
| GAP-06 | Phase 2 | Expired access token → 403 "Link expired" |
| PUB-09 | Phase 3 | Thank-you page + ICS download |
| PUB-10 | Phase 3 | Edit flow via rid token |
| GUEST-01 | Phase 3 | Dietary JSONB normalized storage |
| GUEST-02 | Phase 3 | Gift registry URL on thank-you |
| GUEST-03 | Phase 3 | Party composition tracking |
| GUEST-04 | Phase 3 | Custom questions per event |
| GUEST-05 | Phase 3 | RSVP token revocation with 60s grace |
| GAP-01 | Phase 3 | ICS VTIMEZONE block required |
| ADMIN-01 | Phase 4 | argon2id login + lockout |
| ADMIN-02 | Phase 4 | Password reset via 15-min token |
| ADMIN-11 | Phase 4 | 2FA fields on admin_users (inactive) |
| ADMIN-03 | Phase 5 | Dashboard tiles |
| ADMIN-04 | Phase 5 | Event CRUD |
| ADMIN-05 | Phase 5 | RSVP list + filters + pagination |
| ADMIN-06 | Phase 5 | Charts (Chart.js) |
| ADMIN-07 | Phase 5 | QR code PNG download |
| ADMIN-10 | Phase 5 | Waitlist promotion (transactional recheck) |
| GAP-04 | Phase 5 | Admin edit capacity guard |
| ADMIN-08 | Phase 6 | CSV + JSON export |
| ADMIN-09 | Phase 6 | CSV import with row-level error summary |
| NOTIF-01 | Phase 7 | Guest confirmation email via Queue |
| NOTIF-02 | Phase 7 | Admin new-RSVP email via Queue |
| NOTIF-03 | Phase 7 | Capacity threshold emails (80%/100%) |
| NOTIF-05 | Phase 7 | SMS via Twilio (per-event toggle) |
| NOTIF-04 | Phase 8 | Reminder emails via Cron |
| SEC-04 | Phase 8 | Audit log PII-redacted + 365-day purge |
| I18N-01 | Phase 9 | Event locale en/fr/es on public form |
| SEC-03 | Phase 10 | CSRF + CSP + session cookie security |
| SEC-06 | Phase 10 | Structured logs + OTEL traces |
| TEST-01 | Phase 11 | GitHub Actions CI pipeline |
| TEST-02 | Phase 11 | axe-core accessibility assertions in CI |
| TEST-03 | Phase 11 | JSDoc @req / @adr tags enforced by ESLint |

**Total mapped: 44/44 ✓**  
(40 v1 requirements + 4 actionable gap requirements: GAP-01, GAP-02, GAP-04, GAP-06)

---

*Roadmap created: 2026-03-23*  
*Stack: Cloudflare Workers + D1 + Queues + Pages*  
*Based on: research/ARCHITECTURE.md build order, research/SUMMARY.md phase recommendations, granularity=fine*
