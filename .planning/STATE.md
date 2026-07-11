---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Phase 11 complete; post-launch remediation (quick tasks) in progress
last_updated: "2026-07-09T02:20:00.000Z"
progress:
  total_phases: 11
  completed_phases: 11
  total_plans: 11
  completed_plans: 11
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

**Phase:** Post-launch remediation (no new numbered phase — working from `recommendations.md`)  
**Status:** All 11 roadmap phases complete. A full architecture/implementation/CI review
(quick task `260708-uot`) produced `recommendations.md`; a follow-up quick task
(`260708-v1c`) is implementing and validating every finding, tracked in
`recommendations-update.md`.

---

## Phase Status

| Phase | Name | Status | Completed |
|-------|------|--------|-----------|
| 1 | Foundation | Complete | 2026-03-23 |
| 2 | Public RSVP Form Core | Complete | 2026-03-23 |
| 3 | Thank-You, ICS & Edit Flow | Complete | 2026-03-23 |
| 4 | Admin Auth | Complete | 2026-03-23 |
| 5 | Admin Dashboard | Complete | 2026-03-24 |
| 6 | Data Management | Complete | 2026-03-27 |
| 7 | Notifications | Complete | 2026-03-27 |
| 8 | Cron & Audit | Complete | 2026-03-27 |
| 9 | Internationalisation | Complete | 2026-03-27 |
| 10 | Observability & Security Hardening | Complete | 2026-03-28 |
| 11 | Testing & CI | Complete | 2026-03-28 |

**Progress:** ████████████████████ 11/11 phases complete

Dates reconciled from git log (H-1 in recommendations.md — this table previously
said "2/11 complete, Phase 3 pending" long after Phase 11 had shipped). No
per-phase `NN-SUMMARY.md` exists for phases 3–11 beyond `01-SUMMARY.md` /
`02-SUMMARY.md`; backfilling those is optional and not done here — git log on
the commits above is the source of truth for what shipped in each phase.

---

## Active Work

Working through `recommendations.md` end-to-end (quick task `260708-v1c`):
Milestone A (7 P0 ship blockers) — done. Milestone B (C-1..C-17 correctness) —
done. Milestone C (S-1..S-16 security) — done. Milestone D (CI/CD, testing,
docs hygiene) — in progress. See `recommendations-update.md` at the repo root
for the finding-by-finding disposition and validation evidence.

---

## Blockers

None

---

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260708-uot | Full project review (idea, architecture, implementation, CI/CD) → recommendations.md | 2026-07-09 | e188eca | | [260708-uot-full-project-review-idea-architecture-im](./quick/260708-uot-full-project-review-idea-architecture-im/) |
| 260708-v1c | Addressed every recommendations.md finding (P0/C/S/D/H) → recommendations-update.md | 2026-07-09 | 2cfa768 | | [260708-v1c-address-recommendations-md-findings-impl](./quick/260708-v1c-address-recommendations-md-findings-impl/) |
| 260710-rkt | Multi-user admin: invite-based provisioning, Owner/Editor roles, admin management (deactivate/promote/demote) | 2026-07-10 | 4c374ee | Verified | [260710-rkt-plan-and-implement-multi-user-admin-func](./quick/260710-rkt-plan-and-implement-multi-user-admin-func/) |

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
| D1 `notification_log` `INSERT OR IGNORE` semantics | Phase 7 | ✅ Resolved — verified in Miniflare integration tests |
| CF Access vs app-level session for admin | Phase 4 | ✅ Resolved — app-level session (argon2id + D1 `sessions` table), no CF Access dependency |
| Coverage tooling: v8 + istanbul both crash in vitest-pool-workers 0.13.3 | Phase 11 | 🔲 Active — known CF upstream issue; both packages removed from devDependencies (D-6 in recommendations.md) rather than carried as dead weight; revisit when the ecosystem adds support |

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
| argon2id WASM CPU budget | Phase 4 | ✅ Resolved — `@noble/hashes` pure-JS, OWASP min params |
| Queue at-least-once → duplicate emails | Phase 7 | ✅ Resolved — `notification_log` idempotency table |
| KV stale sessions after logout | Phase 4 | ✅ Moot — sessions live in D1, not KV (see Key Decisions above); `deleteSession`/`deleteAllSessionsForUser` are synchronous D1 deletes |
| `db.batch()` not rollback-safe | Phase 2 | ✅ Resolved (no `BEGIN/COMMIT` needed) |
| Worker bundle size > 10 MB | Phase 1 | ✅ Resolved (20.30 KiB gzip) |
| Wrangler binding name mismatch | Phase 1 | ✅ Resolved |
| Vitest Workers pool misconfiguration | Phase 1 | ✅ Resolved |
| D1 local vs production SQL compatibility | Phase 1 | ✅ Resolved |
| ICS generation with Node.js `fs` dependency | Phase 3 | ✅ Resolved — `ical-generator` (pure JS), no `fs` |
| D1 "overloaded" under burst RSVP traffic | Phase 2 (load test) | ✅ 20-concurrent test passes |
| Stale D1 reads with read replication | Post-launch (deferred) | Deferred |

### Architecture Reminders

- Single Worker exports `fetch`, `queue`, `scheduled` from `app/src/index.ts`
- `domain/` folder is pure functions — no CF bindings — testable without Miniflare
- `wrangler types` must be run after every binding change; output committed to repo
- D1 schema: all UUIDs as `TEXT`, timestamps as `TEXT ISO-8601`, booleans as `INTEGER 0/1`, JSON as `TEXT`
- Sessions: D1 `sessions` table (not KV) — KV eventual consistency unacceptable for auth
- Partial indexes supported in D1: `CREATE UNIQUE INDEX ... WHERE email IS NOT NULL`
- `PRAGMA foreign_keys = ON` must be set per migration (not global in D1)

---

## Session Continuity

Last session: 2026-07-10T20:51:00.000Z
Stopped at: Quick task 260710-rkt (multi-user admin) complete, verified, on branch `feat/multi-user-admin` — PR pending

---

*State initialized: 2026-03-23*  
*Last updated: 2026-07-10 — Quick task 260710-rkt: multi-user admin functionality (invite-based provisioning, Owner/Editor roles, admin management) planned, implemented, and verified on `feat/multi-user-admin`.*
