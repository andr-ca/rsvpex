# Research Summary: RSVPex

**Domain:** RSVP / Event Management micro-site (Cloudflare Workers + D1 + Queues)
**Researched:** 2026-03-23
**Overall confidence:** HIGH (all critical claims verified against official Cloudflare documentation and npm registry)

---

## Executive Summary

RSVPex is a self-hosted, privacy-first RSVP management application built entirely on the Cloudflare Developer Platform. The full stack — Workers (API, Consumer, Cron), D1 (SQLite), KV (sessions), Queues (async notifications), and Pages (static assets) — has been verified against official Cloudflare documentation as of March 2026. The stack is production-ready, not experimental.

The most important architectural constraint is D1's single-writer serialization model. Unlike PostgreSQL, D1 has no advisory locks and no `SKIP LOCKED`. Capacity enforcement must use the atomic `INSERT ... SELECT ... WHERE count < capacity` pattern with `meta.changes === 0` for overbooking detection. This constraint must be understood and designed for before a single line of capacity code is written — it cannot be bolted on later.

The feature set is well-specified with 40+ v1 requirements across all domains (PUB, CAP, NOTIF, ADMIN, SEC, TEST, I18N). Seven gaps were identified in the requirements gap analysis (GAP-01 through GAP-07) covering ICS VTIMEZONE inclusion, duplicate-detected UX, token revocation grace period, admin capacity guard, edit-flow capacity behavior, expired access token response, and health endpoint semantics. These gaps should be closed before roadmap phase definitions are finalized.

argon2id password hashing via `@noble/hashes` v2 (pure-JS, no WASM) resolves the Workers runtime compatibility concern documented in PROJECT.md. Cloudflare Queues at-least-once delivery requires idempotency guards on all notification handlers. The test stack requires Vitest 4.1+ with `@cloudflare/vitest-pool-workers` and runs tests inside Miniflare for true fidelity.

---

## Key Findings

**Stack:** React Router v7 (SSR) + Hono (API) on Cloudflare Workers, Drizzle ORM + D1, KV sessions, Cloudflare Queues, `@noble/hashes` argon2id (pure-JS), Resend email, Vitest 4.1 + pool-workers.

**Architecture:** Single Worker (fetch + queue + scheduled exports), monorepo with `apps/worker` + `apps/web` + `packages/shared`, domain logic isolated in `domain/` with 100% test coverage gate on `capacity.ts`, `tokens.ts`, `duplicates.ts`.

**Critical pitfall:** D1 has no `SELECT FOR UPDATE` or advisory locks — capacity enforcement must use a single atomic `INSERT ... SELECT ... WHERE` transaction; any read-check-write split causes double-booking.

---

## Implications for Roadmap

Based on research, the following phase structure is recommended:

1. **Foundation** — Repo scaffold, toolchain, D1 schema, bindings, health endpoint
   - Addresses: infrastructure prerequisites for every other phase
   - Avoids: binding configuration drift, wrangler.jsonc mistakes discovered late
   - Rationale: Everything depends on D1 schema being stable and Worker binding surface being correct. Drizzle migrations must be set up correctly before domain logic is written.

2. **Public RSVP Form** — RSVP submit, capacity enforcement, duplicate detection, token flow, thank-you + ICS
   - Addresses: PUB-01–PUB-10, CAP-01–CAP-05, GUEST-01–GUEST-05
   - Avoids: Capacity race condition (D1 atomic pattern), ICS missing VTIMEZONE (GAP-01), duplicate-detected UX (GAP-02)
   - Rationale: Core value proposition. `domain/capacity.ts`, `domain/tokens.ts`, `domain/duplicates.ts` are critical modules requiring 100% test coverage — must be built and verified before Admin depends on them.

3. **Admin Auth** — argon2id login, lockout, password reset, KV session
   - Addresses: ADMIN-01–ADMIN-04, SEC-01
   - Avoids: argon2id CPU budget (use `@noble/hashes` pure-JS, OWASP minimum params), KV for sessions (not D1)
   - Rationale: Admin Dashboard (Phase 4) cannot be built without auth. Needs isolated phase to benchmark argon2id performance before committing to it.

4. **Admin Dashboard** — Event CRUD, RSVP list + filters + pagination, waitlist promotion, QR code, charts
   - Addresses: ADMIN-05–ADMIN-11, CAP-02–CAP-05
   - Avoids: Admin capacity guard on edit (GAP-04), edit-flow capacity overflow UX (GAP-05)
   - Rationale: Depends on both Phase 2 (RSVP data) and Phase 3 (auth). Waitlist promotion reuses capacity transaction pattern from Phase 2.

5. **Notifications** — Queue consumer, Resend email, Twilio SMS, capacity threshold emails, audit queue
   - Addresses: NOTIF-01–NOTIF-05, SEC-04 (audit write path)
   - Avoids: Duplicate emails from at-least-once delivery (idempotency guard via `notification_log` table)
   - Rationale: Async notification pipeline must be wired before Cron (Phase 6) can enqueue reminder jobs. The consumer Worker is the same Worker — `queue` export added in this phase.

6. **Cron Jobs** — Reminder emails (N days before), audit log purge (365-day retention)
   - Addresses: NOTIF-04, SEC-04 (purge), TEST-04 (cron test coverage)
   - Avoids: Cron + HTTP competing for CPU (monitor; split Workers only if needed)
   - Rationale: Depends on notification queue from Phase 5. Simple phase — `scheduled` export added, two jobs implemented.

7. **Data Management** — CSV export, JSON export (re-auth gated), CSV import with row-level errors
   - Addresses: ADMIN-07–ADMIN-09, v1.x deferred features
   - Avoids: ICS without VTIMEZONE (already covered in Phase 2); export schema drift before import
   - Rationale: Must come after admin dashboard (Phase 4) so export schema matches stable RSVP schema. Import maps to the same schema.

8. **Observability + Security Hardening** — Structured logging, CSRF, CSP headers, rate limiting hardening, OTEL traces, SEC-04–SEC-06
   - Addresses: SEC-02–SEC-06, TEST-01–TEST-04 (accessibility + coverage gates)
   - Avoids: Logging in request path (use `ctx.waitUntil`), inline scripts blocked by CSP (Turnstile `frame-src` whitelist required)
   - Rationale: Can partially run in parallel with Phases 5–7 but should be explicitly budgeted as a phase to prevent it from being perpetually deferred.

**Phase ordering rationale:**
- Foundation before everything (D1 schema changes are migrations — costly to redo)
- Public form before Admin Dashboard (admin reads RSVP data; domain modules need test coverage before dependent features)
- Admin Auth before Admin Dashboard (can't build dashboard without sessions)
- Notifications before Cron (cron enqueues; consumer must exist first)
- Data Management after Admin Dashboard (export schema stability)
- Observability as a dedicated phase (prevents security debt)

**Research flags for phases:**
- Phase 2 (RSVP Form): Needs deeper test coverage verification for concurrent capacity submissions — recommend a load test fixture with 20 concurrent POSTs to a capacity-1 event
- Phase 3 (Admin Auth): `@noble/hashes` argon2id parameters must be benchmarked in `wrangler dev` before committing; pure-JS may be slow at OWASP parameters on free tier
- Phase 5 (Notifications): `notification_log` idempotency table design is a research gate — confirm D1 `INSERT OR IGNORE` semantics match expected behavior
- Phase 8 (Security): CF Access setup for self-hosted single-admin is an open question — may be overkill; architecture is compatible with either approach

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions verified from npm registry; Cloudflare integrations verified from official docs |
| Features | HIGH | Requirements cross-referenced against REQUIREMENTS.md, competitor analysis, original v5 spec |
| Architecture | HIGH | All architectural patterns verified against official Cloudflare docs; D1 SQLite semantics confirmed |
| Pitfalls | HIGH | All pitfalls sourced from official Cloudflare docs and verified runtime behavior; no WebSearch-only claims |

---

## Gaps to Address

1. **GAP-01 — ICS VTIMEZONE**: Add acceptance criterion to PUB-09: "ICS includes VTIMEZONE block; timezone change alters offsets correctly"
2. **GAP-02 — Duplicate-detected UX**: When duplicate prevented (CAP-03), response should offer to resend edit link email — not just a bare 422
3. **GAP-03 — Token revocation grace period**: GUEST-05 references 60s grace window but doesn't specify implementation mechanism (KV TTL vs. `revoked_at` timestamp comparison)
4. **GAP-04 — Admin editing capacity guard**: ADMIN requirements don't block party size increases beyond capacity; needs ADMIN-12 requirement
5. **GAP-05 — Edit-flow capacity behavior**: PUB-10 edit flow doesn't specify behavior when increased party size exceeds capacity — offer waitlist or keep original
6. **GAP-06 — Expired access token response**: PUB-06 private event doesn't specify 403 + "Link expired" for expired `access_token_expires_at`
7. **GAP-07 — Health endpoint D1 semantics**: SEC-05 `/rsvp/healthz` must use a live `SELECT 1` probe; D1 "down" manifests as Worker exceptions, not connection pool errors

---

*Research summary for: RSVPex — self-hosted RSVP management on Cloudflare Workers + D1 + Queues*
*Researched: 2026-03-23*
