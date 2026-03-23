# Requirements: RSVPex

**Defined:** 2026-03-22
**Updated:** 2026-03-23 — stack pivot to Cloudflare Workers + D1; static site reqs marked Validated
**Core Value:** A guest can RSVP in under 30 seconds, and the host has complete, accurate guest data — dietary needs, party sizes, gift registry — without touching a third-party platform.

---

## Validated (Static Site — shipped)

- ✓ **SITE-01 – SITE-09**: Warm Minimal design, responsive layout, WCAG 2.1 AA
- ✓ **FORM-01 – FORM-07**: Waitlist form, Web3Forms JSON API, honeypot, validation, thank-you redirect
- ✓ **CICD-01 – CICD-07**: GitHub Actions → Cloudflare Pages, PR previews, PR comments, secrets management

---

## v1 Requirements

### RSVP App — Public Form

- [ ] **PUB-01**: Public RSVP form at `/rsvp/:slug`; accepts RSVP in ≤30s on 4G; served from Cloudflare Pages / Workers
- [ ] **PUB-02**: Form collects: name (required), email or phone (at least one required), party size (adults/children with ages/parents/siblings), status choice, dietary restrictions, notes, custom questions
- [ ] **PUB-03**: Kids event mode: children count ≥ 1 required; ages 0–17 required per child; adults default 0
- [ ] **PUB-04**: Standard event mode: adults ≥ 1 required; children optional with ages
- [ ] **PUB-05**: Dietary restrictions: predefined options (nut allergy, vegetarian, halal, kosher) + free-form custom field; ≤10 entries per RSVP
- [ ] **PUB-06**: Visibility modes: public (open), unlisted (no index), private (requires `?t=<access_token>`)
- [ ] **PUB-07**: Time window enforcement: countdown teaser before `opens_at`; closed page after `closes_at`
- [ ] **PUB-08**: Waitlist mode when at capacity and `enable_waitlist=true`; friendly "event full" when disabled
- [ ] **PUB-09**: Thank-you page showing RSVP summary, optional wishlist button, ICS calendar download
- [ ] **PUB-10**: Edit flow: prefill form from RSVP token; PATCH endpoint requires `rid` token

### RSVP App — Guest Data

- [ ] **GUEST-01**: Dietary restrictions stored as JSONB array per RSVP; predefined values normalized to canonical lowercase
- [ ] **GUEST-02**: Gift registry URL per event; displayed as button on thank-you page after confirmation
- [ ] **GUEST-03**: Party composition tracked: adults, children (with ages), parents, siblings
- [ ] **GUEST-04**: Custom questions per event: short text, long text, boolean, single-select, multi-select
- [ ] **GUEST-05**: RSVP token (`rid`) is opaque, read-only; admin can revoke (regenerates token, old token invalid within 60s)

### RSVP App — Capacity & Integrity

- [ ] **CAP-01**: Capacity enforcement runs inside D1 transaction with serializable isolation per event (no advisory locks — use D1 serializable writes)
- [ ] **CAP-02**: Waitlist position by `submitted_at` ascending (FIFO); admin promotes one-by-one with capacity recheck
- [ ] **CAP-03**: Duplicate prevention: unique per `(event, email)` and `(event, phone)` (case-insensitive)
- [ ] **CAP-04**: Optional heuristic duplicate check (per-event toggle): same name + contact within 10 min
- [ ] **CAP-05**: `party_total` computed column enforced; `children_count` must equal number of age entries

### RSVP App — Admin Dashboard

- [ ] **ADMIN-01**: Admin login at `/rsvp/admin/login`; email/password with argon2id; lockout after 5 failed attempts (15 min)
- [ ] **ADMIN-02**: Password reset via 15-min single-use token
- [ ] **ADMIN-03**: Dashboard tiles: Active/Upcoming/Recent events, System status
- [ ] **ADMIN-04**: Event CRUD: create, edit, publish/close/archive; slug auto-generated with collision handling
- [ ] **ADMIN-05**: RSVP list per event: filters (status, dietary, date, name search), pagination (50/page), sortable
- [ ] **ADMIN-06**: Charts: status pie, guest-type stacked bar, RSVPs-over-time line, dietary bar (Chart.js, accessible)
- [ ] **ADMIN-07**: QR code PNG (512×512) per event, downloadable, correct URL including `?t=` for private events
- [ ] **ADMIN-08**: CSV export (no tokens); JSON export (tokens require `?include_tokens=true` + recent re-auth)
- [ ] **ADMIN-09**: CSV import with row-level error summary `{imported, failed, errors:[{row, reason}]}`
- [ ] **ADMIN-10**: Waitlist promotion action: modal confirm → transactional capacity recheck → set status `attending`
- [ ] **ADMIN-11**: 2FA fields present on admin user records (`two_factor_enabled`, `two_factor_secret`) — inactive by default

### RSVP App — Notifications

- [ ] **NOTIF-01**: Email confirmation to guest on submission (contains tokenized view link); sent via Cloudflare Queue + Worker consumer
- [ ] **NOTIF-02**: Email notification to admin on new RSVP; sent via Queue
- [ ] **NOTIF-03**: Capacity threshold emails: once at 80%, once at 100%; 5% hysteresis to prevent spam
- [ ] **NOTIF-04**: Reminder emails N days before event (configurable per event, default 7 days); scheduled via Cloudflare Cron Trigger
- [ ] **NOTIF-05**: SMS notifications via Twilio HTTP API (per-event toggle, off by default)

### RSVP App — Security & Observability

- [ ] **SEC-01**: Rate limit RSVP POST: 5/min/IP, burst 10; returns 429 with `Retry-After`
- [ ] **SEC-02**: Cloudflare Turnstile CAPTCHA on public RSVP form (configurable, can be disabled)
- [ ] **SEC-03**: CSRF double-submit + Origin checks; strict CSP; HTTP-only SameSite=Lax session cookies
- [ ] **SEC-04**: Audit log for all privileged actions: PII-redacted JSON Merge Patch diffs; 365-day retention with daily purge job
- [ ] **SEC-05**: Health endpoint at `/rsvp/healthz` returns JSON with DB status; 503 when DB down
- [ ] **SEC-06**: Structured JSON logs (pino); OTEL traces with custom spans

### RSVP App — Internationalisation

- [ ] **I18N-01**: Event `locale` field (en/fr/es) controls public form string language; fallback to browser locale; admin UI English-only

### RSVP App — Testing & CI

- [ ] **TEST-01**: GitHub Actions CI: lint → typecheck → unit tests (≥80% coverage globally, 100% on critical modules: capacity, tokens, duplicate checks) → E2E Playwright with D1 local (Miniflare)
- [ ] **TEST-02**: axe-core accessibility assertions in CI on public and admin core pages (zero critical violations)
- [ ] **TEST-03**: JSDoc `@req` and `@adr` tags required on all exported functions in domain/API layers; ESLint enforces

---

## v2 Requirements

### Static Site

- **SITE-V2-01**: Animate hero card mockup (subtle entrance animation)
- **SITE-V2-02**: Social share meta images (og-preview.png, twitter-preview.png)

### RSVP App — Admin

- **ADMIN-V2-01**: Editor role (read + RSVP management, no user/system settings)
- **ADMIN-V2-02**: Bulk RSVP actions (bulk status change, bulk export filtered selection)
- **ADMIN-V2-03**: Email template customization per event

### RSVP App — Guest

- **GUEST-V2-01**: Guest-facing RSVP edit reminder (email with edit link N days before event)
- **GUEST-V2-02**: Multiple events per guest (cross-event deduplication)

### RSVP App — Integrations

- **INT-V2-01**: Mailchimp sync for waitlist signups
- **INT-V2-02**: Webhook outbound on RSVP create/update

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time chat between guests | Not core to RSVP; high complexity |
| Native mobile app | Web-first; mobile browser sufficient |
| OAuth / social login for admin | Email+password sufficient for self-hosted single-admin use |
| Multi-tenant SaaS billing | Self-hosted model; each deployment is single-org |
| Video / rich media attachments in RSVPs | Storage/bandwidth cost; not core to guest tracking |
| Public event discovery / listing | Unlisted/private model; no public index |

---

## Gap Requirements (Actionable — added to roadmap)

Four gaps from `research/FEATURES.md` are actionable requirements added to the roadmap phases:

- [ ] **GAP-01** (→ Phase 3): ICS file includes `VTIMEZONE` block matching the event's IANA timezone; changing the event timezone alters ICS UTC offsets correctly; file is valid per RFC 5545
- [ ] **GAP-02** (→ Phase 2): When duplicate email/phone is detected (CAP-03), the 409 response offers to resend the edit link email; guests are not shown a bare error code
- [ ] **GAP-04** (→ Phase 5): Admin edits to an RSVP's party size that would exceed `max_guests_total` trigger a transactional capacity recheck; the edit is blocked or offered a waitlist slot
- [ ] **GAP-06** (→ Phase 2): Private event with expired `access_token_expires_at` returns 403 with message "Link expired"

*GAP-03 (token revocation grace period implementation mechanism) and GAP-05 (edit-flow over-capacity UX) and GAP-07 (D1 healthz probe semantics) are addressed within existing requirements GUEST-05, PUB-10, and SEC-05 respectively — no separate requirement added.*

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SITE-01 – SITE-09 | Phase 0 (shipped) | ✓ Validated |
| FORM-01 – FORM-07 | Phase 0 (shipped) | ✓ Validated |
| CICD-01 – CICD-07 | Phase 0 (shipped) | ✓ Validated |
| SEC-05 | Phase 1 | Pending |
| PUB-01 | Phase 2 | Pending |
| PUB-02 | Phase 2 | Pending |
| PUB-03 | Phase 2 | Pending |
| PUB-04 | Phase 2 | Pending |
| PUB-05 | Phase 2 | Pending |
| PUB-06 | Phase 2 | Pending |
| PUB-07 | Phase 2 | Pending |
| PUB-08 | Phase 2 | Pending |
| CAP-01 | Phase 2 | Pending |
| CAP-02 | Phase 2 | Pending |
| CAP-03 | Phase 2 | Pending |
| CAP-04 | Phase 2 | Pending |
| CAP-05 | Phase 2 | Pending |
| SEC-01 | Phase 2 | Pending |
| SEC-02 | Phase 2 | Pending |
| GAP-02 | Phase 2 | Pending |
| GAP-06 | Phase 2 | Pending |
| PUB-09 | Phase 3 | Pending |
| PUB-10 | Phase 3 | Pending |
| GUEST-01 | Phase 3 | Pending |
| GUEST-02 | Phase 3 | Pending |
| GUEST-03 | Phase 3 | Pending |
| GUEST-04 | Phase 3 | Pending |
| GUEST-05 | Phase 3 | Pending |
| GAP-01 | Phase 3 | Pending |
| ADMIN-01 | Phase 4 | Pending |
| ADMIN-02 | Phase 4 | Pending |
| ADMIN-11 | Phase 4 | Pending |
| ADMIN-03 | Phase 5 | Pending |
| ADMIN-04 | Phase 5 | Pending |
| ADMIN-05 | Phase 5 | Pending |
| ADMIN-06 | Phase 5 | Pending |
| ADMIN-07 | Phase 5 | Pending |
| ADMIN-10 | Phase 5 | Pending |
| GAP-04 | Phase 5 | Pending |
| ADMIN-08 | Phase 6 | Pending |
| ADMIN-09 | Phase 6 | Pending |
| NOTIF-01 | Phase 7 | Pending |
| NOTIF-02 | Phase 7 | Pending |
| NOTIF-03 | Phase 7 | Pending |
| NOTIF-05 | Phase 7 | Pending |
| NOTIF-04 | Phase 8 | Pending |
| SEC-04 | Phase 8 | Pending |
| I18N-01 | Phase 9 | Pending |
| SEC-03 | Phase 10 | Pending |
| SEC-06 | Phase 10 | Pending |
| TEST-01 | Phase 11 | Pending |
| TEST-02 | Phase 11 | Pending |
| TEST-03 | Phase 11 | Pending |

**Coverage:**
- Validated: 23 requirements (static site — shipped)
- v1 active: 40 requirements (RSVP app)
- Gap requirements added to roadmap: 4 (GAP-01, GAP-02, GAP-04, GAP-06)
- Mapped to phases: 44/44 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-23 — CF Workers + D1 stack; static site requirements Validated; roadmap created (11 phases); 44/44 requirements mapped*
