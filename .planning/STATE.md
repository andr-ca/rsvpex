# RSVPex — Project State

## Project Reference

See: `.planning/PROJECT.md`

**Core value:** A guest can RSVP in under 30 seconds, and the host has complete, accurate guest data — dietary needs, party sizes, gift registry — without touching a third-party platform.

**Stack:** Cloudflare Workers (Hono) + D1 (SQLite) + Queues + Pages  
**Roadmap:** `.planning/ROADMAP.md`  
**Requirements:** `.planning/REQUIREMENTS.md`

---

## Current Focus

**Phase:** 1 — Foundation  
**Status:** Pending (not started)

---

## Phase Status

| Phase | Name | Status | Completed |
|-------|------|--------|-----------|
| 1 | Foundation | Pending | — |
| 2 | Public RSVP Form Core | Pending | — |
| 3 | Thank-You, ICS & Edit Flow | Pending | — |
| 4 | Admin Auth | Pending | — |
| 5 | Admin Dashboard | Pending | — |
| 6 | Data Management | Pending | — |
| 7 | Notifications | Pending | — |
| 8 | Cron & Audit | Pending | — |
| 9 | Internationalisation | Pending | — |
| 10 | Observability & Security Hardening | Pending | — |
| 11 | Testing & CI | Pending | — |

**Progress:** ░░░░░░░░░░░░░░░░░░░░ 0/11 phases complete

---

## Active Work

None — ready to begin Phase 1

---

## Blockers

None

---

## Key Decisions (Accumulated)

| Decision | Phase | Outcome |
|----------|-------|---------|
| `@noble/hashes` argon2id (pure-JS, no WASM) | Phase 4 | Resolves Workers runtime WASM budget concern; benchmark required at OWASP minimum params (m=19456, t=2, p=1) |
| D1 atomic transaction for capacity (no advisory locks) | Phase 2 | SQLite single-writer serialization; `INSERT ... WHERE count < capacity` pattern; `meta.changes === 0` for overbooking detection |
| KV sessions NOT used for admin auth (eventual consistency risk) | Phase 4 | Use D1 `sessions` table for session storage; KV stale-read window (up to 60s) is unacceptable for auth state |
| Two Queues (`rsvpex-notifications`, `rsvpex-audit`) | Phase 7 | Separate DLQ configs and retry semantics; different failure modes per queue |
| `notification_log` idempotency table | Phase 7 | Prevents duplicate emails from at-least-once Queue delivery; `INSERT OR IGNORE` on `UNIQUE (rsvp_id, notification_type)` |
| ICS VTIMEZONE required (GAP-01) | Phase 3 | RFC 5545 compliance; Outlook renders incorrectly without VTIMEZONE block |
| Duplicate-detected UX (GAP-02) | Phase 2 | 409 + offer to resend edit link; not a bare error code |
| Admin capacity guard on edits (GAP-04) | Phase 5 | Same D1 atomic pattern as public submit; admin is not exempt from capacity constraints |
| Expired access token (GAP-06) | Phase 2 | 403 + "Link expired" message; not 404 or silent redirect |

---

## Research Flags (Resolved / Active)

| Flag | Phase | Status |
|------|-------|--------|
| argon2id WASM CPU budget | Phase 4 | ✅ Resolved — use `@noble/hashes` pure-JS; benchmark at OWASP min params |
| D1 `batch()` ≠ ACID rollback | Phase 2 | ✅ Resolved — use explicit `BEGIN/COMMIT` SQL for multi-table atomic writes |
| Queue at-least-once delivery | Phase 7 | ✅ Resolved — `notification_log` idempotency table with `INSERT OR IGNORE` |
| KV eventual consistency for sessions | Phase 4 | ✅ Resolved — D1 `sessions` table instead of KV |
| ICS pure-string generation (no `fs`) | Phase 3 | ✅ Resolved — `ical-generator` (pure JS) or manual RFC 5545 string; never `fs.writeFile` |
| D1 `notification_log` `INSERT OR IGNORE` semantics | Phase 7 | 🔲 Active — verify in Miniflare before shipping NOTIF-01 |
| CF Access vs app-level session for admin | Phase 4 | 🔲 Active — architecture compatible with both; decision deferred to Phase 4 planning |

---

## Performance Targets

| Metric | Target | Phase |
|--------|--------|-------|
| Public RSVP page p95 load | < 1.5s | Phase 2 |
| API p95 response globally | < 300ms | Phase 2 |
| argon2id hash time (cold isolate) | < 200ms CPU | Phase 4 |
| Worker bundle size (gzip) | < 9 MB | Phase 1 |
| Cron `scheduled` handler completion | < 30s CPU | Phase 8 |
| Unit test suite duration | < 5 min | Phase 11 |
| Full CI pipeline duration | < 10 min | Phase 11 |

---

## Accumulated Context

### Pitfall Watchlist

The following 12 pitfalls from `research/PITFALLS.md` must be addressed in the phases listed:

| Pitfall | Phase to Address |
|---------|-----------------|
| Capacity race condition (non-atomic check-then-insert) | Phase 2 |
| argon2id WASM CPU budget | Phase 4 |
| Queue at-least-once → duplicate emails | Phase 7 |
| KV stale sessions after logout | Phase 4 |
| `db.batch()` not rollback-safe | Phase 2 |
| Worker bundle size > 10 MB | Phase 1 |
| Wrangler binding name mismatch | Phase 1 |
| Vitest Workers pool misconfiguration | Phase 1 |
| D1 local vs production SQL compatibility | Phase 1 |
| ICS generation with Node.js `fs` dependency | Phase 3 |
| D1 "overloaded" under burst RSVP traffic | Phase 2 (load test) |
| Stale D1 reads with read replication | Post-launch (deferred) |

### Architecture Reminders

- Single Worker exports `fetch`, `queue`, `scheduled` from `apps/worker/src/index.ts`
- `domain/` folder is pure functions — no CF bindings — testable without Miniflare
- `wrangler types` must be run after every binding change; output committed to repo
- D1 schema: all UUIDs as `TEXT`, timestamps as `TEXT ISO-8601`, booleans as `INTEGER 0/1`, JSON as `TEXT`
- Sessions: D1 `sessions` table (not KV) — KV eventual consistency unacceptable for auth
- Partial indexes supported in D1: `CREATE UNIQUE INDEX ... WHERE email IS NOT NULL`
- `PRAGMA foreign_keys = ON` must be set per migration (not global in D1)

---

## Session Continuity

*Next session should:*
1. Run `/gsd-plan-phase 1` to decompose Phase 1 (Foundation) into an executable plan
2. Reference `.planning/ROADMAP.md` Phase 1 requirements (SEC-05) and success criteria
3. Key tasks in Phase 1: monorepo scaffold, Drizzle schema, Worker bindings, health endpoint, Vitest setup, CI bundle-size check

---

*State initialized: 2026-03-23*  
*Last updated: 2026-03-23 — roadmap created, 11 phases defined*
