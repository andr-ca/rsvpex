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

### Active

#### Static Marketing Site (Cloudflare Pages)

- [ ] Warm Minimal visual design: cream/off-white background, ink black type, terracotta accents, editorial serif headlines
- [ ] Hero section with serif headline, subheadline mentioning dietary restrictions and gift registries, inline email + name waitlist form
- [ ] Five feature pillars: Beautiful Invites, Live Tracking, Dietary Needs, Gift Registry, Your Data Private — SVG stroke icons, no emoji
- [ ] Decorative RSVP card mockup in hero showing dietary and gift registry rows
- [ ] Waitlist form via Web3Forms (existing access key), redirect to thank-you page
- [ ] GitHub Actions CI/CD deploying to Cloudflare Pages on push to main
- [ ] PR preview deployments with comment posting the preview URL

#### RSVP Application (Next.js / Self-Hosted)

- [ ] Public RSVP form at `/rsvp/:slug` — name, email/phone, party size, dietary restrictions, custom questions, status choice
- [ ] Kids event mode: children ages required, parents/siblings optional
- [ ] Capacity enforcement with transactional locks; waitlist mode when full
- [ ] Duplicate prevention: exact (email/phone per event) + optional heuristic (name+contact within 10 min)
- [ ] Thank-you page with wishlist link and ICS download; edit flow via `?rid=` token
- [ ] Admin dashboard: event CRUD, RSVP list with filters (status/dietary/search), pagination, charts, QR code
- [ ] CSV/JSON exports; CSV import with error summary
- [ ] Dietary restriction tracking: predefined set (nut allergy, vegetarian, halal, kosher) + free-form custom, ≤10 per RSVP
- [ ] Gift registry URL per event, shown on thank-you page after confirmation
- [ ] Email/SMS notifications: submission confirmation, capacity threshold (80%/100%), reminders N days before
- [ ] Audit log (PII-redacted diffs), 365-day retention
- [ ] 2FA fields on admin users (inactive by default, future-proof)
- [ ] i18n: event locale (en/fr/es) for public form strings
- [ ] WCAG 2.1 AA accessibility; axe-core CI gate
- [ ] Rate limiting (5/min/IP on RSVP POST), Cloudflare Turnstile CAPTCHA
- [ ] Gitea Actions CI/CD: lint → typecheck → unit (≥80% coverage, 100% critical) → E2E Playwright

### Out of Scope

- Real-time chat between guests — not core to RSVP value
- Native mobile app — web-first
- OAuth / social login for admin — email+password sufficient
- Multi-tenant SaaS billing — self-hosted model
- Video posts or rich media attachments in RSVPs

## Context

- **Stack**: Cloudflare Workers (API + SSR), Cloudflare Pages (frontend), D1 (SQLite, relational data), Queues (async jobs — notifications, reminders), R2 (exports/uploads if needed), KV (session storage), Access (admin auth layer)
- **Runtime**: Workers runtime (not Node.js) — no native modules, no filesystem, fetch-based APIs
- **ORM**: Drizzle ORM with D1 adapter (SQL migration workflow)
- **Frontend**: React (or HTMX) — TBD during research; Cloudflare Pages serves static assets
- **Email/SMS**: Resend or Postmark (HTTP API only, no SMTP) via Workers; SMS via Twilio HTTP
- **Static site**: Vanilla HTML/CSS/JS, already live on Cloudflare Pages at `rsvpex-landing`
- **Auth**: Cloudflare Access on `/rsvp/admin/*` + app-level session for admin users
- **CAPTCHA**: Cloudflare Turnstile (native integration)
- **Previous architecture docs**: `rsvp/docs/` — v5.2 architecture useful for domain logic but infra references are superseded
- **Schema**: `rsvp/docs/rsvp_schema_v5_3.sql.md` — SQLite-compatible subset to be adapted for D1

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
| Cloudflare Workers + D1 + Queues for RSVP app | Serverless, globally distributed, no VM ops, native CF integration | — Pending |
| Drizzle ORM with D1 adapter | Type-safe, migration-friendly, SQLite-compatible | — Pending |
| argon2id password hashing | Industry standard — note: needs WASM build for Workers runtime | — Pending |

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
*Last updated: 2026-03-23 — stack pivot to Cloudflare Workers + D1 + Queues; static site requirements marked Validated*
