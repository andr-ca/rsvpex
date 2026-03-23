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

## Recommended Stack
### Runtime & Deployment
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Workers | runtime | API + SSR host | Globally distributed, 0 cold starts on paid plan, native D1/KV/Queues bindings |
| Cloudflare Pages | — | Static asset serving + Worker routing | Unified deploy with Workers via `_worker.js` or Vite plugin |
| Wrangler CLI | `4.76.0` | Deploy, dev server, migrations | Only official tool; `wrangler.jsonc` preferred over `.toml` for new projects |
| Cloudflare Vite Plugin | `1.x` | Build pipeline for SSR/SPA frameworks | Replaces raw `wrangler dev` build for framework-based apps; React Router v7 requires it |
### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React Router v7 | `7.13.1` | Full-stack SSR framework on Workers | Officially documented by Cloudflare; loaders/actions run in Workers runtime; bindings via `context.cloudflare.env`; scaffolded via `npm create cloudflare@latest -- my-app --framework=react-router` |
| Hono | `4.12.8` | API layer / middleware | Lightweight (14 KB), zero-dep, first-class Workers support; handles routing, validation middleware, CORS, CSP headers cleanly |
| `@hono/zod-validator` | `0.7.6` | Request validation middleware | Integrates Zod v4 with Hono; works on both v3 and v4 |
### Database & ORM
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare D1 | — | Primary datastore | SQLite dialect, 10 GB max, Workers-native binding, EU region configurable for GDPR |
| Drizzle ORM | `1.0.0-beta.2` | Type-safe query builder + schema | Best D1 support in the ecosystem; generates SQLite-compatible migration SQL; `drizzle-kit` handles migration diffing |
| `drizzle-kit` | `0.31.10` | Migration generation + push | `drizzle-kit generate` → SQL files; `wrangler d1 migrations apply` runs them; fully compatible workflow |
### Authentication & Sessions
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Access | — | Admin route guard (`/rsvp/admin/*`) | Zero-trust IdP proxy; handles SSO, enforces before Worker runs; no session code needed at this layer |
| Cloudflare KV | — | App-level session storage | Globally replicated; eventual consistency is acceptable for session reads; `SameSite=Lax; HttpOnly` cookies store session ID |
| `@noble/hashes` | `2.0.1` | argon2id password hashing | Pure-JS (no WASM, no threads — Workers don't support either); includes `argon2.js` export; confirmed Workers-compatible |
### Validation & Schema
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zod | `4.3.6` | Runtime validation + TypeScript inference | v4 is current; `@hono/zod-validator` 0.7.6 supports it; use for API request bodies, env config, and domain types |
### Async Jobs & Notifications
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Queues | — | Async notification dispatch | Workers-native; push-based consumer (Worker); DLQ via `dead_letter_queue` field; exponential backoff via `msg.retry({ delaySeconds })` |
| Cloudflare Cron Triggers | — | Scheduled jobs (reminders, purge) | `[triggers] crons = ["0 9 * * *"]` in wrangler.jsonc; handles NOTIF-04 reminder emails and SEC-04 audit log purge |
| Resend | HTTP API | Transactional email | Clean HTTP API, Workers-compatible (no SMTP), 3 000 free emails/month; `fetch()` only |
| Twilio | HTTP API | SMS (per-event toggle) | REST API, Workers-compatible; only used when per-event SMS enabled (NOTIF-05) |
### Security & Rate Limiting
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Turnstile | — | CAPTCHA on public RSVP form | Native CF integration; no third-party JS tracking; configurable on/off per event (SEC-02) |
| Cloudflare Rate Limiting | — | 5/min/IP on RSVP POST | Workers-native via `CF-Connecting-IP` + KV counter, or Cloudflare's built-in rate limiting rules |
### Observability
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `pino` | `9.x` | Structured JSON logging | Lightweight; works in Workers (no `fs` dependency when using browser/edge build); `pino/browser` import |
| Cloudflare Workers Traces | — | OTEL-compatible traces | Built into Workers runtime; custom spans via `waitUntil` + `cf-trace-id` header |
### Frontend (Charts & Accessibility)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Chart.js | `4.x` | Admin dashboard charts | Accessible (ARIA labels, keyboard nav), lightweight, React wrapper `react-chartjs-2` available; ADMIN-06 charts |
| `react-chartjs-2` | `5.x` | React bindings for Chart.js | Declarative Chart.js in React Router v7 loader-fed components |
| `axe-core` | `4.x` | Accessibility assertions in CI | TEST-02; integrates with Playwright for zero-violation gate |
| `@axe-core/playwright` | `4.x` | axe in Playwright tests | Run on public RSVP form + admin core pages in CI |
### Internationalisation
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `i18next` | `23.x` | i18n string management | Widely used, React integration via `react-i18next`; locale from event record (en/fr/es); I18N-01 |
| `react-i18next` | `14.x` | React bindings | Works with React Router v7 loaders — pass locale strings as loader data to avoid client-side async |
### Testing
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vitest | `4.1.0` | Unit + integration test runner | Peer required by `@cloudflare/vitest-pool-workers` |
| `@cloudflare/vitest-pool-workers` | `0.13.3` | Run tests in Workers runtime | Tests run inside Miniflare (Workers runtime), not jsdom/Node — true fidelity for D1, KV, Queues bindings |
| Playwright | `1.x` | E2E browser tests | TEST-01; `@axe-core/playwright` for accessibility assertions |
| `wrangler` (dev mode) | `4.76.0` | Local D1 + Workers dev server for E2E | `wrangler dev --local` runs full Workers runtime locally with D1 SQLite |
### Code Quality
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | `5.x` | Type safety | Strict mode; `isolatedModules: true` for Workers compatibility |
| ESLint | `9.x` | Linting + custom rules | Flat config (`eslint.config.ts`); custom rule enforcing `@req` / `@adr` JSDoc tags (TEST-03) |
| `@typescript-eslint` | `8.x` | TypeScript-aware linting | Strict type-checked rules |
| Prettier | `3.x` | Code formatting | Consistent style; run in CI |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Framework | React Router v7 (SSR) | HTMX + Hono JSX | RR7 is officially Cloudflare-documented; TypeScript loaders/actions; stronger accessibility story; HTMX deferred to v2 |
| Framework | React Router v7 (SSR) | Next.js | Requires Node.js runtime; incompatible with Workers |
| ORM | Drizzle ORM | Prisma | Prisma requires a query engine binary — incompatible with Workers runtime |
| ORM | Drizzle ORM | raw `better-sqlite3` | No type safety; `better-sqlite3` is Node.js-only anyway |
| Password hashing | `@noble/hashes` (argon2id) | `argon2` npm package | Requires native Node.js addon — incompatible with Workers |
| Password hashing | `@noble/hashes` (argon2id) | WebCrypto PBKDF2 | argon2id is the stronger algorithm; PBKDF2 is a fallback only if CPU budget exceeded |
| Email | Resend | SendGrid / Mailgun | Resend has cleaner API, Workers-compatible `fetch()` only; no SMTP SDKs needed |
| Logging | pino/browser | `console.log` only | pino provides structured JSON logs with level filtering; structured logs parseable by Cloudflare Logpush |
| i18n | i18next | Custom string maps | i18next has pluralisation, interpolation, namespace support — important for en/fr/es |
| Testing | `@cloudflare/vitest-pool-workers` | `jest` + `jest-environment-miniflare` | `jest-environment-miniflare` is deprecated; official pool workers integration is the supported 2025 path |
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
- React Router v7 on Cloudflare: https://developers.cloudflare.com/workers/frameworks/framework-guides/react-router/
- Vitest Workers pool: https://developers.cloudflare.com/workers/testing/vitest-integration/
- `@noble/hashes` argon2id: https://github.com/paulmillr/noble-hashes (v2.0.1 confirmed pure-JS)
- WebCrypto PBKDF2 in Workers: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/
- npm verified versions: wrangler@4.76.0, drizzle-orm@1.0.0-beta.2, drizzle-kit@0.31.10, hono@4.12.8, @hono/zod-validator@0.7.6, react-router@7.13.1, vitest@4.1.0, @cloudflare/vitest-pool-workers@0.13.3, @cloudflare/workers-types@4.20260317.1, zod@4.3.6, @noble/hashes@2.0.1
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
