
# RSVP Micro‑Site — Detailed Requirements (v5, First Iteration **complete**)

This revision adds explicit toggles/fields, UX flows, indexing details, operations jobs, environment configuration, and **acceptance criteria per section** per your notes.

---

## 1) Overview & Scope
**Requirement**
- Public RSVP at `https://domain.com/rsvp/<slug>`.
- Admin at `https://domain.com/rsvp/admin` (email/password).
- Admins manage events/RSVPs; guests RSVP <30s; optional wishlist; CSV/JSON exports.

**Acceptance Criteria**
- Public event page accepts a valid RSVP in ≤30s on 4G.
- Authenticated admin can create an event; RSVP appears in admin with correct totals.
- CSV and JSON exports include the RSVP; JSON excludes tokens by default.

---

## 2) Roles & Permissions
**Requirement**
- Roles: `admin` (full), `editor` (future). Enforce across admin APIs.
- Audit every privileged action with redaction (see §16).

**Acceptance Criteria**
- `admin` can CRUD events/RSVPs; an `editor` (when enabled) cannot manage users or system settings.
- Each admin action emits an AuditLog with redactions.

---

## 3) URLs & Navigation
**Requirement**
- Admin: `/rsvp/admin`, `/rsvp/admin/login`, `/rsvp/admin/dashboard`, events + RSVPs CRUD, import/export.
- Public: `GET/POST /rsvp/:slug`; `/rsvp/:slug/thanks?rid=<token>`; `/rsvp/:slug/edit?rid=<token>` + `PATCH /rsvp/:slug`.
- **Deprecated** `/rsvp/event/:id` → `410` (or `301` → slug if mapping exists).

**Acceptance Criteria**
- Unauthenticated hit to `/rsvp/admin` redirects to `/rsvp/admin/login`.
- Deprecated path returns 410 or 301 to `/rsvp/<slug>`.
- `PATCH /rsvp/:slug` **requires** `?rid=` or returns 403.

---

## 4) Authentication & Security
**Requirement**
- Email/password (≥10 chars; breached‑pw check; rate‑limit 10/min/IP; lockout 15 min after 5 fails).
- Hash: argon2id or bcrypt≥12; CSRF; secure cookies (HTTP‑only, SameSite=Lax).
- Password reset via 15‑min single‑use token.
- **2FA (future‑proof fields)**: store `two_factor_enabled` (bool, default false) and `two_factor_secret` (nullable).

**Acceptance Criteria**
- On 6th failed login in 15 minutes, `locked_until` ≈ now+15m; subsequent attempts return 423.
- Successful login after lock clears counters; `last_login_at` updates.
- CSRF failure returns 403; resetting password with expired token returns 400/422.

---

## 5) Data Model (Complete)

### 5.1 Event
**Requirement**
```ts
Event {
  id: UUID
  slug: string unique
  title: string (3..120)
  host_name?: string
  description_html?: string            // sanitized, see §20
  timezone: string                     // IANA, default "America/Toronto"
  start_at: datetime_utc
  end_at?: datetime_utc
  location_text?: string
  wishlist_url?: url

  visibility: 'public'|'unlisted'|'private'
  access_token?: UUID                  // iff private
  access_token_expires_at?: datetime_utc|null

  is_kids_event: boolean               // default false
  allow_children: boolean              // default true
  allow_siblings: boolean              // default true
  allow_parents: boolean               // default true  // must remain true if is_kids_event
  allow_status_choice: boolean         // default true

  enable_waitlist: boolean             // default false (toggle in admin)
  enable_heuristic_dup_check: boolean  // default false (per-event; global default env also supported)

  locale?: string                      // default 'en' (affects public form strings)

  max_guests_total?: int
  max_party_size_per_rsvp: int         // default 10

  opens_at?: datetime_utc
  closes_at?: datetime_utc
  status: 'draft'|'published'|'closed'|'archived'

  questions: Question[]

  notify_via_email: boolean            // default true
  notify_via_sms: boolean              // default false
  reminder_days_before?: int           // default 7

  created_at: datetime_utc
  updated_at: datetime_utc
  archived_at?: datetime_utc
}
```
**Rules**
- Slug collision → append `-<shortid>` (base36 5 chars).
- If `is_kids_event=true`, server enforces `allow_children=true`.
- `visibility='private'` requires valid `access_token`; rotate via admin action.

**Acceptance Criteria**
- Attempt to set `is_kids_event=true` with `allow_children=false` returns 422.
- Toggling `enable_waitlist` immediately changes public page mode when full.
- Setting `locale='fr'` renders public strings in French.

### 5.2 Question
**Requirement**
```ts
Question {
  id: string
  type: 'short_text'|'long_text'|'boolean'|'single_select'|'multi_select'
  label: string
  help_text?: string
  required: boolean
  options?: string[]
  order: int
  active: boolean
}
```
**Acceptance Criteria**
- Required questions must be answered; multi-select answers must be members of `options`.

### 5.3 RSVP
**Requirement**
```ts
RSVP {
  id: UUID
  event_id: UUID

  name: string (2..120)
  email?: string   // RFC5322
  phone?: string   // E.164

  adults: int                  // default 1 if !is_kids_event else 0; min 0
  parents_count: int           // min 0; only if is_kids_event && allow_parents
  siblings_count: int          // min 0; only if is_kids_event && allow_siblings

  children_count: int          // computed = array_length(children_ages,1)
  children_ages: int[]         // int[]; 0..17

  dietary: DietaryEntry[]      // JSONB[]
  notes?: string               // ≤1000 chars

  answers: Record<string, string|string[]|boolean>

  status: 'attending'|'not_attending'|'maybe'|'waitlist'
  source: 'web'|'admin'|'import'
  rsvp_token: string
  submitted_at: datetime_utc
  client_submitted_at?: datetime_utc

  ip_hash?: string
  user_agent?: string

  created_at: datetime_utc
  updated_at: datetime_utc
}
```
**DB Constraints & Indexes**
- `CHECK (adults >= 0 AND parents_count >= 0 AND siblings_count >= 0)`
- `CHECK (children_count = COALESCE(array_length(children_ages,1),0))`
- Validate ages 0..17 via trigger or generated column check.
- Unique partial indexes:
  - `(event_id, lower(email)) WHERE email IS NOT NULL`
  - `(event_id, phone) WHERE phone IS NOT NULL`
  - Combined: `(event_id, lower(COALESCE(email,'')), COALESCE(phone,''))`
- Server validation enforces total party size ≤ `max_party_size_per_rsvp` and ≥1.

**DietaryEntry**
```ts
DietaryEntry {
  kind: 'predefined'|'custom'
  value: string   // normalization rules below
}
```
**Dietary Normalization & Limits**
- Predefined canonical set stored lowercased: `nut allergy`, `vegetarian`, `halal`, `kosher`.
- Custom values stored trimmed with original case (for display).
- Aggregation buckets merge custom values that case‑insensitively equal a predefined label into the predefined bucket.
- Limit dietary entries to **≤10 per RSVP**; each custom value ≤100 chars.

**Acceptance Criteria**
- `children_ages=[7,10]` with `children_count=1` fails the CHECK and returns 422.
- Submitting same `(event, email)` twice (case‑insensitive) rejects the second submission.
- Posting more than 10 dietary entries is rejected with 422.

### 5.4 AdminUser
**Requirement**
```ts
AdminUser {
  id: UUID
  email: string unique
  password_hash: string
  display_name?: string
  role: 'admin'|'editor'
  is_active: boolean
  failed_login_attempts: int default 0
  locked_until?: datetime_utc
  two_factor_enabled: boolean default false
  two_factor_secret?: string
  last_login_at?: datetime_utc
  created_at: datetime_utc
}
```
**Acceptance Criteria**
- Lockout fields behave per §4; 2FA fields present (inactive by default).

### 5.5 AuditLog
**Requirement**
```ts
AuditLog {
  id: UUID
  actor_id?: UUID
  entity_type: 'event'|'rsvp'|'admin_user'
  entity_id: UUID | string
  action: 'create'|'update'|'delete'|'export'|'login'|'logout'|'import'|'password_reset'|'capacity_override'|'token_rotate'
  diff_json?: JSON   // JSON Merge Patch (redacted)
  created_at: datetime_utc
}
```
- **Retention**: purge >365 days via daily job; report counts to Admin Dashboard “System” tile and to logs.

**Acceptance Criteria**
- Export logs produce redacted diffs; retention job reduces total count and updates the System tile.

---

## 6) Public Form UX & Visibility
**Requirement**
- Visibility: `public` (open), `unlisted` (not returned from hypothetical `/api/public-events`), `private` (requires `?t=<access_token>`, checks `access_token_expires_at`).
- Window: teaser+countdown before `opens_at`; closed page after `closes_at` or `status='closed'`.
- When full and `enable_waitlist=true`, switch to Waitlist mode (no counts, just contact & notes).
- Kids Event: require `children_count ≥ 1`; ages required; parents/siblings optional (if allowed).
- Standard Event: default `adults=1` (min 1); children optional with ages.
- Duplicate prevention on submit (see §10).

**Acceptance Criteria**
- Private event without token → 403; with expired token → 403 “Link expired”.
- Kids event blocks `children_count=0`; standard event blocks `adults=0`.
- If `enable_waitlist=false` and event is full, submitting returns friendly “Event full” without storing RSVP.

---

## 7) Admin Dashboard & Event Details
**Requirement**
- Dashboard: tiles (Active/Upcoming/Recent/System), global charts, recent RSVPs.
- Event: summary cards; filters (status/date/search/dietary); table 50/page with pagination; QR PNG 512×512.

**Acceptance Criteria**
- Dietary filter shows only RSVPs containing that canonical dietary value.
- Pagination appears when >50 RSVPs; navigating pages updates the table without errors.

---

## 8) Thank‑You & Token Security
**Requirement**
- `/rsvp/:slug/thanks?rid=` shows summary; `/rsvp/:slug/edit?rid=` yields prefilled form; `PATCH /rsvp/:slug` requires `rid`.
- `rsvp_token` is opaque and read‑only; admin revoke regenerates token; bookmarks to old token stop working.

**Acceptance Criteria**
- Invalid/old `rid` returns 403 within 60 seconds after revocation.
- Thank‑you shows wishlist button when configured and produces a valid `.ics` file.

---

## 9) Capacity & Waitlist (with FIFO)
**Requirement**
- Count `attending` + `maybe`; exclude `not_attending` + `waitlist`.
- Transactional check uses row/advisory lock per event.
- Waitlist behavior:
  - Public form shows “Join waitlist” when full and `enable_waitlist=true`.
  - Waitlist **position** uses `submitted_at` ascending (earliest = #1).
  - **Promotion**: Admin action (“Promote from waitlist”) in RSVP row → modal confirm → transactional capacity recheck → set status `attending` (or block if full). Multi‑promotions are FIFO one‑by‑one.

**Acceptance Criteria**
- 10 concurrent submits when 3 seats remain → 3 attending + 7 waitlist (or rejected if disabled).
- Promoting N waitlist RSVPs processes in FIFO order; if capacity fills mid‑batch, remaining promotions are blocked.

---

## 10) Duplicates & Edit Flow
**Requirement**
- Unique per event on email and phone (case-insensitive); combined index prevents (email+phone) duplicates.
- Heuristic duplicate (name+contact within 10 min) **per‑event toggle** `enable_heuristic_dup_check` (default false; global default overridable via env).
- Edit flow requires `rid`; capacity rules apply when increasing counts; if full, offer waitlist or keep original counts.

**Acceptance Criteria**
- Second submission with same email for same event returns “Already RSVPed” and offers sending an edit link.
- With heuristic enabled, a second submission (same name+phone) within 10 min prompts duplicate warning; disabling the toggle removes this behavior.

---

## 11) Notifications
**Requirement**
- Toggles per event: `notify_via_email`, `notify_via_sms`, `reminder_days_before`.
- Integrations via env vars (see Appendix A): SMTP provider OR transactional API; SMS via Twilio‑compatible API.
- Triggers: submit (guest + admin), capacity 80%/100% **on threshold cross** (>=80 and ==100; hysteresis 5% to avoid spam), reminder X days before via scheduler.

**Acceptance Criteria**
- With email enabled and contact present, guest receives confirmation email containing tokenized view link.
- Capacity email fires once when crossing 80% and once at 100%; repeated small fluctuations within ±5% do not spam.

---

## 12) Custom Questions
**Requirement**
- Types as defined; validation strict; answers exported: `answers.<qid>` (semicolon‑joined for multi).

**Acceptance Criteria**
- Invalid option values for single/multi select are rejected server‑side with 422.
- Export contains a column for each active question at export time.

---

## 13) Imports & Exports
**Requirement**
- Import CSV: name, email, phone, adults, children_count, children_ages (comma), parents_count, siblings_count, status, notes, dietary (comma), answers.<qid>.*
- Errors return `{imported, failed, errors:[{row, reason}]}`.
- JSON export excludes `rsvp_token` unless `?include_tokens=true` with recent re‑auth; CSV never includes tokens.

**Acceptance Criteria**
- Malformed `children_ages` (e.g., `a,7`) produces a failed row with a clear message.
- JSON export with tokens requires recent re‑auth; without it, returns 401/403.

---

## 14) Admin Editing & Impersonation
**Requirement**
- Admin can edit all RSVP fields; dangerous actions require recent re‑auth; all edits logged.

**Acceptance Criteria**
- Editing increases that push beyond capacity are blocked or waitlisted per event configuration.
- Deleting an RSVP invalidates its token immediately; audit log shows redacted diff.

---

## 15) Validation Rules
**Requirement**
- Enforce: name, contact (email XOR phone), min/max party sizes, child ages 0..17, dietary limits, questions required, status rules (override if `allow_status_choice=false`).

**Acceptance Criteria**
- Submitting with hidden status still stores `attending` when `allow_status_choice=false`.
- Submitting with neither email nor phone returns a clear validation error.

---

## 16) Audit Logging, Retention & Reporting
**Requirement**
- JSON Merge Patch diffs; redact email/phone (sha256 prefix); summarize arrays/answers.
- Retain 365d; daily purge.
- Report purge counts in **Admin Dashboard → System tile** and application logs.

**Acceptance Criteria**
- Viewing AuditLog never exposes raw contact data.
- System tile shows a count of purged entries after purge job runs.

---

## 17) Charts & QR
**Requirement**
- Charts (Chart.js): Status pie; Guest‑type stacked bar (adults/children/parents/siblings counts in one bar); RSVPs‑over‑time line; Dietary bar.
- QR: client‑side via `qrcode.js`; PNG 512×512; handles long URLs.

**Acceptance Criteria**
- Screen‑reader labels exist for all charts; bar stacks show category totals.
- QR download scans to the correct URL (including `?t=` for private events).

---

## 18) Health
**Requirement**
- `/rsvp/healthz` → JSON: `{"status":"ok","uptime_seconds":...,"version":"...","db":"healthy","time_utc":"..."}`; 503 when DB down.

**Acceptance Criteria**
- DB outage flips `db` to `"down"` and returns HTTP 503.

---

## 19) Timezones & ICS
**Requirement**
- Store UTC; display in event timezone; ICS includes VTIMEZONE.

**Acceptance Criteria**
- Changing `timezone` alters display only; ICS reflects event timezone with correct offsets.

---

## 20) Content, Errors & Accessibility
**Requirement**
- Sanitized HTML for descriptions (CKEditor/TipTap); no scripts/iframes/styles; links `rel="nofollow noopener"`.
- Errors: 404 unknown slug (+suggestions), 403 private token errors, friendly closed/full pages, 5xx with correlation id.
- WCAG 2.1 AA: labels, `aria-describedby`, keyboard navigation; accessible charts.

**Acceptance Criteria**
- Attempted `<script>` in description is removed on save.
- Keyboard‑only user can submit RSVP; automated axe‑core checks report no critical issues.

---

## 21) Security, Performance, Caching & Backups
**Requirement**
- Rate‑limit POST RSVP 5/min/IP; burst 10; optional CAPTCHA (Turnstile/hCaptcha).
- CORS: GET public; POST same‑site.
- Performance: p95 public load <1.5s; API p95 <300ms @ 50 RPS.
- **Scalability**: cache public event pages + config (60s CDN/Tier‑1 cache) and use Redis for rate‑limits/locks.
- **Backups**: daily for Event/RSVP/AdminUser/AuditLog; weekly automated restore test to staging.

**Acceptance Criteria**
- Surpassing rate limit returns 429 + `Retry‑After`.
- Weekly restore job completes and validates record counts within ±1% of snapshot.

---

## 22) State Machine, Schedulers & Jobs
**Requirement**
- Transitions: `draft→published` (manual); auto‑close to `closed` when `now>closes_at` via 5‑min cron; `archived` manual.
- Token rotation: admin button regenerates `access_token` and invalidates old within 60s.
- **Jobs**:
  - Close events past `closes_at` (5‑min cadence).
  - Send reminders `reminder_days_before` (daily at 9am event timezone).
  - AuditLog purge (daily).
  - Capacity threshold alerts (upon crossing; de‑bounced by 5%).

**Acceptance Criteria**
- Event closes within 5 minutes after `closes_at`.
- Reminder emails for events with `reminder_days_before=7` go out 7 days prior (±15 min window).

---

## 23) API Reference (clarified)
**Requirement**
- Endpoints per v4 plus:
  - `GET /rsvp/:slug/edit?rid=`
  - `PATCH /rsvp/:slug` (requires `rid`)
  - `POST /rsvp/admin/events/:id/import` → error summary
  - Exports with `?include_tokens=true` require recent re‑auth
  - Dietary filter uses canonical values: `GET /api/events/:id/rsvps?dietary=vegetarian` (exact canonical match; case‑insensitive).

**Acceptance Criteria**
- `GET /rsvp/:slug/edit?rid=` returns only that RSVP; no other data exposed.
- `?dietary=veg` returns none unless equals canonical `"vegetarian"` (partial matches do not count).

---

## 24) i18n & Locale
**Requirement**
- Event `locale` defines default public language; falls back to browser; admin UI remains English.

**Acceptance Criteria**
- With `locale='fr'`, static public strings render in French; English fallback when strings missing.

---

## 25) Testing & Tooling
**Requirement**
- Unit: validation & normalization.
- Integration: capacity/duplicates, waitlist promotion, token flows.
- E2E: Playwright/Cypress; a11y: axe‑core integration in CI.

**Acceptance Criteria**
- “Private event without token → 403” passes.
- “Concurrent 10 submits: only capacity accepted; remainder waitlisted/rejected” passes deterministically.
- a11y CI has zero critical violations on public/admin core pages.

---

## 26) Implementation Notes
**Requirement**
- Use DB transactions and row/advisory locks for capacity.
- Enforce `children_count = array_length(children_ages,1)` CHECK.
- Normalize dietary predefined to canonical lowercase on store; aggregate case‑insensitively.
- Partial unique indexes + combined index cover email/phone dupes.
- Public events may be cached briefly; admin bypasses cache.

**Acceptance Criteria**
- Attempt to desync `children_count` from `children_ages` fails at DB layer.
- Dietary aggregation merges custom “nut allergy” into the canonical bucket in charts.

---

## Appendix A — Environment Variables & Config
**Requirement**
Provide environment configuration keys and behaviors.

- Core:
  - `DATABASE_URL`
  - `SESSION_SECRET`
  - `BASE_URL`
  - `TIMEZONE_DEFAULT` (fallback)
- Email:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` **or** provider keys (e.g., `POSTMARK_API_TOKEN`, `SENDGRID_API_KEY`)
- SMS:
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (or compatible provider)
- Abuse protection:
  - `CAPTCHA_PROVIDER` (`turnstile|hcaptcha|none`), `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY`
- Caching/locks:
  - `REDIS_URL`
- Defaults:
  - `DEFAULT_ENABLE_HEURISTIC_DUP_CHECK` (`true|false`, default `false`)
  - `DEFAULT_REMINDER_DAYS_BEFORE` (default `7`)

**Acceptance Criteria**
- Toggling `DEFAULT_ENABLE_HEURISTIC_DUP_CHECK=true` makes new events default to heuristic enabled while preserving per‑event overrides.
- Missing SMTP config disables email sending gracefully and surfaces a dashboard warning.

---
