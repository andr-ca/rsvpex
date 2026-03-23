# Phase 1: Foundation - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers the complete project scaffold: monorepo layout, Cloudflare Workers + D1 + KV + Queues bindings wired, Drizzle ORM schema + initial migration, health endpoint, Vitest in Workers pool, and CI bundle-size gate. No feature code is written — this phase proves the binding surface is correct and the toolchain works end-to-end.

</domain>

<decisions>
## Implementation Decisions

### the agent's Discretion
All implementation choices are at the agent's discretion — pure infrastructure phase.

Key constraints from research/STATE.md to respect:
- Monorepo layout: `apps/worker/` for the Worker, `packages/domain/` for pure-function domain logic
- Worker exports: `fetch`, `queue`, `scheduled` from `apps/worker/src/index.ts`
- Bindings: `DB` (D1), `SESSION_KV` (KV), `NOTIFICATIONS_QUEUE` (Queue), `AUDIT_QUEUE` (Queue)
- D1 UUID as `TEXT`, timestamps as `TEXT ISO-8601`, booleans as `INTEGER 0/1`, JSON as `TEXT`
- Sessions: D1 `sessions` table (not KV)
- `PRAGMA foreign_keys = ON` in migration
- `wrangler.jsonc` (not `.toml`) for new project
- Stack: React Router v7 SSR on Pages + Hono API worker; Drizzle ORM + drizzle-kit; vitest + @cloudflare/vitest-pool-workers
- `.dev.vars` gitignored; `.env.sample` documents all secrets
- Worker bundle gzip < 9 MB
- Wrangler CLI v4.76.0

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `static-web/` — Landing page (already deployed to Cloudflare Pages as `rsvpex-landing`); separate from the RSVP Worker project
- `.github/workflows/deploy.yml` — Existing GitHub Actions deploy workflow for static site; can be extended or a second workflow added for the Worker

### Established Patterns
- No existing Worker/app code — this is a greenfield scaffold
- Static site uses plain HTML/CSS/JS (no framework); Worker app will use React Router v7 + Hono

### Integration Points
- The RSVP Worker app is a **separate** Cloudflare project from the static site (`rsvpex-landing`)
- Worker routes will be under `/rsvp/*`; static site routes stay as-is
- D1 database name: `rsvpex-db`; KV namespace: `rsvpex-sessions`
- Queue names: `rsvpex-notifications`, `rsvpex-audit`

</code_context>

<specifics>
## Specific Ideas

- Health endpoint: `GET /rsvp/healthz` → `{"status":"ok","db":"ok"}` with live `SELECT 1` D1 probe; 503 when D1 unreachable
- All secrets documented in `.env.sample`: `RESEND_API_KEY`, `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `TURNSTILE_SECRET_KEY`, `SESSION_SECRET`, `ARGON2_PEPPER`
- D1 migration file: `0001_init.sql` (Drizzle-generated), must apply cleanly both `--local` and `--remote`
- Vitest smoke test: verifies `env.DB.prepare` is callable (D1 binding works in Miniflare)
- `wrangler types` must produce typed `Env` interface with all 4 bindings

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
