# Technology Stack

**Project:** RSVPex — RSVP Application (Cloudflare Workers + D1 + Queues)
**Researched:** 2026-03-23
**Overall confidence:** HIGH (all versions verified from npm registry and official Cloudflare docs)

---

## Recommended Stack

### Runtime & Deployment

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Workers | runtime | API + SSR host | Globally distributed, 0 cold starts on paid plan, native D1/KV/Queues bindings |
| Cloudflare Pages | — | Static asset serving + Worker routing | Unified deploy with Workers via `_worker.js` or Vite plugin |
| Wrangler CLI | `4.76.0` | Deploy, dev server, migrations | Only official tool; `wrangler.jsonc` preferred over `.toml` for new projects |
| Cloudflare Vite Plugin | `1.x` | Build pipeline for SSR/SPA frameworks | Replaces raw `wrangler dev` build for framework-based apps; React Router v7 requires it |

> **Wrangler note:** Requires Node ≥ 20. Use `wrangler.jsonc` (not `wrangler.toml`) for new projects — allows comments, same schema. Secrets go in `.dev.vars` for local dev (not `.env`); `wrangler secret put` for production.

> **Compatibility flags:** Add `compatibility_flags: ["nodejs_compat"]` in wrangler.jsonc — required by React Router v7 and many npm packages that use Node.js APIs internally.

---

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React Router v7 | `7.13.1` | Full-stack SSR framework on Workers | Officially documented by Cloudflare; loaders/actions run in Workers runtime; bindings via `context.cloudflare.env`; scaffolded via `npm create cloudflare@latest -- my-app --framework=react-router` |
| Hono | `4.12.8` | API layer / middleware | Lightweight (14 KB), zero-dep, first-class Workers support; handles routing, validation middleware, CORS, CSP headers cleanly |
| `@hono/zod-validator` | `0.7.6` | Request validation middleware | Integrates Zod v4 with Hono; works on both v3 and v4 |

> **Frontend decision:** Use **React Router v7 in SSR mode** for admin dashboard and RSVP form pages (server-rendered HTML for fast FCP, SEO on public form, accessibility). Hono handles pure API routes and middleware (rate limiting, CSRF, auth). They coexist: Hono routes mounted under `/api/*`, React Router handles page routes.

> **Not HTMX:** HTMX would work but React Router v7 is Cloudflare's officially supported path, has TypeScript-first loaders/actions, and matches the team's likely React familiarity. HTMX deferred to v2 consideration only.

---

### Database & ORM

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare D1 | — | Primary datastore | SQLite dialect, 10 GB max, Workers-native binding, EU region configurable for GDPR |
| Drizzle ORM | `1.0.0-beta.2` | Type-safe query builder + schema | Best D1 support in the ecosystem; generates SQLite-compatible migration SQL; `drizzle-kit` handles migration diffing |
| `drizzle-kit` | `0.31.10` | Migration generation + push | `drizzle-kit generate` → SQL files; `wrangler d1 migrations apply` runs them; fully compatible workflow |

> **D1 migration workflow:**
> 1. Define schema in Drizzle (`schema.ts`)
> 2. `drizzle-kit generate --dialect sqlite` → outputs `.sql` migration file to `migrations/`
> 3. `wrangler d1 migrations apply <DB_NAME>` → applies to D1 (local dev or production)
> 4. Set `migrations_dir` in `wrangler.jsonc` to point at the same folder
>
> **D1 concurrency:** No advisory locks, no `SKIP LOCKED`. Capacity enforcement (CAP-01) must use D1 transactions — SQLite serializable writes prevent double-booking. Drizzle's `.transaction()` is the correct primitive.

> **JSONB note:** D1 is SQLite — `JSONB` type is not natively indexed. Store dietary restrictions as `TEXT` (JSON string) and parse in application layer. Drizzle's `json()` column type handles this transparently.

---

### Authentication & Sessions

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Access | — | Admin route guard (`/rsvp/admin/*`) | Zero-trust IdP proxy; handles SSO, enforces before Worker runs; no session code needed at this layer |
| Cloudflare KV | — | App-level session storage | Globally replicated; eventual consistency is acceptable for session reads; `SameSite=Lax; HttpOnly` cookies store session ID |
| `@noble/hashes` | `2.0.1` | argon2id password hashing | Pure-JS (no WASM, no threads — Workers don't support either); includes `argon2.js` export; confirmed Workers-compatible |

> **Session flow:** Cloudflare Access guards the `/rsvp/admin/*` path at the Cloudflare network layer. The Worker still validates an app-level session cookie (stored in KV) for finer-grained control, audit logging, and lockout enforcement (ADMIN-01). The two layers are complementary, not redundant.

> **argon2id in Workers:** `@noble/hashes` v2 ships a pure-JS argon2id implementation — no WASM build, no worker threads. This resolves the "needs WASM build" concern in PROJECT.md. Use parameters: `m: 65536` (64 MB), `t: 3`, `p: 1` (parallelism 1, Workers are single-threaded).

> **WebCrypto PBKDF2:** Available natively in Workers runtime and a viable fallback if argon2id proves too slow under CPU limits. For admin login (low frequency), argon2id is preferred — PBKDF2 is a reasonable fallback only if benchmarks exceed the 50 ms CPU budget on paid plan.

---

### Validation & Schema

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zod | `4.3.6` | Runtime validation + TypeScript inference | v4 is current; `@hono/zod-validator` 0.7.6 supports it; use for API request bodies, env config, and domain types |

---

### Async Jobs & Notifications

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Queues | — | Async notification dispatch | Workers-native; push-based consumer (Worker); DLQ via `dead_letter_queue` field; exponential backoff via `msg.retry({ delaySeconds })` |
| Cloudflare Cron Triggers | — | Scheduled jobs (reminders, purge) | `[triggers] crons = ["0 9 * * *"]` in wrangler.jsonc; handles NOTIF-04 reminder emails and SEC-04 audit log purge |
| Resend | HTTP API | Transactional email | Clean HTTP API, Workers-compatible (no SMTP), 3 000 free emails/month; `fetch()` only |
| Twilio | HTTP API | SMS (per-event toggle) | REST API, Workers-compatible; only used when per-event SMS enabled (NOTIF-05) |

> **Queue configuration:**
> ```jsonc
> // wrangler.jsonc
> [[queues.producers]]
> queue = "notifications"
> binding = "NOTIFICATIONS_QUEUE"
>
> [[queues.consumers]]
> queue = "notifications"
> max_batch_size = 10
> max_batch_timeout = 30
> max_retries = 3
> dead_letter_queue = "notifications-dlq"
> ```
>
> Consumer Worker receives `MessageBatch<NotificationJob>`; call `msg.retry({ delaySeconds: 2 ** msg.attempts * 5 })` for exponential backoff.

---

### Security & Rate Limiting

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Turnstile | — | CAPTCHA on public RSVP form | Native CF integration; no third-party JS tracking; configurable on/off per event (SEC-02) |
| Cloudflare Rate Limiting | — | 5/min/IP on RSVP POST | Workers-native via `CF-Connecting-IP` + KV counter, or Cloudflare's built-in rate limiting rules |

> **CSRF:** Use double-submit cookie pattern. Hono middleware generates a `csrf_token` cookie (HttpOnly=false, SameSite=Strict) and validates matching hidden form field on POST. Works in Workers without server-side session reads.

> **CSP:** Set via Hono middleware on all responses. Strict CSP blocking inline scripts; Turnstile requires `frame-src https://challenges.cloudflare.com`.

---

### Observability

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `pino` | `9.x` | Structured JSON logging | Lightweight; works in Workers (no `fs` dependency when using browser/edge build); `pino/browser` import |
| Cloudflare Workers Traces | — | OTEL-compatible traces | Built into Workers runtime; custom spans via `waitUntil` + `cf-trace-id` header |

> **Pino in Workers:** Use `import pino from 'pino/browser'` — the browser build has no Node.js dependencies. Alternatively, use a thin wrapper around `console.log(JSON.stringify(...))` for zero-overhead structured logging.

---

### Frontend (Charts & Accessibility)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Chart.js | `4.x` | Admin dashboard charts | Accessible (ARIA labels, keyboard nav), lightweight, React wrapper `react-chartjs-2` available; ADMIN-06 charts |
| `react-chartjs-2` | `5.x` | React bindings for Chart.js | Declarative Chart.js in React Router v7 loader-fed components |
| `axe-core` | `4.x` | Accessibility assertions in CI | TEST-02; integrates with Playwright for zero-violation gate |
| `@axe-core/playwright` | `4.x` | axe in Playwright tests | Run on public RSVP form + admin core pages in CI |

---

### Internationalisation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `i18next` | `23.x` | i18n string management | Widely used, React integration via `react-i18next`; locale from event record (en/fr/es); I18N-01 |
| `react-i18next` | `14.x` | React bindings | Works with React Router v7 loaders — pass locale strings as loader data to avoid client-side async |

> **i18n strategy:** Load locale JSON in the React Router loader (server-side, Workers runtime). Pass translated strings as loader data — no client-side async language loading needed. Admin UI is English-only.

---

### Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vitest | `4.1.0` | Unit + integration test runner | Peer required by `@cloudflare/vitest-pool-workers` |
| `@cloudflare/vitest-pool-workers` | `0.13.3` | Run tests in Workers runtime | Tests run inside Miniflare (Workers runtime), not jsdom/Node — true fidelity for D1, KV, Queues bindings |
| Playwright | `1.x` | E2E browser tests | TEST-01; `@axe-core/playwright` for accessibility assertions |
| `wrangler` (dev mode) | `4.76.0` | Local D1 + Workers dev server for E2E | `wrangler dev --local` runs full Workers runtime locally with D1 SQLite |

> **Test structure:**
> - Unit tests (`*.test.ts`) use `@cloudflare/vitest-pool-workers` — bindings declared in `vitest.config.ts` via `defineWorkersConfig`
> - D1 local testing: `env.DB` binding available in test Workers pool; migrations applied via `wrangler d1 migrations apply --local` in CI setup step
> - Coverage: `vitest --coverage` with `@vitest/coverage-v8`; threshold 80% global, 100% on `src/domain/capacity`, `src/domain/tokens`, `src/domain/duplicates`
> - E2E: Playwright against `wrangler dev` process; separate CI job

---

### Code Quality

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | `5.x` | Type safety | Strict mode; `isolatedModules: true` for Workers compatibility |
| ESLint | `9.x` | Linting + custom rules | Flat config (`eslint.config.ts`); custom rule enforcing `@req` / `@adr` JSDoc tags (TEST-03) |
| `@typescript-eslint` | `8.x` | TypeScript-aware linting | Strict type-checked rules |
| Prettier | `3.x` | Code formatting | Consistent style; run in CI |

---

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

---

## Project-Specific Configuration Notes

### Monorepo Layout (Recommended)

```
rsvpex/                          # repo root (GitHub: andr-ca/rsvpex)
├── site/                        # static marketing site (already live on CF Pages)
│   └── public/
├── app/                         # RSVP application (Workers + Pages)
│   ├── src/
│   │   ├── domain/              # capacity.ts, tokens.ts, duplicates.ts — 100% coverage required
│   │   ├── routes/              # React Router v7 route files
│   │   ├── api/                 # Hono API routes (under /api/*)
│   │   └── workers/             # Queue consumer, cron trigger
│   ├── migrations/              # Drizzle-generated SQL migrations
│   ├── tests/
│   │   ├── unit/
│   │   └── e2e/
│   ├── wrangler.jsonc
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   └── drizzle.config.ts
├── .github/
│   └── workflows/
│       ├── site.yml             # static site CI/CD (existing)
│       └── app.yml              # RSVP app CI/CD (new)
├── .env.sample                  # sanitized secrets reference
└── .dev.vars.sample             # sanitized Wrangler local secrets reference
```

### Key wrangler.jsonc Fields

```jsonc
{
  "name": "rsvpex-app",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "migrations_dir": "migrations",

  "[[d1_databases]]": [
    { "binding": "DB", "database_name": "rsvpex", "database_id": "..." }
  ],
  "[[kv_namespaces]]": [
    { "binding": "SESSIONS", "id": "..." }
  ],
  "[[queues.producers]]": [
    { "queue": "notifications", "binding": "NOTIFICATIONS_QUEUE" }
  ],
  "[[queues.consumers]]": [
    {
      "queue": "notifications",
      "max_batch_size": 10,
      "max_batch_timeout": 30,
      "max_retries": 3,
      "dead_letter_queue": "notifications-dlq"
    }
  ],
  "[triggers]": {
    "crons": ["0 9 * * *"]
  }
}
```

### Secrets (`.dev.vars` for local, `wrangler secret put` for prod)

```
RESEND_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
TURNSTILE_SECRET_KEY=
SESSION_SECRET=
ADMIN_PEPPER=
```

Sanitized `.dev.vars.sample` must be committed alongside `.dev.vars` (gitignored).

---

## Installation

```bash
# In app/ directory

# Core runtime + framework
npm install hono @hono/zod-validator react react-dom react-router zod

# Database
npm install drizzle-orm
npm install -D drizzle-kit

# Auth / crypto
npm install @noble/hashes

# i18n
npm install i18next react-i18next

# Observability
npm install pino

# Charts
npm install chart.js react-chartjs-2

# Dev / build
npm install -D wrangler vite @cloudflare/vite-plugin typescript @cloudflare/workers-types

# Testing
npm install -D vitest @cloudflare/vitest-pool-workers @vitest/coverage-v8 playwright @playwright/test @axe-core/playwright

# Linting
npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier
```

---

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
