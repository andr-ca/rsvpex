# Feature Research

**Domain:** RSVP / Event Management micro-site (private events, self-hosted)
**Researched:** 2026-03-22
**Confidence:** HIGH (requirements cross-referenced against current competitors: Joy, The Knot, Evite patterns; original domain docs v5)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that guests and hosts assume exist. Missing = product feels broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Public RSVP form with name + contact | Every RSVP tool has this; guests expect frictionless entry | LOW | Email OR phone (not both required) — either must work |
| Attendance status choice (yes/no/maybe) | Hosts need to know headcount, not just who opened the link | LOW | Toggle to hide choice (admin sets attending) is valid UX |
| Party size capture | Venues need numbers, not just heads | LOW | Adults + children minimum; composition detail is a differentiator |
| Guest confirmation email | Guests expect proof of submission with a way to reference it | MEDIUM | Must include tokenized edit link; plain email without it is frustrating |
| Thank-you / confirmation page | Industry standard post-submit UX; blank redirect = broken feeling | LOW | Show RSVP summary; optionally show gift registry link |
| RSVP edit flow (post-submit changes) | Guests' plans change; no-edit = angry guests emailing the host | MEDIUM | Token-based prefill + PATCH endpoint; not just a new submission |
| Capacity limit enforcement | Hosts set a guest cap; oversubscription is a real problem | HIGH | Requires transactional lock; concurrency bugs here are catastrophic |
| Admin login + dashboard | Hosts need to manage events; no-auth dashboard is a security hole | MEDIUM | Email + password minimum; admin-only area |
| RSVP list with search and filter | Hosts scan for specific guests constantly before the event | MEDIUM | Filter by status, name search; dietary filter is high-value add |
| Event creation / editing (CRUD) | Can't host multiple events or fix typos without this | LOW | Slug, title, dates, visibility, capacity are all required fields |
| CSV export | Hosts share lists with caterers, venues, coordinators who use spreadsheets | LOW | No-token CSV; JSON export for advanced use |
| Duplicate prevention (hard) | Without it, one guest can fill all slots; data is garbage | MEDIUM | Unique per (event, email) and (event, phone) — both required |
| Closed / full state pages | Guests arriving after close need a clear message, not a broken form | LOW | Friendly pages for: before-open, closed, event-full |
| ICS calendar download (.ics file) | Calendar invite is *expected* after RSVP on any consumer event tool | LOW | Guests add to Google/Apple/Outlook calendar; VTIMEZONE required for correctness |
| Rate limiting on form submission | Without it, bots fill all capacity; RSVP becomes unusable | LOW | 5/min/IP is standard; Turnstile CAPTCHA is a bonus |

---

### Differentiators (Competitive Advantage)

Features that set RSVPex apart. Joy and The Knot don't offer self-hosted, privacy-first, or kids-event mode.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Kids event mode (children ages, parents, siblings) | Children-focused events (birthdays, bar mitzvahs) have totally different party compositions; most RSVP tools ignore this | HIGH | Children ages 0–17 required per child; parents/siblings optional; distinct validation branch. **Already in REQUIREMENTS.md — keep.** |
| Dietary restriction tracking (predefined + custom) | Hosts caring about food safety need this; Joy treats it as a custom question only; RSVPex makes it first-class | MEDIUM | Predefined canonical set (nut allergy, vegetarian, halal, kosher) + free-form; dietary bar chart in admin is high value. **Already in REQUIREMENTS.md.** |
| Gift registry link on thank-you page | Guests are primed to look at gifts immediately after confirming attendance; timely placement converts | LOW | Just a URL field on the event + button on thank-you. **Already in REQUIREMENTS.md — simple but high-impact.** |
| Waitlist with FIFO promotion | Most tools either block or ignore capacity overflow; FIFO waitlist is the host-friendly solution | HIGH | Requires transactional capacity recheck on promotion; one-by-one promotion via admin action. **Already in REQUIREMENTS.md.** |
| QR code per event | Hosts print invitations or display screens at venue with QR for last-minute RSVPs | LOW | Client-side generation (qrcode.js); 512×512 PNG download; handles private event tokens. **Already in REQUIREMENTS.md.** |
| Private events (access token) | Wedding/birthday planners share a secret link; not suitable for public RSVP tools | MEDIUM | access_token param; expiry optional; rotation invalidates old link within 60s. **Already in REQUIREMENTS.md.** |
| No third-party guest data storage | Privacy-conscious hosts (GDPR, enterprise, EU) won't touch SaaS tools that store PII on foreign servers | HIGH | Core differentiator for self-hosted model. Cloudflare D1 in EU region satisfies this. **Core value of project.** |
| Audit log with PII redaction | Compliance-aware hosts need to see who changed what; raw PII in logs is a liability | MEDIUM | JSON Merge Patch diffs; redact email/phone as sha256 prefix. **Already in REQUIREMENTS.md.** |
| Heuristic duplicate detection (per-event toggle) | Catches same-person re-submissions in informal events; off by default to avoid false positives | MEDIUM | Name + contact within 10 min window; per-event toggle. **Already in REQUIREMENTS.md.** |
| CSV import with per-row error summary | Hosts migrating from spreadsheets or paper RSVPs need this; most tools have brittle all-or-nothing import | MEDIUM | `{imported, failed, errors:[{row, reason}]}` format. **Already in REQUIREMENTS.md.** |
| i18n public form (en/fr/es) | Canadian/European events often need bilingual forms; uncommon in self-hosted tools | MEDIUM | Event locale field; public form strings only; admin stays English. **Already in REQUIREMENTS.md.** |
| Capacity threshold notifications (80% / 100%) | Hosts need to know when to open waitlist or stop promoting; proactive instead of reactive | LOW | Hysteresis ±5% prevents spam. **Already in REQUIREMENTS.md.** |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time guest feed / live updates | "See RSVPs as they come in" sounds exciting | WebSocket infrastructure on CF Workers is non-trivial; value is marginal vs. polling every 30s | Admin can refresh; RSVP notification email is sufficient for real-time awareness |
| Guest-to-guest messaging / chat | "Let guests coordinate" sounds collaborative | Transforms RSVP app into a social platform; moderation burden; not core value | Out of scope — host posts event notes via event description |
| Full seating chart builder | Hosts want to assign seats digitally | Table layout + drag-drop is a distinct product (1–2 week feature); RSVP data feeds into external tools better | Export CSV → use dedicated seating tool (AllSeated, Seating Ninja) |
| Email template builder (rich WYSIWYG) | "Branded emails" sounds polished | CKEditor/TipTap integration for email HTML is fragile; email HTML rendering is a discipline unto itself; maintenance cost high | Text-only templates with placeholder variables suffice for v1; v2 = simple variable substitution in admin |
| Native mobile app (iOS/Android) | "Easier for guests on mobile" | Mobile web RSVP in under 30s is already achievable; native app adds AppStore/PlayStore overhead | PWA-ready responsive web; no app required |
| OAuth / social login for admin | "One less password" | Single-admin self-hosted model; OAuth adds callback URL complexity and third-party dependency | Email + password + argon2id is secure enough; 2FA fields future-proof it |
| Public event discovery / search | "Find events near me" | RSVPex is invitation-only; public index changes privacy model entirely; requires moderation | Unlisted/private visibility model is the right design |
| Multi-tenant SaaS billing | "Offer RSVPex as a service" | Billing, plan limits, org isolation = entire separate product; dilutes self-hosted value | Each deployment is single-org; SaaS is a different product SKU entirely |
| Photo uploads in RSVP ("share a photo with your RSVP") | "Personalize the response" | R2 storage + resize pipeline + moderation = high complexity; no clear ROI for host | Free-text notes field covers personalization need |
| Automatic calendar integration push | "Add to guests' calendars automatically" | CalDAV/Google Calendar OAuth requires user permission flow; can't push without consent | ICS download (`.ics` file) is the correct UX — guests opt-in by downloading |
| Venue map integration | "Show where the event is on a map" | Google Maps embed API keys, iframe CSP, mobile performance concerns | Location text field + "Open in Maps" link is sufficient; link to Google Maps URL |

---

## Feature Dependencies

```
ICS Calendar Download
    └──requires──> Event timezone (IANA) stored correctly
                       └──requires──> UTC storage + tz-aware display

Edit RSVP Flow
    └──requires──> RSVP token (rid) generation on submit
                       └──requires──> Thank-you page with token in URL

Waitlist Promotion
    └──requires──> Capacity enforcement (transactional)
                       └──requires──> D1 serializable writes (no advisory locks)

Dietary bar chart (Admin)
    └──requires──> Dietary data model (JSONB array + canonical normalization)
                       └──requires──> RSVP submission with dietary field

Kids Event Mode
    └──requires──> Event flag (is_kids_event)
                       └──requires──> Event CRUD

Capacity threshold notifications
    └──requires──> Notification pipeline (Queue + Worker consumer)
                       └──requires──> Email provider configured (Resend/Postmark)

Heuristic duplicate detection
    └──enhances──> Hard duplicate prevention (always on)

Gift registry on thank-you
    └──enhances──> Thank-you page (standalone feature, just a URL field)

QR code
    └──enhances──> Private event (token must be embedded in QR URL)

Audit log
    └──requires──> Admin actions (CRUD on events/RSVPs)

CSV import
    └──requires──> RSVP data model stabilized (import maps to schema)

i18n public form
    └──requires──> Event locale field + string extraction from public form
```

### Dependency Notes

- **ICS requires correct timezone:** An ICS file without VTIMEZONE will render incorrectly in Outlook. UTC storage + `date-fns-tz` conversion is the right approach.
- **Edit flow requires token at submission:** The token must be stored at RSVP creation time. Retrofitting tokens onto existing RSVPs is painful. Do this in phase 1.
- **Waitlist requires transactional capacity:** On D1 (SQLite), this means serializable writes using D1 transactions — no advisory locks, no `SKIP LOCKED`. The concurrency model must be designed before the first line of capacity code.
- **Notifications require Queue before UI:** Capacity alerts and confirmation emails depend on Cloudflare Queues + Worker consumer. This is infrastructure that must exist before notification logic is layered on.
- **Kids event mode requires event flag:** The `is_kids_event` flag drives validation branching on the public form. It cannot be added after the fact without a migration.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what validates the concept and serves a real event.

- [x] **Public RSVP form** — name, email/phone, party size (adults/children), dietary restrictions, status choice, notes, custom questions
- [x] **Thank-you page** — RSVP summary, gift registry link (if set), ICS calendar download
- [x] **Edit RSVP flow** — tokenized prefill + PATCH; token-based access
- [x] **Capacity enforcement** — transactional; waitlist mode when full
- [x] **Duplicate prevention** — hard (email/phone unique per event)
- [x] **Admin dashboard** — event CRUD, RSVP list with filters (status/dietary/search), charts, QR code
- [x] **Admin auth** — email/password, argon2id, lockout, password reset
- [x] **CSV/JSON exports** — no tokens by default
- [x] **Email notifications** — guest confirmation + admin new-RSVP alert (via Queues)
- [x] **RSVP time window** — opens_at / closes_at enforcement
- [x] **Event visibility** — public / unlisted / private (access token)
- [x] **Kids event mode** — children ages, parents, siblings
- [x] **Rate limiting + CAPTCHA** — 5/min/IP + Turnstile
- [x] **WCAG 2.1 AA** — keyboard navigation, axe-core CI gate

### Add After Core Validated (v1.x)

Features to add once the submission → admin loop is proven working.

- [ ] **CSV import** — row-level error summary; add after export is validated (import schema matches export schema)
- [ ] **Capacity threshold emails** — 80%/100% alerts; add once notification queue is in production and stable
- [ ] **Reminder emails** — N days before event; add once cron infra is in place
- [ ] **SMS notifications** — Twilio HTTP; off by default; add after email is solid
- [ ] **Heuristic duplicate detection** — per-event toggle; add after hard dedup is solid
- [ ] **Audit log** — PII-redacted diffs, 365-day retention; add with second admin action (after CRUD exists)
- [ ] **i18n public form** — en/fr/es; add after form is stable (string extraction is a refactor, not a feature)

### Future Consideration (v2+)

- [ ] **Editor role** — read + RSVP management, no user/system settings; defer until second admin user is needed
- [ ] **Bulk RSVP actions** — bulk status change, bulk export filtered selection; defer until list is in use
- [ ] **Email template customization** — per-event; defer; text templates with variable substitution are fine for v1
- [ ] **Mailchimp sync for waitlist** — niche; defer; webhook outbound covers this for sophisticated users
- [ ] **Webhook outbound** — RSVP create/update; useful for integrations; defer to v2
- [ ] **Cross-event guest deduplication** — only valuable with multi-event usage patterns; defer

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Public RSVP form (name, contact, party size) | HIGH | LOW | P1 |
| Thank-you page + ICS download | HIGH | LOW | P1 |
| Edit RSVP flow (token-based) | HIGH | MEDIUM | P1 |
| Capacity enforcement (transactional) | HIGH | HIGH | P1 |
| Admin dashboard + RSVP list + filters | HIGH | MEDIUM | P1 |
| Admin auth (email/password) | HIGH | MEDIUM | P1 |
| Event CRUD (create/edit/publish/close) | HIGH | LOW | P1 |
| Duplicate prevention (hard) | HIGH | MEDIUM | P1 |
| Guest confirmation email (via Queue) | HIGH | MEDIUM | P1 |
| CSV export | HIGH | LOW | P1 |
| Waitlist with FIFO promotion | MEDIUM | HIGH | P1 |
| Dietary restriction tracking + admin chart | MEDIUM | MEDIUM | P1 |
| Kids event mode | MEDIUM | HIGH | P1 |
| Private event (access token) | MEDIUM | MEDIUM | P1 |
| QR code per event | MEDIUM | LOW | P1 |
| Rate limiting + Turnstile CAPTCHA | HIGH | LOW | P1 |
| WCAG 2.1 AA + axe-core CI | HIGH | MEDIUM | P1 |
| CSV import with error summary | MEDIUM | MEDIUM | P2 |
| Capacity threshold emails (80%/100%) | MEDIUM | LOW | P2 |
| Reminder emails (N days before) | MEDIUM | MEDIUM | P2 |
| Audit log (PII-redacted) | MEDIUM | MEDIUM | P2 |
| i18n public form (en/fr/es) | LOW | MEDIUM | P2 |
| SMS notifications | LOW | MEDIUM | P2 |
| Heuristic duplicate detection | LOW | LOW | P2 |
| Admin charts (status pie, dietary bar, etc.) | MEDIUM | LOW | P2 |
| Editor role | LOW | MEDIUM | P3 |
| Bulk RSVP actions | LOW | MEDIUM | P3 |
| Email template customization | LOW | HIGH | P3 |
| Webhook outbound | LOW | MEDIUM | P3 |
| Mailchimp sync | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch — event cannot be successfully run without it
- P2: Should have — significantly improves host experience; add in v1.x
- P3: Nice to have — deferred to v2+

---

## Competitor Feature Analysis

| Feature | Joy (withjoy.com) | The Knot | RSVPex Approach |
|---------|-------------------|----------|-----------------|
| RSVP form | Yes — connected to wedding website | Yes | Standalone per-event form at `/rsvp/:slug`; no website builder needed |
| Dietary restrictions | Custom question only (not first-class) | Not first-class | First-class field with canonical set + aggregation charts |
| Kids / children tracking | Guest tagging only | Not present | Dedicated kids event mode with age validation |
| Gift registry | Deep integration (own registry) | Deep integration (own registry) | URL link only — privacy-first; no vendor lock-in |
| Capacity / waitlist | Not prominently featured | Not present | Core feature — transactional FIFO waitlist |
| Private events | Not present (wedding site is public-ish) | Not present | Access token with expiry + rotation |
| Data privacy / self-hosted | No — data on Joy servers | No — data on The Knot servers | Core value: all data in your Cloudflare D1 |
| ICS calendar download | Automatic calendar integration (CalDAV) | Auto-add to calendar | ICS file download on thank-you page |
| Admin charts | Basic RSVP count | Basic count | Status pie, dietary bar, RSVPs-over-time, guest-type stacked bar |
| QR code | Not present | Not present | Downloadable PNG (512×512), correct URL |
| Audit log | Not present | Not present | PII-redacted JSON Merge Patch diffs, 365-day retention |
| i18n | English only (Joy is US-focused) | English only | Event locale: en/fr/es |
| Export | CSV + spreadsheet | CSV | CSV (no tokens) + JSON (tokens with re-auth) |
| Import | Spreadsheet import | Not present | CSV import with per-row error summary |
| SMS notifications | Not present | Not present | Optional per-event (Twilio); off by default |

---

## Requirements Gap Analysis (vs. REQUIREMENTS.md)

**REQUIREMENTS.md is well-specified. Key observations:**

### Confirmed Coverage (strong)
- ✓ Public form fields fully specified (PUB-01 – PUB-10) — complete
- ✓ Capacity + waitlist (CAP-01 – CAP-05) — well-specified with D1 transaction approach
- ✓ Dietary restrictions as first-class (GUEST-01) — canonical set + normalization ✓
- ✓ ICS on thank-you page (PUB-09) — present and correct
- ✓ Edit flow via rid token (PUB-10, GUEST-05) — correct approach
- ✓ Kids event mode (PUB-03) — ages required, parents/siblings optional ✓
- ✓ Admin charts (ADMIN-06) — Chart.js, accessible ✓
- ✓ Audit log (SEC-04) — PII-redacted, 365-day ✓

### Gaps / Observations

**GAP-01 — ICS VTIMEZONE not mentioned in REQUIREMENTS.md**
REQUIREMENTS.md mentions ICS download (PUB-09) but does not specify VTIMEZONE inclusion. The original v5 requirements (§19) explicitly require it. Without VTIMEZONE, the ICS file renders incorrectly in Outlook for non-UTC events. **Recommend adding acceptance criterion:** "ICS file includes VTIMEZONE block; changing event timezone alters ICS offsets correctly."

**GAP-02 — "Event already RSVPed" flow incomplete**
CAP-03 specifies duplicate prevention. REQUIREMENTS.md does not specify what the user sees when they try to RSVP again with the same email/phone. The v5 requirements (§10) specify: "returns 'Already RSVPed' and offers sending an edit link." This UX is important — a bare 422 is confusing. **Recommend adding:** duplicate-detected response offers to resend the edit link email.

**GAP-03 — Token revocation grace period**
GUEST-05 states "old token invalid within 60s" but no requirement exists for how the 60-second grace window is implemented (KV TTL? Soft-delete flag? Timestamp comparison?). This is an implementation detail but the acceptance criterion (GUEST-05) references it. **Flag for architecture research:** on Cloudflare Workers + D1, this needs a `revoked_at` timestamp with a grace comparison, or a KV invalidation entry.

**GAP-04 — Admin editing capacity guard**
ADMIN requirements don't explicitly specify that admin edits to RSVP party size must respect capacity. v5 §14 specifies "editing increases that push beyond capacity are blocked or waitlisted per event configuration." This is a correctness requirement missing from ADMIN section. **Recommend adding:** ADMIN-12 — Admin RSVP edits increasing party size trigger capacity recheck.

**GAP-05 — "Offer waitlist or keep original counts" on edit**
PUB-10 covers the edit flow but doesn't specify what happens when a guest edits and tries to increase party size when the event is full. v5 §10 specifies: "if full, offer waitlist or keep original counts." **Recommend adding acceptance criterion to PUB-10:** "If editing would push beyond capacity, user is offered waitlist slot or prompted to keep original party size."

**GAP-06 — Access token expiry behavior**
PUB-06 defines private events require `?t=<access_token>`. REQUIREMENTS.md does not specify what happens when `access_token_expires_at` passes. v5 §6 specifies: "with expired token → 403 'Link expired'." **Recommend adding acceptance criterion to PUB-06:** "Private event with expired access token returns 403 with message 'Link expired'."

**GAP-07 — Health endpoint for D1 down state**
SEC-05 specifies `/rsvp/healthz` returns 503 when DB is down. On Cloudflare Workers + D1, "DB down" is different from PostgreSQL — D1 failures manifest as Worker exceptions or 500s. The health check implementation needs a lightweight `SELECT 1` probe. **Flag for architecture/pitfalls research:** D1 doesn't have a separate connection pool — health check is a live query.

**Intentionally scoped correctly:**
- Email template customization → v2 ✓ (ADMIN-V2-03)
- Editor role → v2 ✓ (ADMIN-V2-01)
- Bulk actions → v2 ✓ (ADMIN-V2-02)
- Seating chart → not in scope ✓
- Chat / social features → out of scope ✓
- Native app → out of scope ✓

---

## Sources

- Joy (withjoy.com) — Smart RSVP feature page, Guest List page, RSVP wording blog (March 2026) — MEDIUM confidence (marketing content; feature set verified)
- The Knot — nav structure and feature categories (March 2026) — MEDIUM confidence
- RSVPex original requirements v5 — `rsvp/docs/rsvp_requirements_v5.md` — HIGH confidence (domain author's own spec)
- RSVPex REQUIREMENTS.md — `.planning/REQUIREMENTS.md` — HIGH confidence (current project spec)
- RSVPex PROJECT.md — `.planning/PROJECT.md` — HIGH confidence (current project context)
- Industry standard (ICS/RFC 5545, WCAG 2.1 AA) — HIGH confidence (published standards)

---
*Feature research for: RSVPex — RSVP management micro-site*
*Researched: 2026-03-22*
