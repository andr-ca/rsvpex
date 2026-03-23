# Pitfalls Research

**Domain:** Cloudflare Workers + D1 + Queues — RSVP application
**Researched:** 2026-03-23
**Confidence:** HIGH (all pitfalls sourced from official Cloudflare documentation)

---

## Critical Pitfalls

### Pitfall 1: Capacity Race Condition via Non-Atomic Check-then-Insert

**What goes wrong:**
Two concurrent RSVPs arrive simultaneously. Both read `current_count < capacity`, both pass the capacity check, both insert — resulting in over-capacity. This is the concurrency race at the heart of any capacity-enforced booking system.

**Why it happens:**
D1 has no `SELECT ... FOR UPDATE`, no `SKIP LOCKED`, and no PostgreSQL advisory locks. Developers coming from Postgres assume they can lock rows or use advisory locks to serialize capacity checks. SQLite/D1 doesn't have these primitives at the row-selection level.

**How to avoid:**
Use D1's single-writer serialization guarantee: every write goes through a single Durable Object (the D1 primary). Wrap the entire check-and-insert in a single D1 transaction using `db.batch()`. Inside the batch:
1. Read current attendee count for the event with a `SELECT COUNT(*)`.
2. Conditionally insert only if count < capacity (use a subquery or application-level check within the batch).

Because D1 is backed by a single Durable Object and processes writes serially, a properly structured transaction prevents double-booking without external locks. Alternatively, use an `INSERT ... WHERE NOT EXISTS` or use a trigger-enforced constraint via a `CHECK` on a computed column.

A simpler, robust pattern:
```sql
-- In a batch transaction:
INSERT INTO rsvps (event_id, ..., status)
SELECT ?, ..., 'attending'
WHERE (SELECT COUNT(*) FROM rsvps WHERE event_id = ? AND status = 'attending') < (SELECT capacity FROM events WHERE id = ?)
```
If 0 rows are inserted (`meta.changes === 0`), capacity was hit — return 409/waitlist response.

**Warning signs:**
- Capacity checks that are separate `await` calls from the insert
- Using KV to track capacity (eventual consistency — never do this for counters)
- Any pattern like: `const count = await getCount(); if (count < cap) { await insertRSVP(); }`

**Phase to address:**
Phase implementing CAP-01 (Capacity enforcement). Must be in the schema/data-layer phase, not deferred to a later "hardening" phase. Write a test that fires 20 concurrent RSVPs against an event with capacity 1 — only 1 should be accepted.

---

### Pitfall 2: argon2id WASM Blows CPU Time Budget

**What goes wrong:**
argon2id password hashing requires a WASM binary (~500KB+ compiled). On first invocation (cold isolate), the WASM module must be instantiated, which costs significant CPU time on top of the actual hashing operation. argon2id with default parameters (m=65536, t=3, p=4) takes 200–500ms CPU time — far exceeding the 10ms free-tier limit and potentially the 30s paid default, and certainly violating the admin login p95 < 300ms goal.

**Why it happens:**
argon2id is designed to be deliberately slow (memory-hard). Workers CPU time is measured only during actual CPU execution — WASM instantiation CPU time counts. The WASM binary also adds to bundle size (Worker size limit: 10MB compressed, but WASM binaries add significantly).

**How to avoid:**
1. **Move hashing to a Queue consumer** rather than the HTTP handler: The HTTP handler sends `{password, userId}` to a queue; the queue consumer does the actual argon2id hash and writes to D1. Auth flow changes: on login, generate a plaintext token, queue the actual verification, return immediately. — BUT this doesn't work for login (synchronous auth required).

2. **For login (synchronous)**: Use the Cloudflare `workers-wasm-argon2` package or a purpose-built WASM argon2 for Workers. Reduce argon2id parameters aggressively for the Workers context: `m=19456` (19MB), `t=2`, `p=1` — these are the OWASP minimum parameters. Ensure the WASM module is instantiated at module-level (top-level `await WebAssembly.instantiate(...)`) so it's cached across requests within the same isolate.

3. **Alternative**: Use `bcrypt` (via WASM) with work factor 10 — smaller WASM, lower CPU cost, still adequate for a single-admin app. Or offload auth entirely to Cloudflare Access.

4. **Measure first**: Use `wrangler dev --cpu-ms` profiling or `wrangler deploy --dry-run` to check bundle size. Test cold start CPU time explicitly.

**Warning signs:**
- Worker bundle size > 3MB compressed (WASM-heavy)
- Error 1102 `Worker exceeded resource limits` on admin login in staging
- `startup_time_ms` > 800ms in wrangler deploy output
- WASM module being instantiated inside the request handler (not top-level)

**Phase to address:**
Phase implementing ADMIN-01 (admin login). Do not skip parameter tuning. Benchmark in `wrangler dev` with `--cpu-ms` before shipping. Add WASM bundle size check to CI (`wrangler deploy --dry-run 2>&1 | grep "gzip"`).

---

### Pitfall 3: Queue At-Least-Once Delivery Without Idempotency = Duplicate Emails

**What goes wrong:**
Cloudflare Queues guarantees **at-least-once** delivery, not exactly-once. If the consumer Worker fails after sending an email but before calling `msg.ack()`, the message is retried and the guest receives a duplicate confirmation email. Default retry count is 3. With a batch of 10 messages where the last fails, all 10 are redelivered.

**Why it happens:**
Developers treat queue delivery as "fire once." The default batch behavior retries the entire batch on any single failure unless individual `msg.ack()` calls are used.

**How to avoid:**
1. **Use `msg.ack()` per message** as soon as the email send call returns 2xx — don't wait for the batch to complete. If email send fails, call `msg.retry({ delaySeconds: 60 })` for backoff.
2. **Idempotency key in D1**: Before sending any email, write a row to `notification_log (event_id, rsvp_id, notification_type, sent_at)` with a `UNIQUE (rsvp_id, notification_type)` constraint. On duplicate, the `INSERT OR IGNORE` fails silently — skip the send. This prevents duplicate emails even if the message is redelivered.
3. **Configure a dead-letter queue** for messages that exhaust retries (max 100 retries per message). Without DLQ, failed messages are silently dropped.

**Warning signs:**
- Queue consumer that processes the entire batch before acknowledging any message
- No `notification_log` or similar deduplication table
- `batch.ackAll()` called at the end of a batch handler with no per-message acks

**Phase to address:**
Phase implementing NOTIF-01 (email confirmation). The idempotency table must be in the same migration as the notification feature. Test by artificially failing after email send and verifying no duplicate.

---

### Pitfall 4: KV for Session State — Stale Sessions Under Concurrent Writes

**What goes wrong:**
KV has eventual consistency: writes take up to 60 seconds to propagate globally. If admin session data (login state, CSRF tokens) is stored in KV, a logout in one edge location doesn't invalidate the session in another for up to 60 seconds. An attacker or concurrent tab could remain authenticated after a session revocation.

**Why it happens:**
KV looks like a simple key-value store and seems ideal for sessions. Developers miss the eventual consistency caveat in the docs.

**How to avoid:**
**Do not use KV for session tokens or auth state.** Use D1 for session storage (single-writer primary, serializable) or encode session state in signed JWT/HMAC cookies (no server-side lookup needed — revocation requires a blocklist in D1). For this project: HTTP-only SameSite=Lax signed cookies + a `sessions` table in D1 for revocation checks on privileged operations.

KV is appropriate for: read-heavy config values that change infrequently (e.g., event metadata cache), static asset pointers, feature flags.

**Warning signs:**
- `env.SESSION_KV.put(sessionId, ...)` in the login handler
- Session revocation that writes to KV and expects immediate global consistency
- Logout that only deletes the KV key (won't propagate immediately to all edges)

**Phase to address:**
Phase implementing ADMIN-01 (session management). Establish the session storage pattern on day one. It's almost impossible to safely migrate sessions mid-project.

---

### Pitfall 5: D1 `batch()` ≠ Atomic Transaction in the Traditional Sense

**What goes wrong:**
`db.batch([stmt1, stmt2, stmt3])` is described as "SQL transactions." But the semantics are: statements execute sequentially and commit individually. If `stmt2` fails, `stmt3` does not execute and an error is returned — but `stmt1` has already committed. It is **not** a rollback-capable ACID transaction.

**Why it happens:**
The word "transaction" in the D1 docs leads developers to assume batch = BEGIN/COMMIT with rollback. The actual guarantee is sequential non-concurrent execution, not atomicity with rollback.

**How to avoid:**
For operations that need true rollback semantics (e.g., insert RSVP + update capacity counter + create notification record — all or nothing), use `exec()` with explicit `BEGIN TRANSACTION ... COMMIT` / `ROLLBACK` SQL:
```sql
BEGIN TRANSACTION;
INSERT INTO rsvps ...;
UPDATE events SET attendee_count = attendee_count + ? WHERE id = ?;
INSERT INTO notification_queue ...;
COMMIT;
```
Pass this as a single multi-statement string to `db.exec()`. Note: `db.exec()` is less safe for parameterized queries; use it with caution and validate inputs before constructing the SQL string.

**Update (2026):** Verify current D1 docs — Cloudflare may have improved transaction semantics. Always test rollback behavior in your specific use case.

**Warning signs:**
- Multi-step operations (insert + update + audit log) using `db.batch()` with assumption of rollback on failure
- No error handling that checks `meta.changes === 0` after batch inserts

**Phase to address:**
Phase implementing CAP-01 and the core data model. Write an explicit test that verifies no partial writes occur when a mid-transaction statement fails.

---

### Pitfall 6: Worker Bundle Size Limit and WASM + Dependencies

**What goes wrong:**
Workers have a 10MB compressed bundle limit (gzip). argon2id WASM (~500KB), a React SSR bundle, charting libraries, and multiple NPM packages can easily exceed this. Deployment fails silently or with a cryptic error.

**Why it happens:**
Developers add npm packages without checking bundle output. Each `npm install` compounds the problem. Tree-shaking may not work for all packages.

**How to avoid:**
1. Run `wrangler deploy --dry-run --outdir .build-check` and check `gzip` size in output after every significant dependency addition.
2. Add a CI step: `wrangler deploy --dry-run 2>&1 | awk '/gzip/{print $NF}' | numfmt --from=iec | awk '{if($1 > 9000000) exit 1}'` (fail if > 9MB gzip).
3. Prefer lighter alternatives: use `ical-generator` (pure JS, ~15KB) instead of a heavy calendar library. Use `html-entities` instead of a full sanitization library.
4. Split functionality across multiple Workers using Service Bindings if needed.

**Warning signs:**
- `Total Upload: X KiB / gzip: Y MiB` with Y approaching 10 in wrangler output
- `Script upload failed` or `10021` error on deploy
- `startup_time_ms` > 800ms

**Phase to address:**
Phase 1 (project scaffold). Add the bundle-size check to CI before any other phase to catch issues early.

---

## Moderate Pitfalls

### Pitfall 7: D1 "Overloaded" Error Under Burst RSVP Traffic

**What goes wrong:**
D1 is backed by a single Durable Object and processes queries serially. At high submission burst (e.g., event announced, 200 concurrent RSVPs in 30 seconds), D1 queues requests. When the queue fills, it returns `D1 DB is overloaded. Too many requests queued.` — guests get 500 errors at event launch, the worst possible moment.

**Why it happens:**
Each write query takes ~5ms. At 200 req/s burst, D1 can handle ~200 writes/s if each takes ~1ms — but with argon2id or complex SELECTs, effective throughput drops. The queue has a finite size.

**How to avoid:**
1. Offload expensive operations from the hot path: do NOT do argon2id hashing during RSVP submission (no passwords needed for guest RSVP).
2. Keep RSVP write queries fast: the capacity check + insert + queue send should complete in <5ms total D1 CPU time.
3. Use `db.batch()` to combine the capacity check + insert into a single round-trip.
4. Rate limit aggressively (SEC-01: 5/min/IP) — this naturally caps burst.
5. Consider Cloudflare Turnstile as a natural backpressure mechanism.

**Prevention:**
Load test with k6 or autocannon: 50 concurrent RSVPs for 30 seconds. Verify no `D1_ERROR: overloaded` errors.

**Phase to address:**
Performance validation phase before launch. Also: keep RSVP write path simple from the start.

---

### Pitfall 8: Wrangler Binding Name Mismatch Between Environments

**What goes wrong:**
`wrangler.toml` defines `binding = "DB"` but code references `env.DATABASE` — Worker deploys but throws `Cannot read properties of undefined` at runtime. Or: binding names differ between production and preview environments, causing preview deploys to fail silently.

**Why it happens:**
Binding names in wrangler config and TypeScript code are both strings — no compile-time check enforces consistency. Renaming a binding in one place without updating the other breaks silently.

**How to avoid:**
1. Always run `wrangler types` after any wrangler config change — this regenerates `worker-configuration.d.ts` with typed `Env` interface, catching mismatches at TypeScript compile time.
2. Add `wrangler types --check` to CI.
3. Use a `wrangler.toml` linting step or just always deploy to a staging environment first.
4. Never use `vars` for secrets — use `wrangler secret put`. `vars` are visible in wrangler config in plaintext.

**Warning signs:**
- `TypeError: Cannot read properties of undefined (reading 'prepare')` in production logs
- `wrangler types` output not committed or not in CI

**Phase to address:**
Phase 1 (project scaffold). Establish `wrangler types` in CI immediately.

---

### Pitfall 9: Vitest Workers Pool Setup — Missing `wrangler.configPath` or Wrong `compatibility_date`

**What goes wrong:**
Tests run fine with Jest/standard Vitest but fail or give false passes when the Workers pool isn't configured correctly. Common failures:
- D1 binding not available in tests (`env.DB is undefined`)
- Miniflare runs with a different compatibility date than production, hiding bugs
- Tests import Workers runtime APIs (`cloudflare:test`) without the `@cloudflare/vitest-pool-workers` package

**Why it happens:**
`@cloudflare/vitest-pool-workers` requires Vitest 4.1+ (as of 2026). Many guides reference older `unstable_dev` patterns. The pool requires the wrangler config path to pick up D1 bindings, and it must match the production compatibility date.

**How to avoid:**
```typescript
// vitest.config.ts
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: "./wrangler.toml" }
  })]
});
```
Ensure `compatibility_date` in wrangler.toml matches production. Run `wrangler d1 migrations apply <db> --local` in `beforeAll` to apply schema to the test D1 instance. Use `preview_database_id` in wrangler config for the local test DB.

**Warning signs:**
- Tests passing locally but failing in CI (different wrangler version)
- `env.DB.prepare is not a function` in test output
- `compatibility_date` not set or set to a very old date

**Phase to address:**
Phase 1 (project scaffold). Get testing working before any feature work.

---

### Pitfall 10: D1 Local Dev vs Production SQL Compatibility

**What goes wrong:**
Local dev (`wrangler dev`) uses the same workerd/Miniflare runtime as production — the SQL engine is identical. However, Drizzle ORM migration files must use D1-compatible SQL. Specific issues:
- `PRAGMA foreign_keys = ON` must be set explicitly per transaction (PRAGMA in D1 only applies to the current transaction)
- Some SQLite features not in D1: no `ATTACH DATABASE`, no `user_version` PRAGMA (use `d1_migrations` table instead)
- JSON stored as TEXT in SQLite; D1's JSON functions (`json_extract`, `json_array_length`) work but JSON column type is actually just TEXT

**Why it happens:**
Developers test migrations against a local SQLite file (not via Miniflare), which may accept syntax D1 rejects. Or they use Drizzle's `sqlite:local` mode instead of D1 adapter.

**How to avoid:**
Always run migrations via `wrangler d1 migrations apply <db> --local` — never against a raw SQLite file. Use Drizzle's D1 adapter, not the `better-sqlite3` adapter. Verify `PRAGMA foreign_keys` is set in each migration that needs FK enforcement.

**Warning signs:**
- Drizzle config pointing to `sqlite:./local.db` instead of D1 binding
- Migrations that use `PRAGMA user_version` (not supported in D1)
- Tests that pass locally against a raw SQLite file but fail against D1

**Phase to address:**
Phase 1 (schema + migrations). Establish Drizzle + D1 adapter configuration on day one.

---

### Pitfall 11: D1 Read Replication Stale Reads After Write

**What goes wrong:**
When D1 read replication is enabled (opt-in), a Worker that writes an RSVP then immediately reads it back may get a stale result from a read replica that hasn't received the write yet. This breaks the "RSVP submitted → thank-you page shows your RSVP" flow.

**Why it happens:**
Read replication is opt-in but the Sessions API needed for sequential consistency requires explicit use of `withSession()`. Without it, all queries go to the primary — no stale reads, but no geographic read performance either. **If read replication is enabled later** and `withSession()` is not used, stale reads silently appear.

**How to avoid:**
If read replication is enabled: use `env.DB.withSession("first-primary")` for all request-scoped queries, passing the bookmark in response headers and reading it from request headers to maintain consistency across requests. If replication is NOT enabled, this is a non-issue — but design the Session API usage in from the start so enabling replication later doesn't break things.

For this project (single-admin, modest scale): **defer enabling read replication** until needed. Keep all queries on the primary. Document this decision.

**Warning signs:**
- `read_replication.mode: auto` in D1 settings without Sessions API usage
- `served_by_primary: false` in D1 result meta when you expect fresh data after a write

**Phase to address:**
Note in architecture docs. Not a day-one concern but flag for any future performance optimization phase.

---

### Pitfall 12: ICS File Generation — No `fs`, No `path`, Pure String Generation Required

**What goes wrong:**
NPM packages for ICS generation (like `ics`) may use Node.js `fs` or `path` internally. In Workers runtime, these are non-functional stubs unless `nodejs_compat` is enabled — and even then, filesystem writes don't exist.

**Why it happens:**
ICS packages designed for Node.js assume filesystem access for writing `.ics` files. Workers runtime has no persistent filesystem.

**How to avoid:**
Generate ICS content as a string in memory and return it as a `Response` with `Content-Type: text/calendar`. Use a pure-string ICS generator or build the RFC 5545 content manually — it's a simple text format:
```
BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20261215T190000Z
DTEND:20261215T220000Z
SUMMARY:Wedding Reception
END:VEVENT
END:VCALENDAR
```
The `ical-generator` package (pure JS) works in Workers if `nodejs_compat` is enabled. Test explicitly in `wrangler dev` before assuming an ICS package works.

**Warning signs:**
- ICS package that calls `fs.writeFile()` or `require('path')`
- ICS generation throwing `[unenv] fs.writeFile is not implemented yet!`

**Phase to address:**
Phase implementing PUB-09 (thank-you page with ICS download).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `db.exec()` for migrations | Simpler migration code | SQL injection risk; no parameterization; hard to test | Only in Wrangler migration files, never in request handlers |
| Hardcoding binding names as strings | Faster setup | Breaks silently when binding renamed; no type safety | Never — always run `wrangler types` |
| Skipping idempotency keys in Queue consumer | Simpler code | Duplicate emails on any consumer retry | Never acceptable for external notifications |
| KV for rate limit counters | Simple API | Eventual consistency — counter can be bypassed at edges | Acceptable for soft limits; unacceptable for hard security limits |
| Skipping argon2id parameter tuning | Simpler | CPU timeout on admin login in production | Never — benchmark in `wrangler dev` before shipping |
| Top-level `await` in Worker startup for WASM init | Cached WASM across requests | Adds to startup time (1s limit) — test carefully | Acceptable if startup time stays < 800ms after WASM init |
| Single batch for all RSVP operations | Fewer roundtrips | Assumes batch = transaction with rollback — it isn't | Use explicit `BEGIN/COMMIT` for true atomic multi-table writes |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Cloudflare Queues | Using `waitUntil()` to send queue message — errors are silently ignored | Use `await env.QUEUE.send(msg)` directly; handle errors explicitly |
| D1 + Drizzle | Using Drizzle `sqlite:local` mode for tests | Use Drizzle D1 adapter; apply migrations via `wrangler d1 migrations apply --local` |
| Cloudflare Queues | Not configuring a DLQ | Messages that exhaust retries are silently dropped; add dead-letter queue binding |
| Resend/Postmark email | Sending email in HTTP handler (blocks response) | Send via Queue consumer; acknowledge HTTP request immediately |
| Cloudflare Turnstile | Validating Turnstile token on client only | Always validate server-side via `https://challenges.cloudflare.com/turnstile/v0/siteverify` |
| Wrangler secrets | Putting secrets in `wrangler.toml` `[vars]` | Use `wrangler secret put SECRET_NAME`; use `.dev.vars` for local dev |
| D1 migrations | Running `wrangler d1 execute` against production directly | Use `wrangler d1 migrations apply` with version-controlled migration files |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 D1 queries per RSVP list render | Admin dashboard slow at 100+ RSVPs | Use D1 `batch()` or JOIN queries; never query inside a loop | 50+ RSVPs |
| Fetching all RSVPs to compute count | Memory limit hit; slow responses | Use `SELECT COUNT(*)` — never `SELECT *` to count | 1,000+ RSVPs |
| WASM argon2id instantiated per-request | Every admin login >200ms CPU | Instantiate WASM at top-level (module scope) | Every cold request |
| Unbounded `SELECT *` on RSVPs table for CSV export | 128MB memory limit exceeded; response timeout | Stream export in pages; use cursor pagination; write to R2 first | 10,000+ RSVPs |
| Large audit log `SELECT *` without date bounds | Query timeout (30s D1 limit) | Always filter audit log queries by date range; add index on `created_at` | 365 days × busy event |
| Missing index on `(event_id, status)` | RSVP count/capacity check does full table scan | Add composite index on all join/filter columns; run `PRAGMA optimize` after schema change | 5,000+ total RSVPs |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing `rid` RSVP token as plaintext in URL logs | Token reuse by attacker with log access | Hash token in D1, compare hash; or use short-lived signed tokens |
| CSRF protection missing on RSVP edit (PATCH) | Attacker forges RSVP edit from victim's browser | Double-submit cookie pattern + Origin header check on all mutating endpoints |
| Rate limiting in KV (eventual consistency) | Burst attacks bypass soft limit at multiple edges | Use D1 rate limit table with serialized writes, or Cloudflare's native rate limiting rules |
| `env.SECRET_KEY` in `wrangler.toml` `[vars]` section | Secret visible in git history and dashboard | Use `wrangler secret put`; `.dev.vars` for local only |
| Admin session token in `localStorage` | XSS steals token permanently | HTTP-only SameSite=Lax cookie only; never `localStorage` for auth tokens |
| Missing `Content-Security-Policy` in Worker response | XSS escalation risk on admin dashboard | Add CSP header in Worker response; restrict `script-src` to `'self'` |
| Guest PII in Cloudflare logs (wrangler tail) | Compliance risk (GDPR) | Sanitize `console.log` output; never log email/phone/dietary data |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No optimistic UI on RSVP submit | Guest double-submits (slow edge, impatient user) | Disable submit button immediately on click; show spinner |
| ICS download requires JavaScript | Guests on low-JS browsers can't add to calendar | Generate ICS as a static URL (`/rsvp/:slug/calendar.ics`) served directly |
| Capacity "full" shown after submit (not before) | Guest fills long form then hits a wall | Show capacity/waitlist status before the form; re-check at submit time |
| Edit flow token in URL shared in screenshots | Other guests see edit link | Warn user on edit page: "This link is private — do not share" |

---

## "Looks Done But Isn't" Checklist

- [ ] **Capacity enforcement:** Often missing the `meta.changes === 0` check after conditional insert — verify with concurrent load test (20 simultaneous POSTs against capacity-1 event)
- [ ] **Queue idempotency:** Often missing the `notification_log` dedup table — verify by replaying a queue message manually and confirming no duplicate email
- [ ] **argon2id WASM:** Often CPU-optimized parameters not tested in production environment — verify with `wrangler dev` CPU profiling on a cold isolate
- [ ] **Session invalidation:** Often the admin logout only deletes the cookie client-side — verify the session row in D1 is marked invalid and checked on subsequent requests
- [ ] **Binding type safety:** Often `wrangler types` output not regenerated after adding new bindings — verify by running `wrangler types` and confirming no TypeScript errors
- [ ] **D1 migration applied to production:** Often only applied locally — verify with `wrangler d1 migrations list --remote` showing no pending migrations
- [ ] **Queue DLQ configured:** Often the queue consumer has no dead-letter queue — verify in wrangler config that `dead_letter_queue` binding is set
- [ ] **CSRF token on RSVP edit:** Form has a submit button but no CSRF double-submit check — verify OPTIONS/PATCH requests are rejected without valid Origin + CSRF token
- [ ] **ICS generation tested in Workers runtime:** Works in Node.js tests but uses `fs` internally — verify ICS response is generated in `wrangler dev` before shipping

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Over-capacity due to race condition | HIGH | Audit all RSVPs over capacity; manually update status to 'waitlist'; contact affected guests; patch the atomic transaction and redeploy |
| Duplicate confirmation emails sent | MEDIUM | Send apology email; add idempotency table in next deploy; identify affected RSVPs via notification_log gaps |
| argon2id CPU timeout in production | HIGH | Emergency hotfix: reduce argon2id parameters or switch to bcrypt; existing password hashes need re-hash on next login |
| KV sessions not invalidating on logout | HIGH | Force-rotate all session signing keys (invalidates all sessions globally); redeploy with D1-backed sessions |
| D1 migration applied only locally | MEDIUM | Run `wrangler d1 migrations apply --remote` immediately; verify data integrity; if migration was destructive, restore from Time Travel (7-30 days) |
| Worker exceeds 10MB bundle limit | LOW | Remove heavy dependencies; split into multiple Workers with Service Bindings; immediate deployment blocker |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Capacity race condition | Phase: Core data model + capacity enforcement (CAP-01) | Concurrent load test: 20 simultaneous RSVPs, capacity=1, assert only 1 succeeds |
| argon2id CPU timeout | Phase: Admin authentication (ADMIN-01) | `wrangler dev` CPU profiling on cold isolate; bundle size CI check |
| Queue at-least-once duplicates | Phase: Notification system (NOTIF-01) | Replay queue message 3x, assert only 1 email sent |
| KV for session state | Phase: Session management (ADMIN-01) | Architecture review before any session code is written |
| `batch()` not rollback-safe | Phase: Core data model | Test: mid-batch failure leaves no partial writes |
| Worker bundle size | Phase: Project scaffold (Phase 1) | CI check: `wrangler deploy --dry-run` gzip size < 9MB |
| Wrangler binding name mismatch | Phase: Project scaffold (Phase 1) | `wrangler types` in CI; TypeScript strict mode |
| Vitest Workers pool misconfiguration | Phase: Project scaffold (Phase 1) | Run test suite with D1 binding in CI |
| D1 local vs production SQL | Phase: Schema + migrations | All migration tests run via `wrangler d1 migrations apply --local` |
| ICS file generation | Phase: Thank-you page (PUB-09) | Integration test for ICS endpoint in `wrangler dev` |
| D1 overload under burst | Phase: Pre-launch performance validation | k6 load test: 50 concurrent RSVPs for 30s, 0 overload errors |
| Stale reads with read replication | Phase: Performance optimization (post-launch) | Defer — don't enable read replication until Sessions API is implemented |

---

## Sources

- Cloudflare D1 Limits: https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare Workers Limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Queues Limits: https://developers.cloudflare.com/queues/platform/limits/
- Cloudflare Queues Batching & Retries: https://developers.cloudflare.com/queues/configuration/batching-retries/
- Cloudflare Queues How It Works: https://developers.cloudflare.com/queues/reference/how-queues-works/
- Cloudflare KV Consistency Model: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- D1 Debug & Error List: https://developers.cloudflare.com/d1/observability/debug-d1/
- D1 Best Practices (local dev): https://developers.cloudflare.com/d1/best-practices/local-development/
- D1 Retry Queries: https://developers.cloudflare.com/d1/best-practices/retry-queries/
- D1 Read Replication: https://developers.cloudflare.com/d1/best-practices/read-replication/
- D1 Worker API (batch/exec): https://developers.cloudflare.com/d1/worker-api/d1-database/
- D1 Migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Workers WebAssembly: https://developers.cloudflare.com/workers/runtime-apis/webassembly/
- Workers Node.js Compatibility: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- Workers Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Workers Vitest Integration: https://developers.cloudflare.com/workers/testing/vitest-integration/
- Workers Vitest First Test: https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/

---
*Pitfalls research for: Cloudflare Workers + D1 + Queues RSVP application*
*Researched: 2026-03-23*
