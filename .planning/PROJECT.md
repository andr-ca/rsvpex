# RSVPex

## What This Is

RSVPex is an RSVP management micro-site for events that matter. Guests RSVP through a clean public form; hosts manage everything — guest lists, dietary restrictions, gift registries, capacity, and exports — through a private admin dashboard. It runs fully on the Cloudflare ecosystem (Workers + D1 + Queues + Pages), with no third-party storage of guest data.

The project has two layers: a **static marketing site** (landing page, already live on Cloudflare Pages) and the **RSVP application** (Cloudflare Workers + D1 + Queues + Pages).

## Core Value

A guest can RSVP in under 30 seconds, and the host has complete, accurate guest data — dietary needs, party sizes, gift registry link — without touching a third-party platform.

## Requirements

### Validated

- ✓ Warm Minimal landing page (cream/terracotta, hero + pillars + waitlist form) — Phase 0 (static site)
- ✓ Waitlist form via Web3Forms, JSON submission, redirect to thank-you — Phase 0
- ✓ GitHub Actions CI/CD → Cloudflare Pages (production + PR preview) — Phase 0
- ✓ `.env.sample` documents all secrets; access_key injected at deploy time — Phase 0
- ✓ Public RSVP form at `/rsvp/:slug` — name, email/phone, party size, dietary restrictions, custom questions, status choice — Phase 2
- ✓ Kids event mode: children ages required, parents/siblings optional — Phase 2
- ✓ Capacity enforcement via D1 atomic conditional `UPDATE`/`INSERT ... WHERE`; waitlist mode when full — Phase 2
- ✓ Duplicate prevention: exact (email/phone per event) + optional heuristic (name+contact within 10 min) — Phase 2
- ✓ Thank-you page with wishlist link and ICS download (RFC 5545 + VTIMEZONE); edit flow via `?rid=` token — Phase 3
- ✓ Admin auth: argon2id + D1 `sessions` table (app-level, no Cloudflare Access) — Phase 4
- ✓ Admin dashboard: event CRUD, RSVP list with filters, pagination, charts (Chart.js), QR code — Phase 5
- ✓ CSV/JSON exports; CSV import with error summary — Phase 6
- ✓ Dietary restriction tracking: predefined set + free-form custom, ≤10 per RSVP — Phase 2
- ✓ Gift registry URL per event, shown on thank-you page after confirmation — Phase 2/3
- ✓ Email/SMS notifications (Resend + Twilio HTTP APIs): submission confirmation, capacity threshold (80%/100%), reminders N days before — Phase 7
- ✓ Audit log (PII-redacted diffs), 365-day retention via daily cron purge — Phase 8
- ✓ i18n: event locale (en/fr/es) for public form strings via hand-rolled `t()`/`resolveLocale()` — Phase 9
- ✓ Rate limiting (5/min/IP on RSVP POST, 10/5min on admin auth), Cloudflare Turnstile CAPTCHA — Phase 10
- ✓ Structured JSON logging, CSP + CSRF + security headers, OTEL-style trace spans — Phase 10
- ✓ GitHub Actions CI/CD: lint → typecheck → unit tests → build gate → dependency audit (parallel jobs) — Phase 11

### Active

#### Static Marketing Site (Cloudflare Pages)

- [ ] Warm Minimal visual design: cream/off-white background, ink black type, terracotta accents, editorial serif headlines
- [ ] Hero section with serif headline, subheadline mentioning dietary restrictions and gift registries, inline email + name waitlist form
- [ ] Five feature pillars: Beautiful Invites, Live Tracking, Dietary Needs, Gift Registry, Your Data Private — SVG stroke icons, no emoji
- [ ] Decorative RSVP card mockup in hero showing dietary and gift registry rows
- [ ] Waitlist form via Web3Forms (existing access key), redirect to thank-you page
- [ ] GitHub Actions CI/CD deploying to Cloudflare Pages on push to main
- [ ] PR preview deployments with comment posting the preview URL

#### RSVP Application (Cloudflare Workers + Hono + D1)

- [ ] WCAG 2.1 AA accessibility; axe-core CI gate (T-4 in recommendations.md — not yet wired into CI)
- [ ] 2FA fields on admin users (columns exist, inactive by default; login flow doesn't use them yet)
- [ ] Playwright E2E happy-path coverage (T-1 in recommendations.md — highest-ROI gap, config exists but `tests/e2e/` is empty)

All other originally-planned Active items shipped across Phases 2–11 and moved
to Validated above (2026-07-09 reconciliation — see H-2 in `recommendations.md`;
this section previously still said "RSVP Application (Next.js / Self-Hosted)"
and "Gitea Actions CI/CD," both stale holdovers from before the Cloudflare
pivot that never got corrected after the pivot note was added).

### Out of Scope

- Real-time chat between guests — not core to RSVP value
- Native mobile app — web-first
- OAuth / social login for admin — email+password sufficient
- Multi-tenant SaaS billing — self-hosted model
- Video posts or rich media attachments in RSVPs
- React Router v7 / client-side framework for admin UI — admin dashboard is
  server-rendered HTML via Hono (no build step, no hydration); revisit only
  if the admin UI's interactivity needs outgrow what `admin.js` + forms can do
- R2 storage, Cloudflare Access — never adopted; exports stream directly from
  D1 query results, admin auth is app-level session (see Context below)

## Context

- **Stack**: Cloudflare Workers (Hono API + server-rendered HTML admin), Cloudflare Pages
  (static marketing site), D1 (SQLite, relational data), Queues (async jobs — notifications,
  reminders), KV (RSVP-submission rate limiter only — admin sessions are NOT in KV, see below)
- **Runtime**: Workers runtime (not Node.js) — no native modules, no filesystem, fetch-based APIs;
  `nodejs_compat` flag enabled solely for `qrcode`'s pngjs/zlib usage
- **ORM**: `drizzle-orm`/`drizzle-kit` for `src/db/schema.ts` migration generation only — every
  actual query is raw `db.prepare()` SQL (A-1 in recommendations.md, resolved by demoting
  drizzle-orm to a devDependency rather than adopting it at the query layer)
- **Frontend**: No client framework. Admin dashboard is server-rendered HTML from Hono route
  handlers (`src/views/layout.ts` shell + per-route templates); a single small vanilla JS file
  (`/rsvp/admin/assets/admin.js`) handles confirm-dialogs and Chart.js bootstrapping under CSP
- **Email/SMS**: Resend (HTTP API, no SMTP) via Workers `fetch()`; SMS via Twilio HTTP API,
  per-event toggle
- **Static site**: Vanilla HTML/CSS/JS, already live on Cloudflare Pages at `rsvpex-landing`
- **Auth**: App-level session only — argon2id password hashing (`@noble/hashes`, pure JS) +
  session token stored as SHA-256 hash in a D1 `sessions` table (not KV: eventual consistency
  is unacceptable for auth state, and hashing-before-store means a DB read-leak alone doesn't
  yield a working session — see S-15 in recommendations.md). No Cloudflare Access dependency.
- **CAPTCHA**: Cloudflare Turnstile (native integration), fail-closed on siteverify outage
- **Previous architecture docs**: the pre-pivot `rsvp/` (v5.2 Gitea/Proxmox architecture),
  `static-web-spec/`, `.superpowers/brainstorm/`, and `docs/superpowers/` scaffolding were removed
  entirely (H-3 in recommendations.md — ~80 tracked files of superseded architecture that could
  mislead a future agent into reading them as current; full content is preserved in git history)
- **Schema**: `app/src/db/schema.ts` + `app/migrations/*.sql` are the current source of truth

## Constraints

- **Runtime**: Cloudflare Workers — no Node.js APIs, CPU limit 10ms (50ms paid), no filesystem
- **Database**: D1 (SQLite dialect) — no advisory locks, no `SKIP LOCKED`, no `pg_` functions; concurrency via D1 transactions
- **Privacy**: No third-party storage of guest PII; all RSVP data in D1 (Cloudflare-controlled, EU region configurable)
- **Performance**: Public RSVP page p95 load < 1.5s; API p95 < 300ms globally (Workers edge)
- **Coverage**: ≥80% unit test coverage; 100% on critical modules (capacity, tokens, duplicate checks)
- **Deployment**: Wrangler CLI; GitHub Actions for CI/CD (same repo as static site)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Vanilla HTML/CSS/JS for static site | No build complexity; fastest deploys | ✓ Good |
| Warm Minimal visual design | Cream/terracotta palette — editorial, invitation-like | ✓ Good |
| GitHub Actions for static site CI/CD | Repo is on GitHub (andr-ca/rsvpex); native integration | ✓ Good |
| Web3Forms for waitlist | Already integrated; no backend needed for static site | ✓ Good |
| Cloudflare Workers + D1 + Queues for RSVP app | Serverless, globally distributed, no VM ops, native CF integration | ✓ Good — shipped Phases 1–11 |
| Drizzle ORM for schema/migrations only, not the query layer | Avoided a query-builder abstraction on top of D1's small SQL surface; `drizzle-kit generate` still gives migration diffing | ✓ Good — demoted to devDependency (A-1/D-6 in recommendations.md) rather than adopted at the query layer |
| argon2id password hashing via `@noble/hashes` (pure JS, no WASM) | Workers doesn't support WASM threads; pure-JS avoids that entirely | ✓ Good — OWASP min params (m=19456, t=2, p=1), plus a server-side pepper (S-11 in recommendations.md) |
| App-level D1 sessions, not Cloudflare Access or KV | CF Access adds an external IdP dependency for a single-admin-per-event tool; KV's eventual consistency is wrong for auth state | ✓ Good — session tokens hashed before storage (S-15) |
| No client-side framework for admin UI | Server-rendered HTML avoids a build step and hydration cost for a low-interactivity CRUD dashboard | ✓ Good — kept CSP simple (no framework runtime to allow-list) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-09 — H-2 reconciliation (recommendations.md): Active section no longer
contradicts the post-pivot stack (was still headed "Next.js / Self-Hosted" / "Gitea Actions CI/CD");
all shipped Phase 2–11 requirements moved to Validated; Context and Key Decisions updated to match
what's actually implemented (D1 sessions not KV, no Cloudflare Access, no R2, Resend not Postmark,
Drizzle demoted to schema-only).*
