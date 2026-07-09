---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Phase 3 context gathered
last_updated: "2026-03-23T18:16:05.784Z"
progress:
  total_phases: 11
  completed_phases: 0
  total_plans: 0
  completed_plans: 2
---

# RSVPex — Project State

## Project Reference

See: `.planning/PROJECT.md`

**Core value:** A guest can RSVP in under 30 seconds, and the host has complete, accurate guest data — dietary needs, party sizes, gift registry — without touching a third-party platform.

**Stack:** Cloudflare Workers (Hono) + D1 (SQLite) + Queues + Pages  
**Roadmap:** `.planning/ROADMAP.md`  
**Requirements:** `.planning/REQUIREMENTS.md`

---

## Current Focus

**Phase:** 3 — Thank-You, ICS & Edit Flow  
**Status:** Pending — Phase 2 complete; ready to begin Phase 3

---

## Phase Status

| Phase | Name | Status | Completed |
|-------|------|--------|-----------|
| 1 | Foundation | Complete | 2026-03-23 |
| 2 | Public RSVP Form Core | Complete | 2026-03-23 |
| 3 | Thank-You, ICS & Edit Flow | Pending | — |
| 4 | Admin Auth | Pending | — |
| 5 | Admin Dashboard | Pending | — |
| 6 | Data Management | Pending | — |
| 7 | Notifications | Pending | — |
| 8 | Cron & Audit | Pending | — |
| 9 | Internationalisation | Pending | — |
| 10 | Observability & Security Hardening | Pending | — |
| 11 | Testing & CI | Pending | — |

**Progress:** ████░░░░░░░░░░░░░░░░ 2/11 phases complete

---

## Active Work

None — ready to begin Phase 3 (Thank-You, ICS & Edit Flow)

---

## Blockers

None

---

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260708-uot | Full project review (idea, architecture, implementation, CI/CD) → recommendations.md | 2026-07-09 | e188eca | [260708-uot-full-project-review-idea-architecture-im](./quick/260708-uot-full-project-review-idea-architecture-im/) |

---

## Key Decisions (Accumulated)

| Decision | Phase | Outcome |
|----------|-------|---------|
| `@noble/hashes` argon2id (pure-JS, no WASM) | Phase 4 | Resolves Workers runtime WASM budget concern; benchmark required at OWASP minimum params (m=19456, t=2, p=1) |
| D1 atomic transaction for capacity (no advisory locks) | Phase 2 | SQLite single-writer serialization; `INSERT ... WHERE count < capacity` pattern; `meta.changes === 0` for overbooking detection |
| No `BEGIN IMMEDIATE` in Workers D1 | Phase 2 | D1 rejects raw transaction SQL (`BEGIN IMMEDIATE`) from Workers; conditional INSERT is serialized at D1 API layer |
| KV sessions NOT used for admin auth (eventual consistency risk) | Phase 4 | Use D1 `sessions` table for session storage; KV stale-read window (up to 60s) is unacceptable for auth state |
| Two Queues (`rsvpex-notifications`, `rsvpex-audit`) | Phase 7 | Separate DLQ configs and retry semantics; different failure modes per queue |
| `notification_log` idempotency table | Phase 7 | Prevents duplicate emails from at-least-once Queue delivery; `INSERT OR IGNORE` on `UNIQUE (rsvp_id, notification_type)` |
| ICS VTIMEZONE required (GAP-01) | Phase 3 | RFC 5545 compliance; Outlook renders incorrectly without VTIMEZONE block |
| Duplicate-detected UX (GAP-02) | Phase 2 | 409 + offer to resend edit link; not a bare error code |
| Admin capacity guard on edits (GAP-04) | Phase 5 | Same D1 atomic pattern as public submit; admin is not exempt from capacity constraints |
| Expired access token (GAP-06) | Phase 2 | 403 + "Link expired" message; not 404 or silent redirect |
| `app.fetch(request, env)` for integration tests | Phase 2 | `SELF.fetch` / `exports.default.fetch` run in separate Miniflare isolate with separate D1 storage; direct app import shares storage |

---

## Research Flags (Resolved / Active)

| Flag | Phase | Status |
|------|-------|--------|
| argon2id WASM CPU budget | Phase 4 | ✅ Resolved — use `@noble/hashes` pure-JS; benchmark at OWASP min params |
| D1 `batch()` ≠ ACID rollback | Phase 2 | ✅ Resolved — no `BEGIN/COMMIT` in Workers; D1 serializes single-statement writes |
| D1 rejects `BEGIN IMMEDIATE` from Workers | Phase 2 | ✅ Resolved — use conditional `INSERT … WHERE` instead |
| Queue at-least-once delivery | Phase 7 | ✅ Resolved — `notification_log` idempotency table with `INSERT OR IGNORE` |
| KV eventual consistency for sessions | Phase 4 | ✅ Resolved — D1 `sessions` table instead of KV |
| ICS pure-string generation (no `fs`) | Phase 3 | ✅ Resolved — `ical-generator` (pure JS) or manual RFC 5545 string; never `fs.writeFile` |
| D1 `notification_log` `INSERT OR IGNORE` semantics | Phase 7 | 🔲 Active — verify in Miniflare before shipping NOTIF-01 |
| CF Access vs app-level session for admin | Phase 4 | 🔲 Active — architecture compatible with both; decision deferred to Phase 4 planning |
| Coverage tooling: v8 + istanbul both crash in vitest-pool-workers 0.13.3 | Phase 11 | 🔲 Active — known CF upstream issue; address when upgrading test stack |

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

## Pitfall Watchlist

The following 12 pitfalls from `research/PITFALLS.md` must be addressed in the phases listed:

| Pitfall | Phase to Address | Status |
|---------|-----------------|--------|
| Capacity race condition (non-atomic check-then-insert) | Phase 2 | ✅ Resolved |
| argon2id WASM CPU budget | Phase 4 | Pending |
| Queue at-least-once → duplicate emails | Phase 7 | Pending |
| KV stale sessions after logout | Phase 4 | Pending |
| `db.batch()` not rollback-safe | Phase 2 | ✅ Resolved (no `BEGIN/COMMIT` needed) |
| Worker bundle size > 10 MB | Phase 1 | ✅ Resolved (20.30 KiB gzip) |
| Wrangler binding name mismatch | Phase 1 | ✅ Resolved |
| Vitest Workers pool misconfiguration | Phase 1 | ✅ Resolved |
| D1 local vs production SQL compatibility | Phase 1 | ✅ Resolved |
| ICS generation with Node.js `fs` dependency | Phase 3 | Pending |
| D1 "overloaded" under burst RSVP traffic | Phase 2 (load test) | ✅ 20-concurrent test passes |
| Stale D1 reads with read replication | Post-launch (deferred) | Deferred |

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

Last session: 2026-03-23T18:16:05.781Z
Stopped at: Phase 3 context gathered

---

*State initialized: 2026-03-23*  
*Last updated: 2026-03-23 — Phase 1 plan in progress; Tasks 1–7 committed, Task 8 uncommitted, Tasks 9–10 pending*
