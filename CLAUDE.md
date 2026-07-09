<!-- GSD:project-start source:PROJECT.md -->
## Project

**RSVPex**

RSVPex is an RSVP management micro-site for events that matter. Guests RSVP through a clean public form; hosts manage everything — guest lists, dietary restrictions, gift registries, capacity, and exports — through a private admin dashboard. It runs fully on the Cloudflare ecosystem (Workers + D1 + Queues + Pages), with no third-party storage of guest data.

The project has two layers: a **static marketing site** (landing page, already live on Cloudflare Pages) and the **RSVP application** (Cloudflare Workers + D1 + Queues + Pages).

**Core Value:** A guest can RSVP in under 30 seconds, and the host has complete, accurate guest data — dietary needs, party sizes, gift registry link — without touching a third-party platform.

### Constraints

- **Runtime**: Cloudflare Workers — no Node.js APIs, CPU limit 10ms (50ms paid), no filesystem
- **Database**: D1 (SQLite dialect) — no advisory locks, no `SKIP LOCKED`, no `pg_` functions; concurrency via D1 transactions
- **Privacy**: No third-party storage of guest PII; all RSVP data in D1 (Cloudflare-controlled, EU region configurable)
- **Performance**: Public RSVP page p95 load < 1.5s; API p95 < 300ms globally (Workers edge)
- **Coverage**: ≥80% unit test coverage; 100% on critical modules (capacity, tokens, duplicate checks)
- **Deployment**: Wrangler CLI; GitHub Actions for CI/CD (same repo as static site)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

**Note (H-4 in recommendations.md, refreshed 2026-07-09):** this table now
reflects what's actually in `app/package.json` and running in the codebase,
not the pre-implementation research proposal. Several original proposals
(React Router v7, pino, i18next, Cloudflare Access/KV sessions) were never
adopted — the app shipped with simpler choices that turned out sufficient.
See `.planning/PROJECT.md` Context/Key Decisions for the "why."

## Actual Stack
### Runtime & Deployment
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Workers | runtime | API + SSR host | Globally distributed, 0 cold starts on paid plan, native D1/KV/Queues bindings |
| Cloudflare Pages | — | Static marketing site hosting (separate from the Workers app) | Direct-upload deploy via `wrangler pages deploy`, no build step |
| Wrangler CLI | `4.76.0` | Deploy, dev server, migrations | Only official tool; `wrangler.jsonc` (not `.toml`) |
### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Hono | `4.12.28` | Routing + middleware for the entire app (API and admin HTML) | Lightweight, zero-dep, first-class Workers support; handles routing, CSP/CSRF middleware, rate limiting |
| — (no client framework) | — | Admin dashboard is server-rendered HTML | `src/views/layout.ts` page shell + per-route template functions; no React/RR7 — avoids a build step and hydration cost for a low-interactivity CRUD UI; a small vanilla `admin.js` (served from `src/routes/adminAssets.ts`) covers the little client-side behavior needed (confirm dialogs, Chart.js bootstrap) under a strict CSP |
| Zod | `4.3.6` | Runtime validation | Manual `.safeParse()` calls in route handlers, not a Hono validator middleware (`@hono/zod-validator` was declared but never used — removed, D-6) |
### Database & ORM
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare D1 | — | Primary datastore | SQLite dialect, Workers-native binding |
| `drizzle-orm` / `drizzle-kit` | `0.45.1` / `0.31.10` | Schema definition (`src/db/schema.ts`) + migration diffing only | Every actual query is raw `db.prepare()` SQL (A-1 in recommendations.md) — Drizzle is a devDependency here, not a runtime query layer; `drizzle-kit generate` produces the SQL files in `migrations/`, applied via `wrangler d1 migrations apply` |
### Authentication & Sessions
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| D1 `sessions` table | — | Admin session storage | Not Cloudflare Access (no external IdP dependency for a single-admin-per-event tool) and not KV (eventual consistency is wrong for auth state); session tokens are SHA-256-hashed before storage (S-15) so a DB read-leak alone doesn't grant a working session |
| `@noble/hashes` | `2.0.1` | argon2id password hashing + HMAC (IP hashing) | Pure-JS (no WASM/threads — Workers doesn't support either); OWASP-minimum params plus a server-side pepper (S-11) |
### Async Jobs & Notifications
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Queues | — | Async notification dispatch | Push-based consumer; DLQ via `dead_letter_queue`; idempotency via a `notification_log` table (`UNIQUE(rsvp_id, notification_type)`) |
| Cloudflare Cron Triggers | — | Daily job at 06:00 UTC | Reminder emails, 365-day audit log purge, expired session/reset-token purge (D-8) |
| Resend | HTTP API | Transactional email | `fetch()` only, no SMTP |
| Twilio | HTTP API | SMS (per-event toggle) | REST API, only used when an event enables SMS |
### Security & Rate Limiting
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Turnstile | — | CAPTCHA on public RSVP form | Fails closed on a siteverify outage (S-1) |
| Cloudflare KV | — | RSVP-submission rate limiter only (5/min/IP) | Not used for sessions — see Authentication above; best-effort defense-in-depth, not a hard guarantee (S-4) |
### Observability
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `console.log(JSON.stringify(...))` | — | Structured JSON request logging | No `pino` dependency — Workers' `console.log` output is already captured as structured lines by Cloudflare Logpush/tail; adding pino would be a dependency for something one `JSON.stringify` call already does correctly here |
| Cloudflare Workers Traces | — | Trace-ID propagation | Custom spans via `waitUntil` + `cf-trace-id` header (`src/domain/tracing.ts`) |
### Frontend (Admin Dashboard Charts)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Chart.js | loaded via `cdn.jsdelivr.net` `<script>` (CSP-allowed) | Admin dashboard charts | No npm dependency/bundling — a CSP-compliant JSON-island (`<script type="application/json" data-chart-stats>`) passes data to a small bootstrap in `admin.js`; no React wrapper needed since there's no React |
| `axe-core` / `@axe-core/playwright` | not yet installed | Accessibility assertions | Planned (T-4 in recommendations.md), not yet wired in — `playwright.config.ts` exists but `tests/e2e/` is empty (T-1, highest-ROI gap) |
### Internationalisation
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Hand-rolled `t()` / `resolveLocale()` | `src/i18n/` | i18n string management for en/fr/es | No `i18next` dependency — the string set is small and fixed (public form + thank-you + capacity-full pages), so a plain lookup table avoids the pluralisation/namespace machinery an app this size doesn't need |
### Testing
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vitest | `4.1.0` | Unit + integration test runner | Peer required by `@cloudflare/vitest-pool-workers` |
| `@cloudflare/vitest-pool-workers` | `0.13.3` | Run tests in Workers runtime | Tests run inside Miniflare, not jsdom/Node — true fidelity for D1/KV/Queues bindings |
| Playwright | config present, no tests yet | E2E browser tests | T-1 in recommendations.md — highest-ROI gap identified in the review; not yet implemented |
### Code Quality
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | `5.x` | Type safety | Strict mode |
| ESLint | `9.x` | Linting + custom rules | Flat config (`eslint.config.ts`); custom rule enforcing `@req` JSDoc tags |
| `@typescript-eslint` | `8.x` | TypeScript-aware linting | Strict type-checked rules |
| Prettier | `3.x` | Code formatting | Run in CI |
## Alternatives Considered (and why the original proposal changed)
| Category | Originally Proposed | What Shipped | Why It Changed |
|----------|---------------------|---------------|-----------------|
| Framework | React Router v7 (SSR) | Server-rendered Hono HTML, no client framework | The admin UI's actual interactivity (confirm dialogs, one chart) didn't justify a build step, hydration cost, or the extra CSP surface a framework runtime needs |
| ORM | Drizzle ORM as the query layer | Drizzle for schema/migrations only; raw `db.prepare()` SQL for every query | D1's SQL surface is small enough that a query builder added an abstraction layer without removing much boilerplate (A-1) |
| Auth | Cloudflare Access + KV sessions | argon2id + D1 `sessions` table (hashed tokens) | KV's eventual consistency is wrong for auth state; Access adds an external IdP dependency this single-admin-per-event tool doesn't need |
| Logging | `pino`/browser build | `console.log(JSON.stringify(...))` | Workers' console output is already captured as structured lines by Cloudflare's log tooling — pino added a dependency for no behavioral gain here |
| i18n | `i18next` + `react-i18next` | Hand-rolled `t()`/`resolveLocale()` lookup table | Fixed, small string set (3 locales, a handful of pages) didn't need pluralisation/namespace machinery, and there's no React to bind `react-i18next` to |
| Password hashing | `@noble/hashes` (argon2id) | Same — no change | Requires native Node.js addon (`argon2` npm) is incompatible with Workers; WebCrypto PBKDF2 was the fallback-only option, not needed |
| Email | Resend | Same — no change | Clean HTTP API, Workers-compatible `fetch()` only |
## Project-Specific Configuration Notes
### Monorepo Layout (Recommended)
### Key wrangler.jsonc Fields
### Secrets (`.dev.vars` for local, `wrangler secret put` for prod)
## Installation
# In app/ directory
# Core runtime + framework
# Database
# Auth / crypto
# i18n
# Observability
# Charts
# Dev / build
# Testing
# Linting
## Sources
- Wrangler v4 release notes + config docs: https://developers.cloudflare.com/workers/wrangler/
- D1 + Drizzle integration: https://developers.cloudflare.com/d1/community-projects/ and https://orm.drizzle.team/docs/connect-cloudflare-d1
- Cloudflare Queues batching + DLQ: https://developers.cloudflare.com/queues/configuration/batching-retries/
- Vitest Workers pool: https://developers.cloudflare.com/workers/testing/vitest-integration/
- `@noble/hashes` argon2id: https://github.com/paulmillr/noble-hashes (v2.0.1 confirmed pure-JS)
- WebCrypto PBKDF2 in Workers: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/
- npm versions as installed (`app/package.json`, refreshed 2026-07-09): wrangler@4.76.0, drizzle-orm@0.45.1 (devDependency, schema/migrations only), drizzle-kit@0.31.10, hono@4.12.28, vitest@4.1.0, @cloudflare/vitest-pool-workers@0.13.3, @cloudflare/workers-types@4.20260317.1, zod@4.3.6, @noble/hashes@2.0.1, ical-generator@10.x, qrcode@1.5.x
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
