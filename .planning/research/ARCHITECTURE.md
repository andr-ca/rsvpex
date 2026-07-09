# Architecture Research

**Domain:** Full-stack RSVP application on Cloudflare Workers + D1 + Queues + Pages
**Researched:** 2026-03-23
**Confidence:** HIGH (all claims verified against official Cloudflare docs, Hono docs)

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          EDGE (Cloudflare Network)                    │
│                                                                       │
│  ┌─────────────────────────────┐   ┌──────────────────────────────┐  │
│  │   CF PAGES (static assets)  │   │   API WORKER (Hono router)   │  │
│  │                             │   │                              │  │
│  │  /rsvp/[slug] (SSR or SPA)  │──▶│  POST /rsvp/submit           │  │
│  │  /rsvp/admin/* (SPA shell)  │   │  GET  /rsvp/:slug            │  │
│  │  /rsvp/thank-you            │   │  PATCH /rsvp/:id             │  │
│  │                             │   │  /rsvp/admin/* (API)         │  │
│  │  [Queue producer binding]   │   │  /rsvp/healthz               │  │
│  └────────────┬────────────────┘   └──────────┬───────────────────┘  │
│               │ (service binding or fetch)     │                      │
│               └───────────────┬───────────────┘                      │
│                               ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    D1 DATABASE (SQLite)                         │  │
│  │  admin_users · events · rsvps · audit_logs                     │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────┐  ┌────────────────────────────────┐    │
│  │  KV NAMESPACE (sessions) │  │  CLOUDFLARE QUEUES             │    │
│  │  session:{token} → data  │  │  rsvpex-notifications          │    │
│  │  TTL: 8h / 30d remember  │  │  rsvpex-audit                  │    │
│  └──────────────────────────┘  └──────────┬───────────────────┘     │
│                                            ▼                          │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │           CONSUMER WORKER (queue handler)                        │ │
│  │  Email via Resend/Postmark · SMS via Twilio · Audit log writes   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │        CRON WORKER (scheduled handler, same or separate Worker) │ │
│  │  Daily at 06:00 UTC: send reminders · purge expired audit rows  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌──────────────────────────────────────────────┐                    │
│  │  CF ACCESS (Zero Trust) — /rsvp/admin/*      │                    │
│  │  Identity check before request reaches Worker│                    │
│  └──────────────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────────────┘

External services (outbound HTTP from Workers):
  Resend / Postmark  →  email delivery
  Twilio             →  SMS delivery
```

### Component Responsibilities

| Component | Responsibility | Key Constraints |
|-----------|---------------|-----------------|
| **CF Pages** | Serves static assets (HTML/CSS/JS bundles, public RSVP form SPA shell) | Pages Functions can produce to Queues but cannot consume them |
| **API Worker** (Hono) | All HTTP API logic: RSVP submit, admin CRUD, capacity checks, auth sessions | CPU 30s wall, 128MB RAM; no filesystem; fetch-only I/O |
| **Consumer Worker** | Async: email/SMS dispatch, audit log persistence via Queue batch handler | 15 min wall time per batch invocation |
| **Cron Worker** | Scheduled: reminder emails, audit log purge, capacity threshold rechecks | 30s CPU for <1h interval; 15min CPU for ≥1h interval |
| **D1 (SQLite)** | Primary relational store: all RSVP data, events, users, audit log | No advisory locks; no `pg_` functions; no `SKIP LOCKED`; no `int[]` arrays |
| **KV** | Session storage: opaque token → JSON session blob with TTL | Eventually consistent (30s min TTL); 1 write/sec per key; fast global reads |
| **Cloudflare Queues** | Async job bus: decouple submission from notification delivery | Push consumer (Worker); at-least-once delivery; batching; DLQ support |
| **CF Access** | Network-level identity gate on `/rsvp/admin/*` | Blocks unauthenticated HTTP before Worker sees the request |

---

## Recommended Project Structure

```
rsvpex/                              ← monorepo root
├── pnpm-workspace.yaml              ← pnpm workspaces declaration
├── package.json                     ← root devDeps: turbo, wrangler, typescript
├── turbo.json                       ← build pipeline (optional, useful for CI)
├── .env.sample                      ← all secrets documented, no values
├── .dev.vars                        ← local secrets (gitignored)
│
├── apps/
│   ├── web/                         ← Cloudflare Pages (static assets + SPA)
│   │   ├── wrangler.jsonc           ← Pages project config (bindings: QUEUE producer)
│   │   ├── public/                  ← static HTML/CSS/JS output
│   │   └── src/
│   │       ├── components/          ← React components (public form, admin UI)
│   │       ├── pages/               ← route pages
│   │       └── functions/           ← Pages Functions (thin proxy → API Worker)
│   │           └── rsvp/
│   │               └── [[path]].ts  ← catch-all to forward to API Worker via service binding
│   │
│   └── worker/                      ← Cloudflare Workers (API + Consumer + Cron)
│       ├── wrangler.jsonc           ← Worker config: D1, KV, Queues producer+consumer, Cron
│       ├── src/
│       │   ├── index.ts             ← entrypoint: exports { fetch, queue, scheduled }
│       │   ├── app.ts               ← Hono app instance with all routes mounted
│       │   ├── routes/
│       │   │   ├── rsvp.ts          ← public RSVP routes (GET/:slug, POST, PATCH)
│       │   │   ├── admin/
│       │   │   │   ├── auth.ts      ← login, logout, password-reset
│       │   │   │   ├── events.ts    ← event CRUD
│       │   │   │   ├── rsvps.ts     ← RSVP list, filters, promote waitlist
│       │   │   │   └── exports.ts   ← CSV/JSON export, CSV import
│       │   │   └── health.ts        ← /rsvp/healthz
│       │   ├── handlers/
│       │   │   ├── queue.ts         ← queue() handler: routes by queue name
│       │   │   └── cron.ts          ← scheduled() handler: reminder + purge jobs
│       │   ├── domain/              ← pure business logic (no CF bindings)
│       │   │   ├── capacity.ts      ← capacity check + waitlist placement (critical)
│       │   │   ├── tokens.ts        ← rsvp_token + session token generation (critical)
│       │   │   ├── duplicates.ts    ← exact + heuristic duplicate detection (critical)
│       │   │   ├── notifications.ts ← email/SMS payload builders
│       │   │   └── i18n.ts          ← locale string lookup
│       │   ├── db/
│       │   │   ├── schema.ts        ← Drizzle schema (D1-compatible SQLite DDL)
│       │   │   └── queries/         ← named query functions per table
│       │   ├── middleware/
│       │   │   ├── auth.ts          ← session validation, CF Access header verification
│       │   │   ├── ratelimit.ts     ← 5/min/IP with KV counters (or CF rate limit header)
│       │   │   └── turnstile.ts     ← Cloudflare Turnstile CAPTCHA validation
│       │   └── lib/
│       │       ├── kv-session.ts    ← KV session store adapter
│       │       ├── queue-producer.ts← typed queue send helpers
│       │       └── crypto.ts        ← argon2id (WASM), token helpers
│       └── migrations/              ← Drizzle migration SQL files (D1-compatible)
│           ├── 0001_init.sql
│           └── ...
│
├── packages/
│   └── shared/                      ← shared TypeScript types (RSVP, Event, etc.)
│       ├── package.json
│       └── src/
│           └── types.ts
│
└── static-site/                     ← existing landing page (vanilla HTML/CSS/JS)
    └── ...
```

### Structure Rationale

- **Single Worker (`apps/worker`) with multiple exports:** The Cloudflare Workers module format supports exporting `fetch`, `queue`, and `scheduled` from the same entrypoint (`index.ts`). This means one `wrangler.jsonc` binds D1, KV, Queues, and Cron in one place. One Worker = simpler deployment, unified logging, shared code.
- **`domain/` folder without CF bindings:** Pure functions for capacity math, token generation, duplicate detection. Testable with Vitest without Miniflare. This is where the 100%-coverage critical modules live.
- **Migrations in `apps/worker/migrations/`:** Drizzle generates migration SQL files that `wrangler d1 migrations apply` understands via `migrations_dir` in `wrangler.jsonc`.
- **`packages/shared/`:** Avoids duplicating RSVP/Event type definitions between `web/` and `worker/`. Both packages reference `@rsvpex/shared`.
- **Pages Functions as thin proxy (optional):** If the public RSVP form is SSR, the Pages Function forwards to the API Worker via service binding. If SPA, Pages just serves static assets and the SPA calls the Worker directly.

---

## Architectural Patterns

### Pattern 1: Single Worker with Hono Router (vs. Multiple Workers)

**What:** One Worker exports `fetch` (HTTP), `queue` (consumer), and `scheduled` (cron). Hono handles URL routing internally.

**When to use:** Always, for this scale. The RSVP app has low Worker count pressure (well under the 500 Worker limit on paid plan). One Worker means one binding surface, one wrangler.jsonc, one deploy step.

**Trade-offs:**
- ✅ Single deployment unit; all bindings in one place
- ✅ No service-binding round-trips between Workers (zero extra latency)
- ✅ Shared `domain/` code without packages
- ✅ One set of logs/metrics to monitor
- ❌ If Worker bundle grows >3MB (free) or >10MB (paid), must split — unlikely for this app
- ❌ Cron and Queue consumer share CPU budget with HTTP handler

**Example:**
```typescript
// apps/worker/src/index.ts
import app from './app'
import { handleQueue } from './handlers/queue'
import { handleScheduled } from './handlers/cron'

export default {
  fetch: app.fetch,
  queue: handleQueue,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>
```

### Pattern 2: D1 Transactions for Capacity Enforcement (No Advisory Locks)

**What:** Use D1's implicit serializable writes within a transaction to implement the read-check-write capacity pattern. SQLite's per-database write serialization provides the required isolation.

**When to use:** Every RSVP submission and waitlist promotion that modifies the attending guest count.

**Trade-offs:**
- ✅ D1 SQLite is single-writer serialized: no two transactions can write simultaneously to the same database
- ✅ No advisory locks needed (PostgreSQL advisory locks don't exist in SQLite anyway)
- ❌ High concurrency RSVP bursts will queue at the D1 write serialization point — acceptable for event RSVP scale
- ❌ Cannot set `lock_timeout` like PostgreSQL — handle D1 write timeouts with Worker retry logic

**Example:**
```typescript
// domain/capacity.ts
export async function submitRsvpWithCapacityCheck(
  db: D1Database,
  eventId: string,
  rsvpData: RsvpInsert
): Promise<{ status: 'attending' | 'waitlist'; rsvpId: string }> {
  // D1 batch executes as a single atomic transaction
  const results = await db.batch([
    db.prepare(`
      SELECT max_guests_total, enable_waitlist,
             (SELECT COALESCE(SUM(party_total),0) FROM rsvps
              WHERE event_id = ? AND status = 'attending') AS current_total
      FROM events WHERE id = ? AND status = 'published'
    `).bind(eventId, eventId),
  ])

  const event = results[0].results[0] as EventCapacityRow
  if (!event) throw new NotFoundError('Event not found or not published')

  const wouldExceed =
    event.max_guests_total !== null &&
    event.current_total + rsvpData.party_total > event.max_guests_total

  const status = wouldExceed
    ? event.enable_waitlist ? 'waitlist' : (() => { throw new CapacityError() })()
    : 'attending'

  // Insert RSVP in same batch atomically
  const insertResult = await db.prepare(`
    INSERT INTO rsvps (event_id, name, email, phone, adults, children_count,
      children_ages, dietary, notes, answers, status, party_total, rsvp_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, lower(hex(randomblob(16))))
    RETURNING id
  `).bind(eventId, rsvpData.name, /* ... */, status, rsvpData.partyTotal).run()

  return { status, rsvpId: insertResult.results[0].id }
}
```

### Pattern 3: KV Sessions (Preferred Over D1 for Sessions)

**What:** Admin sessions stored in KV as `session:{random-token}` → JSON blob with TTL.

**When to use:** Always for session storage. KV is purpose-built for this pattern.

**Rationale vs D1 sessions:**
| | KV | D1 |
|---|---|---|
| Read latency | ~1ms (edge cache hit) | ~10-30ms (regional D1 read) |
| Write latency | ~20ms | ~10-30ms |
| TTL eviction | Native TTL field | Requires cron purge job |
| Consistency | Eventually consistent (30s stale possible) | Strong consistency |
| Session writes/sec | 1 write/sec per KEY (not namespace) | No explicit limit |
| Best for | Short-lived, read-heavy sessions | Transactional session data |

**Decision: Use KV.** Session reads far outnumber writes. Stale 30s reads are acceptable for admin sessions (the session won't change mid-request). TTL eviction avoids a separate purge job. The 1 write/sec-per-key limit is not a concern — each session token is a different key.

**Example:**
```typescript
// lib/kv-session.ts
const SESSION_TTL = 8 * 60 * 60   // 8 hours (regular)
const REMEMBER_TTL = 30 * 24 * 60 * 60  // 30 days

export async function createSession(
  kv: KVNamespace,
  userId: string,
  remember: boolean
): Promise<string> {
  const token = crypto.randomUUID()
  const ttl = remember ? REMEMBER_TTL : SESSION_TTL
  await kv.put(`session:${token}`,
    JSON.stringify({ userId, createdAt: Date.now() }),
    { expirationTtl: ttl }
  )
  return token
}

export async function getSession(kv: KVNamespace, token: string) {
  const raw = await kv.get(`session:${token}`)
  return raw ? JSON.parse(raw) : null
}
```

### Pattern 4: Queue Architecture — Two Queues, One Consumer

**What:** Use two queues (`rsvpex-notifications`, `rsvpex-audit`) both consumed by the same Worker via `batch.queue` switch. The consumer Worker is the same as the API Worker (exported `queue` handler).

**Queue routing:**
```
API Worker (producer)
  ├── RSVP submit success → rsvpex-notifications queue
  │     payload: { type: 'guest_confirmation', rsvpId, eventId, email, locale }
  │     payload: { type: 'admin_new_rsvp', eventId, rsvpId }
  │     payload: { type: 'capacity_threshold', eventId, threshold: 80|100 }
  ├── Admin actions   → rsvpex-audit queue
  │     payload: { actorId, entityType, entityId, action, diff }
  └── Cron (reminders) → rsvpex-notifications queue (from scheduled handler)
        payload: { type: 'reminder', rsvpId, eventId, email }

Consumer Worker (queue handler — same Worker)
  switch(batch.queue):
    case 'rsvpex-notifications': dispatch email/SMS via HTTP
    case 'rsvpex-audit':         write to audit_logs D1 table
```

**Why separate audit queue from notifications?**
- Different failure semantics: a failed email should not block an audit write
- Different DLQ behavior: audit failures need strict DLQ; notification failures can be dropped after N retries
- Different `max_retries` config: audit = 5 retries; notifications = 3 retries

**Wrangler config:**
```jsonc
{
  "queues": {
    "producers": [
      { "binding": "NOTIFICATIONS_QUEUE", "queue": "rsvpex-notifications" },
      { "binding": "AUDIT_QUEUE",         "queue": "rsvpex-audit" }
    ],
    "consumers": [
      {
        "queue": "rsvpex-notifications",
        "max_batch_size": 10,
        "max_batch_timeout": 30,
        "max_retries": 3,
        "dead_letter_queue": "rsvpex-notifications-dlq"
      },
      {
        "queue": "rsvpex-audit",
        "max_batch_size": 50,
        "max_batch_timeout": 10,
        "max_retries": 5,
        "dead_letter_queue": "rsvpex-audit-dlq"
      }
    ]
  }
}
```

### Pattern 5: Cron Trigger for Reminder Jobs

**What:** Single cron at `0 6 * * *` (06:00 UTC daily) runs the `scheduled` handler, queries events with `reminder_days_before` matching `(start_at - now) / 86400 ≈ N`, and enqueues reminder messages.

**Scheduling:**
```jsonc
{
  "triggers": {
    "crons": ["0 6 * * *"]
  }
}
```

**Handler structure:**
```typescript
// handlers/cron.ts
export async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  // 1. Query events where reminder should fire today
  const eventsToRemind = await env.DB.prepare(`
    SELECT e.id, e.reminder_days_before, e.start_at
    FROM events e
    WHERE e.status = 'published'
      AND e.notify_via_email = 1
      AND e.reminder_days_before IS NOT NULL
      AND date(e.start_at, '-' || e.reminder_days_before || ' days') = date('now')
  `).all()

  // 2. For each event, queue reminder messages for attending RSVPs
  for (const event of eventsToRemind.results) {
    const rsvps = await env.DB.prepare(`
      SELECT id, email, phone FROM rsvps
      WHERE event_id = ? AND status = 'attending' AND email IS NOT NULL
    `).bind(event.id).all()

    const messages = rsvps.results.map(r => ({
      body: { type: 'reminder', rsvpId: r.id, eventId: event.id, email: r.email }
    }))
    if (messages.length > 0) {
      await env.NOTIFICATIONS_QUEUE.sendBatch(messages)
    }
  }

  // 3. Purge audit_logs older than 365 days
  await env.DB.prepare(`
    DELETE FROM audit_logs WHERE created_at < datetime('now', '-365 days')
  `).run()
}
```

### Pattern 6: Admin Auth — CF Access + App Session Combination

**What:** Two-layer auth:
1. **CF Access** (network layer): protects `rsvp.example.com/rsvp/admin/*`. Blocks unauthenticated requests before the Worker is invoked. CF Access adds `Cf-Access-Authenticated-User-Email` and `Cf-Access-Jwt-Assertion` headers.
2. **App-level session** (application layer): after CF Access, the Worker validates email/password with argon2id, issues a KV session token in an HTTP-only SameSite=Lax cookie.

**Why both layers?**
- CF Access alone doesn't provide password-based login (it requires an identity provider configured)
- App sessions alone leave the admin URL path publicly reachable (DDoS surface)
- Combined: CF Access is the door, app session is the lock inside

**CF Access integration:**
```typescript
// middleware/auth.ts
export async function requireAdminSession(c: Context<{ Bindings: Env }>, next: Next) {
  // Optional: verify CF Access JWT header if stricter validation needed
  // const cfJwt = c.req.header('Cf-Access-Jwt-Assertion')

  const sessionToken = getCookie(c, 'session')
  if (!sessionToken) return c.redirect('/rsvp/admin/login')

  const session = await getSession(c.env.SESSION_KV, sessionToken)
  if (!session) return c.redirect('/rsvp/admin/login')

  const user = await c.env.DB.prepare(
    'SELECT id, email, role, is_active, locked_until FROM admin_users WHERE id = ?'
  ).bind(session.userId).first<AdminUser>()

  if (!user || !user.is_active) return c.redirect('/rsvp/admin/login')
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return c.json({ error: 'Account locked' }, 423)
  }

  c.set('admin', user)
  return next()
}
```

---

## D1 Schema: PostgreSQL v5.3 → SQLite/D1 Translation

This is the critical translation table for the existing schema.

### Type Changes

| PostgreSQL Type | D1/SQLite Type | Notes |
|----------------|---------------|-------|
| `uuid` | `TEXT` | Use `lower(hex(randomblob(16)))` or app-level `crypto.randomUUID()` |
| `timestamptz` | `TEXT` (ISO-8601) | Store as `datetime('now')` in UTC; no timezone support in SQLite |
| `boolean` | `INTEGER` (0/1) | Drizzle maps this automatically |
| `jsonb` | `TEXT` (JSON) | Use `json_extract()` for querying; validate shape in app code |
| `citext` | `TEXT` + `lower()` | Use `lower(email)` in indexes and queries |
| `int[]` (children_ages) | `TEXT` (JSON array) | Store as `'[8,12]'`; validate in app with `JSON.parse()` |
| `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | `TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16))))` | Or set in app code before insert |

### Feature Changes

| PostgreSQL Feature | D1/SQLite Equivalent | Notes |
|-------------------|---------------------|-------|
| `GENERATED ALWAYS AS ... STORED` | **Supported in D1** (confirmed) | `party_total` column can stay as generated |
| `pg_advisory_xact_lock` | **App-level serialization via D1 write serialization** | SQLite is single-writer; transactions provide the required isolation |
| `CHECK (jsonb_typeof(x) = 'array')` | Remove; validate in app | D1 has no `jsonb_typeof`; use JSON extension but no structural CHECK |
| `CHECK (jsonb_array_length(dietary) <= 10)` | Remove; validate in app | Cannot use JSON functions in CHECK constraints |
| `UNIQUE INDEX ... WHERE email IS NOT NULL` | `CREATE UNIQUE INDEX ... WHERE email IS NOT NULL` | **Partial indexes supported in D1** |
| `CREATE EXTENSION IF NOT EXISTS ...` | **Remove** (no extensions in D1) | Extensions (pgcrypto, citext, pg_trgm) do not exist |
| `lower(email)` functional index | `CREATE INDEX ON table(lower(email))` | Functional indexes supported in SQLite/D1 |
| `GIN index on jsonb` | Not available | Filter dietary restrictions in app or with `json_each()` |
| `BEFORE UPDATE TRIGGER` | **Supported in SQLite** | `set_updated_at` trigger works in D1 |
| `CONSTRAINT ... CHECK (...)` | Mostly supported | Multi-row CHECK constraints not supported; move to app validation |

### D1-Compatible Schema Highlights

```sql
-- Generated column IS supported in D1
party_total INTEGER GENERATED ALWAYS AS (
  adults + parents_count + siblings_count + children_count
) STORED,

-- Partial unique index (supported)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_rsvps_event_email
  ON rsvps(event_id, lower(email))
  WHERE email IS NOT NULL;

-- JSON stored as TEXT, queried with json_extract
dietary TEXT NOT NULL DEFAULT '[]',   -- validate <= 10 items in app

-- Timestamp as TEXT ISO-8601
created_at TEXT NOT NULL DEFAULT (datetime('now')),
updated_at TEXT NOT NULL DEFAULT (datetime('now')),

-- UUID as TEXT
id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

-- BEFORE UPDATE trigger for updated_at (valid SQLite syntax)
CREATE TRIGGER trg_events_updated_at
BEFORE UPDATE ON events
FOR EACH ROW BEGIN
  UPDATE events SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

### What Must Move to Application Code

| Constraint | App location | Requirement |
|-----------|-------------|-------------|
| `jsonb_array_length(dietary) <= 10` | RSVP submit handler | CAP-05 |
| `jsonb_typeof(x) = 'array'` | Zod/Valibot schema validation | Input validation |
| `children_count = array_length(children_ages)` | Domain validation | CAP-05 |
| `rsvp_children_ages_valid()` (ages 0-17) | Domain validation | PUB-03 |
| Capacity check before INSERT | `domain/capacity.ts` (critical module) | CAP-01 |
| Duplicate check (email/phone per event) | `domain/duplicates.ts` (critical module) | CAP-03 |
| Heuristic duplicate (name+contact in 10min) | `domain/duplicates.ts` (critical module) | CAP-04 |
| argon2id password hashing | `lib/crypto.ts` (WASM bundle) | ADMIN-01 |

---

## Data Flow

### RSVP Submission Flow (Happy Path)

```
Guest Browser
    │
    ▼ POST /rsvp/submit (with Turnstile token)
CF Access (allows public route, no auth gate)
    │
    ▼
API Worker (Hono)
    │
    ├─ middleware/ratelimit.ts: check KV counter (5/min/IP)
    ├─ middleware/turnstile.ts: verify CAPTCHA token via CF API
    ├─ routes/rsvp.ts: parse + validate body (Zod)
    │
    ├─ domain/duplicates.ts: query D1 for existing (event, email/phone)
    │     └─ if duplicate → 409 Conflict
    │
    ├─ domain/capacity.ts: D1 transaction
    │     SELECT event + current attending sum (atomic read)
    │     INSERT rsvp with computed status (attending | waitlist)
    │     └─ if at capacity, no waitlist → 409 Capacity
    │
    ├─ NOTIFICATIONS_QUEUE.send({ type: 'guest_confirmation', ... })
    │     (ctx.waitUntil — non-blocking)
    ├─ NOTIFICATIONS_QUEUE.send({ type: 'admin_new_rsvp', ... })
    │     (ctx.waitUntil — non-blocking)
    │
    └─ Response 201 { rsvpId, status, rsvpToken }
         │
         ▼
Guest Browser → redirects to /rsvp/thank-you?rid={token}

[Async, ~100ms later]
Consumer Worker
    ├─ Resend/Postmark HTTP API → guest confirmation email
    └─ Resend/Postmark HTTP API → admin new RSVP email
```

### Admin RSVP Management Flow

```
Admin Browser
    │
    ▼ GET /rsvp/admin/events/:id/rsvps
CF Access (intercepts, checks JWT → email in Access policy)
    │
    ▼
API Worker
    │
    ├─ middleware/auth.ts: validate KV session cookie
    │
    ├─ D1 query: SELECT rsvps with filters + pagination
    │
    └─ Response 200 { rsvps: [...], total, page }
```

### Capacity Threshold Notification Flow

```
RSVP submit
    │
    └─ After successful INSERT:
         Compute new_total / max_guests_total ratio
         If ratio crosses 80% or 100% AND not yet notified (D1 check):
           NOTIFICATIONS_QUEUE.send({ type: 'capacity_threshold', ... })

Consumer Worker:
    └─ Email admin with capacity alert
```

---

## Build Order / Dependency Graph

This is the critical ordering for the roadmap. Each phase can only start after its dependencies are built.

```
Phase 0: Repo + Toolchain [ALREADY DONE — static site]
   └─ pnpm workspace, GitHub Actions, CF Pages deploy

Phase 1: Foundation (must come first — everything depends on this)
   ├─ D1 schema + Drizzle setup (migrations)
   ├─ KV namespace provisioning
   ├─ Queue creation (wrangler queues create)
   ├─ Worker project scaffold (wrangler.jsonc, Hono app)
   └─ /rsvp/healthz endpoint (proves Worker ↔ D1 binding works)

Phase 2: Public RSVP Form (depends on Phase 1)
   ├─ GET /rsvp/:slug → serve event data
   ├─ domain/capacity.ts (critical — 100% coverage required)
   ├─ domain/duplicates.ts (critical — 100% coverage required)
   ├─ domain/tokens.ts (critical — 100% coverage required)
   ├─ POST /rsvp/submit → full RSVP flow
   ├─ PATCH /rsvp/:id → edit flow
   ├─ Turnstile integration
   ├─ Rate limiting (KV counters)
   └─ Thank-you page + ICS download

Phase 3: Admin Auth (depends on Phase 1, argon2id WASM)
   ├─ argon2id WASM build for Workers runtime
   ├─ POST /rsvp/admin/login (email+password → KV session)
   ├─ POST /rsvp/admin/logout
   ├─ POST /rsvp/admin/password-reset
   ├─ Account lockout logic
   └─ CF Access policy on /rsvp/admin/*

Phase 4: Admin Dashboard (depends on Phase 2 + Phase 3)
   ├─ Event CRUD (GET/POST/PATCH/DELETE /rsvp/admin/events)
   ├─ RSVP list with filters + pagination
   ├─ Waitlist promotion (transactional, recheck capacity)
   ├─ QR code generation
   └─ Dashboard tiles + charts (Chart.js)

Phase 5: Notifications (depends on Phase 2 — queue + consumer)
   ├─ Consumer Worker: queue handler
   ├─ Email via Resend/Postmark (guest confirmation, admin alert)
   ├─ Capacity threshold emails (80%, 100%)
   ├─ SMS via Twilio (per-event toggle)
   └─ Audit log queue write path

Phase 6: Cron Jobs (depends on Phase 5)
   ├─ Scheduled handler: reminder emails (query + enqueue)
   └─ Scheduled handler: audit log purge (DELETE old rows)

Phase 7: Data Management (depends on Phase 4)
   ├─ CSV export (no tokens)
   ├─ JSON export (tokens gated by ?include_tokens=true + re-auth)
   └─ CSV import with error summary

Phase 8: Observability + Security Hardening (parallel with Phases 5-7)
   ├─ Structured logging (pino-compatible, console.log in Workers)
   ├─ OTEL traces (custom spans around critical paths)
   ├─ CSRF protection + strict CSP headers
   ├─ Audit log write path (via queue)
   └─ SEC-04 through SEC-06
```

### Critical Dependency: argon2id on Workers

argon2id requires WebAssembly. The `@node-rs/argon2` package provides a WASM build. Workers support WASM with `--experimental-vm-modules` OR via bundled `.wasm` files. This must be validated in Phase 3 before building admin auth. **Flag this as a research gate**: test `@node-rs/argon2` (WASM) or `argon2-browser` WASM in Workers runtime before committing to this choice. Alternative: use `bcrypt` polyfill (slower but less complex).

---

## Scaling Considerations

| Scale | Architecture Notes |
|-------|--------------------|
| 0–500 RSVPs | Single D1 database, no read replicas; all components as described |
| 500–10K RSVPs | D1 Sessions API (`withSession("first-primary")`) for read consistency; add indexes; consider R2 for CSV export staging |
| 10K+ RSVPs | D1 read replicas (now GA); move audit_logs to R2 append-only logs; separate Consumer Worker from API Worker for independent scaling |

### D1 Limits (current, verified from docs)
- No per-table row limit documented; D1 is designed for persistent data
- `wrangler d1 execute` batches are not size-limited
- D1 is single-writer: burst RSVP submissions will serialize at write point

---

## Anti-Patterns

### Anti-Pattern 1: Awaiting Queue Sends in the Request Path

**What people do:** `await env.NOTIFICATIONS_QUEUE.send(...)` inside the HTTP handler before returning the response.

**Why it's wrong:** Adds 20-50ms to every RSVP submission response. Queue sends can fail and are non-blocking by design.

**Do this instead:**
```typescript
ctx.waitUntil(env.NOTIFICATIONS_QUEUE.send(payload))
return c.json({ rsvpId }, 201)
```

### Anti-Pattern 2: D1 Sessions Instead of KV Sessions

**What people do:** Create a `sessions` table in D1 with an expiry timestamp, query it on every authenticated request, run a nightly cron to purge expired rows.

**Why it's wrong:** D1 reads for session lookup add 10-30ms vs. ~1ms KV edge read. Session data is purely key-value; putting it in a relational table adds write serialization pressure to D1.

**Do this instead:** KV with native TTL. No purge cron needed. Reads hit edge cache.

### Anti-Pattern 3: Checking Capacity Without a Transaction

**What people do:** Read current attending count, check against max, then insert in separate statements.

**Why it's wrong:** Race condition between two concurrent submissions — both read "1 spot left", both insert, overbooking results.

**Do this instead:** All capacity reads and the INSERT happen in a single D1 batch/transaction. D1's SQLite serializes writes.

### Anti-Pattern 4: Storing Dates as Unix Timestamps in D1

**What people do:** Store `start_at` as `INTEGER` (Unix seconds) because "SQLite doesn't have timestamps."

**Why it's wrong:** SQLite has extensive date/time functions (`datetime()`, `date()`, `strftime()`) that operate on ISO-8601 TEXT. Storing as INTEGER makes cron queries like `date(start_at, '-7 days') = date('now')` impossible.

**Do this instead:** Store all dates as `TEXT` in ISO-8601 format: `2026-06-15T18:00:00Z`. Use `datetime()` SQLite functions in queries.

### Anti-Pattern 5: Validating JSON Columns with D1 CHECK Constraints

**What people do:** Port the PostgreSQL `CHECK (jsonb_typeof(dietary) = 'array')` constraints to D1.

**Why it's wrong:** D1/SQLite CHECK constraints cannot call JSON functions that reference the new row's value (they're evaluated differently). These silently pass or error in unexpected ways.

**Do this instead:** Validate JSON shape with Zod/Valibot in the application layer before the D1 insert. The schema documents the expected shape; the app enforces it.

---

## Integration Points

### External Services

| Service | Integration | Notes |
|---------|------------|-------|
| Resend / Postmark | `fetch()` HTTP API from Consumer Worker | Workers support fetch-only HTTP — no SMTP. Use HTTP API SDK or direct fetch. |
| Twilio SMS | `fetch()` HTTP API from Consumer Worker | Per-event toggle; send only when `notify_via_sms = true` |
| Cloudflare Turnstile | `fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', ...)` | Built-in CF integration; verify server-side in Worker middleware |
| Cloudflare Access | Request headers: `Cf-Access-Authenticated-User-Email`, `Cf-Access-Jwt-Assertion` | Protect `/rsvp/admin/*` at CF Access policy level; Worker can optionally verify JWT |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Pages Functions → API Worker | Service binding (`env.API_WORKER.fetch(request)`) | Zero-latency internal call; no Internet round-trip |
| API Worker → Queues | Producer binding (`env.NOTIFICATIONS_QUEUE.send(...)`) | Non-blocking with `ctx.waitUntil` |
| API Worker → D1 | Direct binding (`env.DB.prepare(...)`) | D1 binding is per-Worker; shared between fetch, queue, scheduled handlers |
| API Worker → KV | Direct binding (`env.SESSION_KV.get/put(...)`) | Session reads on every authenticated request |
| Consumer Worker → External | `fetch()` to Resend, Postmark, Twilio | Async; retries managed by Queues `max_retries` |

---

## Sources

- [Wrangler Configuration — Cloudflare Docs](https://developers.cloudflare.com/workers/wrangler/configuration/) — HIGH confidence
- [D1 Generated Columns — Cloudflare Docs](https://developers.cloudflare.com/d1/reference/generated-columns/) — HIGH confidence (STORED columns confirmed supported)
- [D1 SQL Statements — Cloudflare Docs](https://developers.cloudflare.com/d1/sql-api/sql-statements/) — HIGH confidence
- [D1 Use Indexes — Cloudflare Docs](https://developers.cloudflare.com/d1/best-practices/use-indexes/) — HIGH confidence (partial indexes confirmed)
- [How Queues Works — Cloudflare Docs](https://developers.cloudflare.com/queues/reference/how-queues-works/) — HIGH confidence
- [Cron Triggers — Cloudflare Docs](https://developers.cloudflare.com/workers/configuration/cron-triggers/) — HIGH confidence
- [Workers Platform Limits — Cloudflare Docs](https://developers.cloudflare.com/workers/platform/limits/) — HIGH confidence
- [KV Limits — Cloudflare Docs](https://developers.cloudflare.com/kv/platform/limits/) — HIGH confidence
- [Pages Functions Bindings — Cloudflare Docs](https://developers.cloudflare.com/pages/functions/bindings/) — HIGH confidence (Queue producers from Pages confirmed; consumers not supported in Pages Functions)
- [Hono — Cloudflare Workers Guide](https://hono.dev/docs/getting-started/cloudflare-workers) — HIGH confidence (fetch+scheduled export pattern confirmed)
- [RSVPex v5.2 Architecture](../../rsvp/docs/rsvp_architecture_v5_2_gitea.md) — domain logic sections valid, infra references superseded
- [RSVPex Schema v5.3](../../rsvp/docs/rsvp_schema_v5_3.sql.md) — PostgreSQL DDL source for D1 translation

---

## Open Questions / Research Flags

1. **argon2id WASM in Workers runtime**: Must be validated before Phase 3 (Admin Auth). Test `@node-rs/argon2` WASM bundle size (10MB Worker limit) and CPU cost (30s CPU limit). Fallback: bcrypt via `bcryptjs` (pure JS, slower but confirmed Workers-compatible).

2. **CF Access for single-admin self-hosted**: CF Access requires a Cloudflare Zero Trust account and a configured identity provider. For a self-hosted single-admin app, this may be overkill. Alternative: skip CF Access, rely entirely on app-level session with lockout. **Needs decision before Phase 3.**

3. **React vs HTMX for frontend**: PROJECT.md notes this as TBD. Architecture is frontend-agnostic — the API Worker exposes JSON APIs that either approach can consume. Pages serves static assets either way.

4. **D1 read replicas**: Currently available for D1 (`withSession` API). For this scale (single-event RSVP app), not needed in MVP. Phase 2 flag: monitor D1 read latency; add `withSession("first-primary")` if read-your-writes issues appear.

5. **Single Worker vs. Split Consumer Worker**: Current recommendation is single Worker. If queue processing CPU usage materially impacts HTTP request latency, extract Consumer into a separate Worker with a Service binding. Unlikely at this scale but worth monitoring.

---
*Architecture research for: RSVPex — Cloudflare Workers + D1 + Queues + Pages*
*Researched: 2026-03-23*
