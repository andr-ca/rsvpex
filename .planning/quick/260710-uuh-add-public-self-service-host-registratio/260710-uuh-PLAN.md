---
phase: quick
task: 260710-uuh
type: execute
wave: 1
depends_on: []
files_modified:
  - app/migrations/0006_add_event_ownership_and_host_role.sql
  - app/src/db/schema.ts
  - app/src/domain/authorization.ts
  - app/src/routes/adminSignup.ts
  - app/src/routes/adminDashboard.ts
  - app/src/routes/adminEvents.ts
  - app/src/routes/adminRsvps.ts
  - app/src/routes/adminData.ts
  - app/src/routes/adminQr.ts
  - app/src/routes/adminManagement.ts
  - static-web/index.html
  - static-web/css/main.css
  - tests/unit/authorization.test.ts
  - tests/integration/adminSignup.test.ts
autonomous: true
requirements: [HOST-REGISTRATION, EVENT-OWNERSHIP-SCOPING, HOME-NAVIGATION]

must_haves:
  truths:
    - "A user can self-register as a host via /rsvp/admin/signup without an invite code"
    - "A host can only see and manage events they created"
    - "An Owner/Editor can see all events, including legacy NULL-owner events"
    - "A host cannot access admin management (cannot see admin list, cannot manage other admins)"
    - "Duplicate email signup returns 409 (email already exists)"
    - "Hosts do not appear in the admin list (/rsvp/admin/admins)"
    - "Accessing another host's event returns 404 (not 403) to avoid revealing event existence"
    - "New events created by hosts have created_by set to their admin_user_id"
  artifacts:
    - path: "app/migrations/0006_add_event_ownership_and_host_role.sql"
      provides: "Schema migration adding events.created_by column and index"
    - path: "app/src/db/schema.ts"
      provides: "Drizzle schema update: role enum extended to ['owner', 'editor', 'host']"
    - path: "app/src/domain/authorization.ts"
      provides: "Authorization helpers (appendOwnershipFilter, verifyEventOwnership) — single source of truth"
    - path: "app/src/routes/adminSignup.ts"
      provides: "Public self-service signup route (GET form + POST handler)"
    - path: "app/src/routes/adminDashboard.ts"
      provides: "Stats dashboard with ownership-filtered queries for hosts"
    - path: "app/src/routes/adminEvents.ts"
      provides: "Event CRUD with ownership verification for hosts"
    - path: "app/src/routes/adminRsvps.ts"
      provides: "RSVP management with event ownership verification"
    - path: "app/src/routes/adminData.ts"
      provides: "CSV/JSON export/import with event ownership checks"
    - path: "app/src/routes/adminQr.ts"
      provides: "QR code render with event ownership verification"
    - path: "app/src/routes/adminManagement.ts"
      provides: "Admin list filtered to exclude hosts (Owner/Editor only)"
    - path: "static-web/index.html"
      provides: "Home page with signup/login nav links"
    - path: "static-web/css/main.css"
      provides: "Styling for nav links and responsive layout"
    - path: "tests/unit/authorization.test.ts"
      provides: "Unit tests for authorization helpers (owner/editor/host role logic)"
    - path: "tests/integration/adminSignup.test.ts"
      provides: "Integration tests for signup route and ownership scoping across routes"
  key_links:
    - from: "app/src/db/schema.ts"
      to: "app/migrations/0006_add_event_ownership_and_host_role.sql"
      via: "Migration must run before routes use created_by"
      pattern: "migrations applied before app.fetch()"
    - from: "app/src/domain/authorization.ts"
      to: "app/src/routes/adminDashboard.ts, adminEvents.ts, adminRsvps.ts, adminData.ts, adminQr.ts"
      via: "All routes import and call verifyEventOwnership() and appendOwnershipFilter()"
      pattern: "authorization.ts is the single source of truth"
    - from: "app/src/routes/adminSignup.ts"
      to: "app/src/db/schema.ts"
      via: "POST handler inserts role='host', requires schema enum to include 'host'"
      pattern: "role enum extended before signup route runs"
    - from: "app/src/routes/adminManagement.ts"
      to: "app/src/db/schema.ts"
      via: "Admin list query filters WHERE role IN ('owner', 'editor') — hosts excluded"
      pattern: "schema enum must be extended first"
    - from: "static-web/index.html"
      to: "app/src/routes/adminSignup.ts, adminLogin.ts"
      via: "Nav links point to /rsvp/admin/signup and /rsvp/admin/login"
      pattern: "nav links must be static (no client-side session detection per correction #2)"
---

<objective>
Enable self-registered hosts to create and manage their own events without invite codes, with strict event ownership scoping. Owners/Editors retain global visibility. Update home page navigation to link to signup/login.

**Purpose:**
- Remove friction from host onboarding (no invite code required)
- Implement role-based access control (RBAC) at the query layer for hosts
- Maintain backward compatibility with Owner/Editor global visibility
- Provide clear navigation on the public home page

**Output:**
- New `'host'` role in admin_users with self-registration via /rsvp/admin/signup
- Event ownership tracking (events.created_by) scoped to hosts only
- 6 existing admin routes retrofitted with ownership filters/checks
- Home page navigation with signup/login links
- Full test coverage for new role and ownership scoping
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260710-uuh-add-public-self-service-host-registratio/260710-uuh-RESEARCH.md

## Key Implementation Notes (Corrections to Research)

**Correction #1 — verifyEventOwnership() Logic (CRITICAL):**
The research doc proposed `event.created_by === null` as matching backward-compatible events for hosts. This is WRONG.
- For hosts: ownership check must be `event.created_by === adminUserId` (strict equality ONLY)
- Pre-existing events with `created_by = NULL` must NOT be visible to hosts — they belong to Owner/Editor only
- The appendOwnershipFilter() for hosts must be: `AND (created_by = ?)` not `OR created_by IS NULL`
- Result: Ownership check returns 404 to hosts when event.created_by !== adminUserId or when created_by is NULL

**Correction #2 — Home Page Session Detection (CRITICAL):**
The research doc proposed reading `document.cookie` to detect session and conditionally show "My Events" vs "Sign Up/Login".
This is IMPOSSIBLE — the session cookie is set with `httpOnly: true` (a deliberate security property per S-15 in recommendations.md) so JavaScript cannot read it.
- Drop ALL client-side session detection JS
- Home page shows static "Sign Up" and "Admin Login" links always
- Both links work correctly regardless of session state (login page redirects authenticated sessions past the form)
- No new JS file needed; NO modifications to static-web/js/main.js for session detection

## Current Architecture (Reference)

- Routes: Hono v4.12.28, raw db.prepare() SQL (not Drizzle query layer)
- Auth: D1 sessions table + argon2id/PBKDF2 + pepper pattern
- Migrations: Hand-written SQL in `migrations/` with PRAGMA foreign_keys, `--> statement-breakpoint` separators
- Admin routes: Middleware pattern (requireAdmin, requireOwner) + Zod validation
- Rate-limiting: adminAuthRateLimit() used for POST /login, /invite-accept, etc.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create migration 0006 + extend schema.ts with created_by column and 'host' role</name>
  <files>
    app/migrations/0006_add_event_ownership_and_host_role.sql
    app/src/db/schema.ts
  </files>
  <action>
**Step 1: Create migration file** (`app/migrations/0006_add_event_ownership_and_host_role.sql`)

Write hand-written migration following the style of `0004_admin_invites_and_roles.sql` and `0005_backfill_admin_owner.sql`:

```sql
PRAGMA foreign_keys = ON;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `created_by` text;
--> statement-breakpoint
CREATE INDEX `idx_events_created_by` ON `events` (`created_by`);
```

This adds the `created_by` nullable column to `events` (existing events will have NULL) and an index for ownership queries. Foreign key enforcement is ON but no explicit FK constraint needed yet (app-layer responsibility).

**Step 2: Update schema.ts**

In `app/src/db/schema.ts`:

1. **Line 20:** Extend the role enum for adminUsers:
   ```typescript
   role: text('role', { enum: ['owner', 'editor', 'host'] })
     .notNull()
     .default('editor'),
   ```

2. **Line 282:** Extend the role enum for adminInvites (to match, though hosts won't use invites):
   ```typescript
   role: text('role', { enum: ['owner', 'editor', 'host'] })
     .notNull()
     .default('editor'),
   ```

3. **After line 95 (after updatedAt in events table):** Add the created_by column to the events table:
   ```typescript
   createdBy: text('created_by'),  // nullable — null for legacy pre-scoping events
   ```

   (Note: No index needed in Drizzle definition since the migration creates it.)

Verify no TypeScript errors in the schema definition after changes.
  </action>
  <verify>
    <automated>
cd /home/andrey/projects/rsvpex && \
npm --prefix app run typecheck && \
grep -q "enum: \['owner', 'editor', 'host'\]" app/src/db/schema.ts && \
grep -q "ALTER TABLE.*events.*ADD COLUMN.*created_by" app/migrations/0006_add_event_ownership_and_host_role.sql && \
grep -q "CREATE INDEX.*idx_events_created_by" app/migrations/0006_add_event_ownership_and_host_role.sql
    </automated>
  </verify>
  <done>
    - Migration file 0006_*.sql exists with PRAGMA foreign_keys, ALTER TABLE ADD COLUMN created_by, and CREATE INDEX idx_events_created_by
    - schema.ts adminUsers.role enum includes 'host'
    - schema.ts adminInvites.role enum includes 'host' (for consistency, though not used for hosts)
    - schema.ts events table includes createdBy column definition
    - TypeScript typecheck passes with no errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Create src/domain/authorization.ts with ownership helpers</name>
  <files>app/src/domain/authorization.ts</files>
  <action>
Create a new file `app/src/domain/authorization.ts` as the single source of truth for ownership logic. This file contains two pure functions, testable without HTTP context.

**Key implementation notes (applying CORRECTION #1):**

1. `appendOwnershipFilter()` for list queries:
   - For 'owner' or 'editor': return empty string (no filter, see all events)
   - For 'host': return `AND (${tableAlias}.created_by = ?)` ONLY — no `OR created_by IS NULL`
   - Hosts NEVER see NULL-owner (legacy) events

2. `verifyEventOwnership()` for single-event checks:
   - For 'owner' or 'editor': return true immediately (no check)
   - For 'host': query event, return `event.created_by === adminUserId` (strict equality, no null match)
   - Legacy NULL-owner events return false for hosts, triggering 404 response

**Full code:**

```typescript
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Appends a WHERE clause fragment for event ownership filtering in hosts.
 * Owner/Editor have no ownership restrictions (global visibility).
 * Hosts see only events they created (created_by = <adminUserId>).
 * Legacy events with created_by = NULL are invisible to hosts.
 *
 * Usage (for list queries):
 *   const role = await getAdminRole(db, adminUserId);
 *   const filter = appendOwnershipFilter(role, adminUserId, 'events');
 *   const sql = `SELECT * FROM events WHERE archived_at IS NULL ${filter}`;
 *   // For hosts, bind adminUserId; for owner/editor, bind nothing (no ? in filter)
 *
 * @param role User's role ('owner', 'editor', 'host')
 * @param adminUserId Admin user ID (used only for hosts)
 * @param tableAlias Table alias or name (default 'events')
 * @returns WHERE clause fragment: '' for owner/editor, 'AND (table.created_by = ?)' for host
 */
export function appendOwnershipFilter(
  role: 'owner' | 'editor' | 'host',
  adminUserId: string,
  tableAlias: string = 'events'
): string {
  if (role === 'owner' || role === 'editor') {
    return '' // No filter — see all events
  }
  // role === 'host'
  // Important: NO 'OR created_by IS NULL' — hosts NEVER see legacy unowned events
  return `AND (${tableAlias}.created_by = ?)`
}

/**
 * Verifies event ownership for a host.
 * Owner/Editor always have access (returns true immediately).
 * Hosts have access ONLY if event.created_by === adminUserId (strict equality).
 * Legacy events (created_by IS NULL) return false for hosts.
 *
 * Usage (early in route handler, after fetching event):
 *   const role = await getAdminRole(c.env.DB, c.var.adminUserId);
 *   const owns = await verifyEventOwnership(c.env.DB, eventId, c.var.adminUserId, role);
 *   if (!owns) return c.notFound(); // 404, not 403 — don't reveal event exists
 *
 * @param db D1Database binding
 * @param eventId Event ID to check
 * @param adminUserId Admin user ID (used only for hosts)
 * @param role User's role
 * @returns true if owner/editor, or if host owns the event; false otherwise
 */
export async function verifyEventOwnership(
  db: D1Database,
  eventId: string,
  adminUserId: string,
  role: 'owner' | 'editor' | 'host'
): Promise<boolean> {
  if (role === 'owner' || role === 'editor') {
    return true // No check needed — owner/editor see all events
  }

  // role === 'host'
  const event = await db
    .prepare('SELECT created_by FROM events WHERE id = ?')
    .bind(eventId)
    .first<{ created_by: string | null }>()

  if (!event) {
    return false // Event doesn't exist
  }

  // STRICT EQUALITY ONLY — hosts NEVER match NULL created_by (legacy events)
  return event.created_by === adminUserId
}
```

**Quality checks:**
- No D1 or HTTP imports beyond D1Database type
- Functions are pure and deterministic (no side effects)
- Comments explain the CORRECTION #1 logic explicitly
- Matches existing project pattern (e.g., src/domain/adminAuth.ts structure)
  </action>
  <verify>
    <automated>
cd /home/andrey/projects/rsvpex && \
npm --prefix app run typecheck && \
grep -q "appendOwnershipFilter" app/src/domain/authorization.ts && \
grep -q "verifyEventOwnership" app/src/domain/authorization.ts && \
grep -q "created_by === adminUserId" app/src/domain/authorization.ts && \
grep -v "created_by IS NULL" app/src/domain/authorization.ts | grep -q "appendOwnershipFilter"
    </automated>
  </verify>
  <done>
    - File exists at app/src/domain/authorization.ts
    - Exports appendOwnershipFilter(role, adminUserId, tableAlias) — returns '' for owner/editor, 'AND (table.created_by = ?)' for host
    - Exports verifyEventOwnership(db, eventId, adminUserId, role) — returns true for owner/editor; for host, checks strict equality event.created_by === adminUserId (no null match)
    - No client imports beyond D1Database type
    - TypeScript typecheck passes
  </done>
</task>

<task type="auto">
  <name>Task 3: Create public signup route POST/GET /rsvp/admin/signup</name>
  <files>app/src/routes/adminSignup.ts</files>
  <action>
Create new file `app/src/routes/adminSignup.ts` with public signup endpoint (no session required).

**Key pattern notes:**
- Reuse adminAuthRateLimit() middleware from existing login/invite-accept routes
- Reuse page() helper from adminLogin.ts / adminSetup.ts for styling consistency
- Reuse conditional INSERT pattern (C-12) from adminSetup.ts
- Email stored in lowercase (email.toLowerCase()) matching all other auth routes
- Role hardcoded to 'host' on insert
- Password hashing uses hashPassword(password, pepper) pattern from adminAuth.ts

**Full code structure:**

```typescript
import { Hono } from 'hono'
import { z } from 'zod'
import { adminAuthRateLimit } from '../middleware/adminAuthRateLimit'
import { hashPassword, getAdminRole } from '../domain/adminAuth'
import { page } from './adminLogin' // Reuse the page() template helper
import type { HonoRequest } from '../index'

const signupRouter = new Hono<HonoRequest>()

// Validation schema for signup form
const signupSchema = z.object({
  email: z.string().email('Invalid email').max(254),
  password: z.string().min(12, 'Password must be at least 12 characters').max(128),
  displayName: z.string().max(100).optional(),
})

/**
 * GET /rsvp/admin/signup — Serve signup form (public, no auth required)
 */
signupRouter.get('/signup', async (c) => {
  return c.html(
    page('Sign Up', `
      <div class="auth-form-container">
        <h1>Create Your Host Account</h1>
        <form method="post" action="/rsvp/admin/signup" class="auth-form">
          <label>
            Email
            <input type="email" name="email" required />
          </label>
          <label>
            Password (min 12 characters)
            <input type="password" name="password" required />
          </label>
          <label>
            Display Name (optional)
            <input type="text" name="displayName" />
          </label>
          <button type="submit">Sign Up</button>
        </form>
        <p>Already have an account? <a href="/rsvp/admin/login">Log in</a></p>
      </div>
    `)
  )
})

/**
 * POST /rsvp/admin/signup — Create a new host account
 *
 * Rate-limited: 5 requests per minute per IP (adminAuthRateLimit)
 * Duplicate email: Returns 409 with message and reset password link
 * Success: Redirect to /rsvp/admin/login with success message
 */
signupRouter.post('/signup', adminAuthRateLimit(), async (c) => {
  const formData = await c.req.parseForm()
  
  // Validate form input
  const validation = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName'),
  })
  
  if (!validation.success) {
    const errors = validation.error.flatten().fieldErrors
    return c.html(
      page('Sign Up — Error', `
        <div class="auth-form-container">
          <h1>Sign Up</h1>
          <div class="error-messages">
            ${Object.entries(errors)
              .map(([field, msgs]) => `<p class="error">${field}: ${msgs?.[0] || 'Invalid'}</p>`)
              .join('')}
          </div>
          <form method="post" action="/rsvp/admin/signup" class="auth-form">
            <label>Email <input type="email" name="email" value="${formData.get('email') || ''}" required /></label>
            <label>Password <input type="password" name="password" required /></label>
            <label>Display Name <input type="text" name="displayName" value="${formData.get('displayName') || ''}" /></label>
            <button type="submit">Sign Up</button>
          </form>
        </div>
      `),
      400
    )
  }

  const { email, password, displayName } = validation.data
  
  // Hash password with pepper
  const passwordHash = await hashPassword(password, c.env.ARGON2_PEPPER)
  const id = crypto.randomUUID()
  
  // Conditional INSERT: race-safe (C-12 pattern from adminSetup.ts)
  // If email already exists, meta.changes === 0
  const result = await c.env.DB.prepare(`
    INSERT INTO admin_users (id, email, password_hash, display_name, role, is_active, created_at)
    SELECT ?, ?, ?, ?, 'host', 1, datetime('now')
    WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE email = ?)
  `)
    .bind(id, email.toLowerCase(), passwordHash, displayName ?? null, email.toLowerCase())
    .run()
  
  if (result.meta.changes === 0) {
    // Email already exists
    return c.html(
      page('Sign Up — Email in Use', `
        <div class="auth-form-container">
          <h1>Email Already in Use</h1>
          <p>This email is already registered.</p>
          <p><a href="/rsvp/admin/password-reset">Reset your password?</a></p>
          <p><a href="/rsvp/admin/login">Go back to login</a></p>
        </div>
      `),
      409
    )
  }
  
  // Success: redirect to login with success message (via query param)
  return c.redirect('/rsvp/admin/login?signup=success', 302)
})

export default signupRouter
```

**Integration notes:**
- Import and register signupRouter in `app/src/index.ts` (like adminLoginRouter)
- Ensure adminAuthRateLimit() is applied to POST route (already used for /login, /invite-accept)
- page() helper must accept title + HTML content (verify it's exported from adminLogin.ts or create locally)
- email.toLowerCase() matches the pattern used in other auth routes
- Role hardcoded to 'host' — no parameter
- Conditional INSERT prevents race conditions
- 409 response for duplicate email (not 400) — distinguishes from validation errors

**Error handling:**
- Validation errors: 400 + show form with error messages
- Duplicate email: 409 + show friendly message with password reset link
- Success: 302 redirect to login page

**Optional enhancement (not required for MVP):**
- The login page could check for ?signup=success param and show a success banner
- This can be added later; initial version just redirects without banner
  </action>
  <verify>
    <automated>
cd /home/andrey/projects/rsvpex && \
npm --prefix app run typecheck && \
grep -q "signupRouter\|'/signup'" app/src/routes/adminSignup.ts && \
grep -q "adminAuthRateLimit" app/src/routes/adminSignup.ts && \
grep -q "role.*host" app/src/routes/adminSignup.ts && \
grep -q "email.toLowerCase()" app/src/routes/adminSignup.ts && \
grep -q "WHERE NOT EXISTS" app/src/routes/adminSignup.ts
    </automated>
  </verify>
  <done>
    - File exists at app/src/routes/adminSignup.ts
    - GET /rsvp/admin/signup renders public signup form (no auth required)
    - POST /rsvp/admin/signup creates host account with rate-limiting (adminAuthRateLimit)
    - Email stored in lowercase (email.toLowerCase())
    - Password hashed via hashPassword(password, pepper)
    - Role hardcoded to 'host'
    - Conditional INSERT prevents duplicate email race condition
    - Duplicate email returns 409 with friendly message and password reset link
    - Success redirects to login page
    - TypeScript typecheck passes
  </done>
</task>

<task type="auto">
  <name>Task 4: Retrofit adminDashboard.ts with ownership-filtered stats queries</name>
  <files>app/src/routes/adminDashboard.ts</files>
  <action>
Update `app/src/routes/adminDashboard.ts` to apply ownership filters to all stats queries for hosts.

**Overview of changes:**

The getDashboardStats() function currently has 4 unfiltered raw SQL queries counting events by status. Update each query to filter by ownership for hosts.

**Queries to update** (from research inventory):

1. `SELECT COUNT(*) as n FROM events WHERE status = 'published' AND start_at <= ?` (past events)
2. `SELECT COUNT(*) as n FROM events WHERE status = 'published' AND start_at > ?` (upcoming events)
3. `SELECT COUNT(*) as n FROM events WHERE archived_at IS NULL` (active events count)
4. `SELECT id, title, status, start_at, slug FROM events WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 5` (recent events list)

**Implementation pattern:**

Before getDashboardStats() returns, it must:
1. Get the admin's role: `const role = await getAdminRole(c.env.DB, c.var.adminUserId)`
2. Get the ownership filter: `const filter = appendOwnershipFilter(role, c.var.adminUserId, 'events')`
3. For each query: Append the filter to the WHERE clause and include adminUserId in bind() if role is 'host'

**Example for query 1:**

```typescript
// Before (unfiltered):
const pastCount = await c.env.DB.prepare(
  `SELECT COUNT(*) as n FROM events WHERE status = 'published' AND start_at <= ?`
)
  .bind(now)
  .first<{ n: number }>()

// After (with ownership filter):
const pastCount = await c.env.DB.prepare(
  `SELECT COUNT(*) as n FROM events WHERE status = 'published' AND start_at <= ? ${filter}`
)
  .bind(role === 'host' ? [now, c.var.adminUserId] : [now])
  .first<{ n: number }>()
```

**Steps:**

1. Import at top of file:
   ```typescript
   import { appendOwnershipFilter } from '../domain/authorization'
   import { getAdminRole } from '../domain/adminAuth'
   ```

2. In getDashboardStats() route handler, after the `requireAdmin` middleware:
   ```typescript
   const role = await getAdminRole(c.env.DB, c.var.adminUserId)
   const filter = appendOwnershipFilter(role, c.var.adminUserId, 'events')
   ```

3. Update all 4 queries to append filter and adjust bind() parameters:
   - Query 1 (past): `.bind(role === 'host' ? [now, c.var.adminUserId] : [now])`
   - Query 2 (upcoming): `.bind(role === 'host' ? [now, c.var.adminUserId] : [now])`
   - Query 3 (active count): `.bind(role === 'host' ? c.var.adminUserId : undefined)` — no param for owner/editor
   - Query 4 (recent list): Same as #3

4. Verify each query uses `${filter}` in the SQL string before the ORDER BY/LIMIT clauses

**Testing note:** After update, a host should see only their own event counts; an Owner/Editor should see all event counts including legacy NULL-owner events.
  </action>
  <verify>
    <automated>
cd /home/andrey/projects/rsvpex && \
npm --prefix app run typecheck && \
grep -q "appendOwnershipFilter" app/src/routes/adminDashboard.ts && \
grep -q "getAdminRole" app/src/routes/adminDashboard.ts && \
grep -q "const role = await getAdminRole" app/src/routes/adminDashboard.ts && \
grep -q "const filter = appendOwnershipFilter" app/src/routes/adminDashboard.ts
    </automated>
  </verify>
  <done>
    - adminDashboard.ts imports appendOwnershipFilter and getAdminRole
    - getDashboardStats() handler fetches admin role and computes ownership filter
    - All 4 stats queries append ${filter} to WHERE clause
    - bind() parameters adjusted: hosts bind [param, adminUserId]; owner/editor bind [param] only
    - Hosts see only their own event stats; Owner/Editor see all events
    - TypeScript typecheck passes
  </done>
</task>

<task type="auto">
  <name>Task 5: Retrofit adminEvents.ts with ownership verification for all CRUD routes</name>
  <files>app/src/routes/adminEvents.ts</files>
  <action>
Update `app/src/routes/adminEvents.ts` to verify event ownership for hosts on all routes (list/get/create/update/publish/archive).

**Routes to update** (from research inventory):

1. **GET /rsvp/admin/events** (list) — apply ownership filter
2. **GET /rsvp/admin/events/:id** (view single) — verify ownership before rendering
3. **POST /rsvp/admin/events** (create) — set created_by to c.var.adminUserId
4. **POST /rsvp/admin/events/:id** (update) — verify ownership before update
5. **POST /rsvp/admin/events/:id/publish** — verify ownership before publish
6. **POST /rsvp/admin/events/:id/archive** — verify ownership before archive

**Implementation steps:**

1. **Imports** at top:
   ```typescript
   import { appendOwnershipFilter, verifyEventOwnership } from '../domain/authorization'
   import { getAdminRole } from '../domain/adminAuth'
   ```

2. **List route (GET /events):**
   ```typescript
   const role = await getAdminRole(c.env.DB, c.var.adminUserId)
   const filter = appendOwnershipFilter(role, c.var.adminUserId, 'events')
   const events = await c.env.DB.prepare(
     `SELECT * FROM events WHERE 1=1 ${filter} ORDER BY created_at DESC`
   )
   .bind(role === 'host' ? [c.var.adminUserId] : [])
   .all()
   ```

3. **Get single route (GET /events/:id):**
   ```typescript
   const event = await getEvent(c.env.DB, eventId)
   if (!event) return c.notFound()
   
   const role = await getAdminRole(c.env.DB, c.var.adminUserId)
   const owns = await verifyEventOwnership(c.env.DB, event.id, c.var.adminUserId, role)
   if (!owns) return c.notFound() // 404, not 403 — don't reveal event exists
   
   return c.html(/* render event form */)
   ```

4. **Create route (POST /events):**
   After validation, when creating event:
   ```typescript
   const id = crypto.randomUUID()
   const createdBy = c.var.adminUserId // Set for all new events
   
   const result = await c.env.DB.prepare(`
     INSERT INTO events (id, slug, title, created_by, ...)
     VALUES (?, ?, ?, ?, ...)
   `)
   .bind(id, slug, title, createdBy, ...)
   .run()
   ```

5. **Update route (POST /events/:id):**
   ```typescript
   const event = await getEvent(c.env.DB, eventId)
   if (!event) return c.notFound()
   
   const role = await getAdminRole(c.env.DB, c.var.adminUserId)
   const owns = await verifyEventOwnership(c.env.DB, event.id, c.var.adminUserId, role)
   if (!owns) return c.notFound()
   
   // Proceed with update
   ```

6. **Publish route (POST /events/:id/publish):** Same ownership check before publish

7. **Archive route (POST /events/:id/archive):** Same ownership check before archive

**Testing notes:**
- Host creates event, sees it with created_by = their id
- Host edits their own event: succeeds
- Host tries to edit another host's event: returns 404
- Owner/Editor edits any event (including legacy NULL-owner): succeeds
- Host lists events: sees only their own
- Owner/Editor lists events: sees all

**Pattern reminder:** The ownership check pattern is:
```typescript
const role = await getAdminRole(c.env.DB, c.var.adminUserId)
const owns = await verifyEventOwnership(c.env.DB, eventId, c.var.adminUserId, role)
if (!owns) return c.notFound() // Always 404, never 403
```
  </action>
  <verify>
    <automated>
cd /home/andrey/projects/rsvpex && \
npm --prefix app run typecheck && \
grep -q "appendOwnershipFilter" app/src/routes/adminEvents.ts && \
grep -q "verifyEventOwnership" app/src/routes/adminEvents.ts && \
grep -q "created_by.*adminUserId\|createdBy.*c.var.adminUserId" app/src/routes/adminEvents.ts && \
grep -q "c.notFound()" app/src/routes/adminEvents.ts
    </automated>
  </verify>
  <done>
    - adminEvents.ts imports appendOwnershipFilter and verifyEventOwnership
    - List route (GET /events) applies ownership filter
    - Get/Update/Publish/Archive routes verify ownership with verifyEventOwnership() before processing
    - Ownership checks return 404 (not 403) to avoid event existence leakage
    - Create route sets created_by = c.var.adminUserId on INSERT
    - Hosts see and can manage only their own events
    - Owner/Editor see and can manage all events (including legacy NULL-owner)
    - TypeScript typecheck passes
  </done>
</task>

<task type="auto">
  <name>Task 6: Retrofit adminRsvps.ts with ownership checks on all RSVP routes</name>
  <files>app/src/routes/adminRsvps.ts</files>
  <action>
Update `app/src/routes/adminRsvps.ts` to verify event ownership for hosts on all RSVP management routes.

**Routes to update** (from research inventory):

1. **GET /rsvp/admin/events/:id/rsvps** (list RSVPs) — verify event ownership
2. **GET /rsvp/admin/events/:id/rsvps/:rsvpId/edit** (edit RSVP form) — verify event ownership
3. **POST /rsvp/admin/events/:id/rsvps/:rsvpId** (update RSVP) — verify event ownership
4. **POST /rsvp/admin/events/:id/rsvps/:rsvpId/promote** (waitlist promote) — verify event ownership
5. **POST /rsvp/admin/events/:id/rsvps/:rsvpId/delete** (delete RSVP) — verify event ownership
6. **POST /rsvp/admin/events/:id/import** (CSV import) — verify event ownership

**Implementation steps:**

1. **Imports** at top:
   ```typescript
   import { verifyEventOwnership } from '../domain/authorization'
   import { getAdminRole } from '../domain/adminAuth'
   ```

2. **Pattern for all routes:** Early in handler, after extracting eventId from URL:
   ```typescript
   const event = await getEvent(c.env.DB, eventId)
   if (!event) return c.notFound()
   
   const role = await getAdminRole(c.env.DB, c.var.adminUserId)
   const owns = await verifyEventOwnership(c.env.DB, event.id, c.var.adminUserId, role)
   if (!owns) return c.notFound() // 404, not 403
   
   // Proceed with RSVP operation
   ```

3. **Each route:**
   - List RSVPs: Verify event ownership before querying rsvps table
   - Edit RSVP: Verify event ownership before showing edit form
   - Update RSVP: Verify event ownership before running update (important: updateRsvpWithCapacityGuard respects capacity, not ownership; ownership check at route level)
   - Promote from waitlist: Verify event ownership before promoting
   - Delete RSVP: Verify event ownership before deleting
   - Import CSV: Verify event ownership before importing

**Testing notes:**
- Host A creates event, can list/edit/promote/delete RSVPs
- Host A tries to manage Host B's event RSVPs: returns 404
- Owner/Editor can manage RSVPs on any event (including legacy NULL-owner)

**Important:** The capacity guard (updateRsvpWithCapacityGuard) is separate from ownership verification. Both must pass — ownership check first (404 if fails), then capacity guard (400 if exceeds).
  </action>
  <verify>
    <automated>
cd /home/andrey/projects/rsvpex && \
npm --prefix app run typecheck && \
grep -q "verifyEventOwnership" app/src/routes/adminRsvps.ts && \
grep -q "getAdminRole" app/src/routes/adminRsvps.ts && \
grep -c "verifyEventOwnership" app/src/routes/adminRsvps.ts | grep -q "[1-9]"
    </automated>
  </verify>
  <done>
    - adminRsvps.ts imports verifyEventOwnership and getAdminRole
    - All 6 routes (list/edit/update/promote/delete/import) call verifyEventOwnership() early in handler
    - Ownership check returns 404 if host doesn't own the event
    - Hosts can only manage RSVPs on their own events
    - Owner/Editor can manage RSVPs on all events
    - TypeScript typecheck passes
  </done>
</task>

<task type="auto">
  <name>Task 7: Retrofit adminData.ts with ownership checks on export/import routes</name>
  <files>app/src/routes/adminData.ts</files>
  <action>
Update `app/src/routes/adminData.ts` to verify event ownership for hosts before allowing CSV/JSON export and import.

**Routes to update** (from research inventory):

1. **GET /rsvp/admin/events/:id/export.csv** — verify event ownership before exporting
2. **GET /rsvp/admin/events/:id/export.json** — verify event ownership before exporting
3. **POST /rsvp/admin/events/:id/import** — verify event ownership before importing (also listed in adminRsvps.ts; check for duplicates)

**Implementation steps:**

1. **Imports** at top:
   ```typescript
   import { verifyEventOwnership } from '../domain/authorization'
   import { getAdminRole } from '../domain/adminAuth'
   ```

2. **Pattern for export routes (CSV and JSON):**
   ```typescript
   const event = await getEvent(c.env.DB, eventId)
   if (!event) return c.notFound()
   
   const role = await getAdminRole(c.env.DB, c.var.adminUserId)
   const owns = await verifyEventOwnership(c.env.DB, event.id, c.var.adminUserId, role)
   if (!owns) return c.notFound() // 404 — don't reveal event exists
   
   // Proceed with exporting RSVPs from the event
   const rsvps = await c.env.DB.prepare(
     `SELECT * FROM rsvps WHERE event_id = ? ORDER BY submitted_at DESC`
   )
   .bind(eventId)
   .all()
   
   // Convert to CSV/JSON and send
   ```

3. **For import route:** Same pattern — verify ownership before inserting RSVPs

**Testing notes:**
- Host A exports their own event: CSV/JSON succeeds with their RSVPs
- Host A tries to export Host B's event: returns 404
- Owner/Editor can export any event (including legacy NULL-owner)
- Repeated for import: hosts can only import to their own events

**Security note:** CSV/JSON export contains all guest PII (names, emails, dietary restrictions, answers). Ownership check prevents hosts from seeing other hosts' guest data — this is critical.
  </action>
  <verify>
    <automated>
cd /home/andrey/projects/rsvpex && \
npm --prefix app run typecheck && \
grep -q "verifyEventOwnership" app/src/routes/adminData.ts && \
grep -q "getAdminRole" app/src/routes/adminData.ts && \
grep -q "c.notFound()" app/src/routes/adminData.ts
    </automated>
  </verify>
  <done>
    - adminData.ts imports verifyEventOwnership and getAdminRole
    - Export routes (CSV/JSON) verify event ownership before exporting
    - Import route verifies event ownership before importing
    - Hosts can only export/import RSVPs from their own events
    - Owner/Editor can export/import from any event
    - TypeScript typecheck passes
  </done>
</task>

<task type="auto">
  <name>Task 8: Retrofit adminQr.ts with ownership check</name>
  <files>app/src/routes/adminQr.ts</files>
  <action>
Update `app/src/routes/adminQr.ts` to verify event ownership for hosts before rendering QR code.

**Route to update:**

1. **GET /rsvp/admin/events/:id/qr** — verify event ownership before rendering QR

**Implementation steps:**

1. **Imports** at top:
   ```typescript
   import { verifyEventOwnership } from '../domain/authorization'
   import { getAdminRole } from '../domain/adminAuth'
   ```

2. **Pattern:**
   ```typescript
   const event = await getEvent(c.env.DB, eventId)
   if (!event) return c.notFound()
   
   const role = await getAdminRole(c.env.DB, c.var.adminUserId)
   const owns = await verifyEventOwnership(c.env.DB, event.id, c.var.adminUserId, role)
   if (!owns) return c.notFound() // 404
   
   // Proceed with rendering QR code for the event
   ```

**Testing notes:**
- Host A can view QR for their own event
- Host A tries to view QR for Host B's event: returns 404
- Owner/Editor can view QR for any event
  </action>
  <verify>
    <automated>
cd /home/andrey/projects/rsvpex && \
npm --prefix app run typecheck && \
grep -q "verifyEventOwnership" app/src/routes/adminQr.ts && \
grep -q "getAdminRole" app/src/routes/adminQr.ts
    </automated>
  </verify>
  <done>
    - adminQr.ts imports verifyEventOwnership and getAdminRole
    - QR route verifies event ownership before rendering
    - Hosts can only view QR for their own events
    - Owner/Editor can view QR for any event
    - TypeScript typecheck passes
  </done>
</task>

<task type="auto">
  <name>Task 9: Retrofit adminManagement.ts to filter hosts from admin list</name>
  <files>app/src/routes/adminManagement.ts</files>
  <action>
Update `app/src/routes/adminManagement.ts` to exclude hosts from the admin list.

**Route to update:**

1. **GET /rsvp/admin/admins** (admin list) — filter to show only 'owner' and 'editor' roles

**Implementation steps:**

The admin list currently returns all admin_users. Update the query to filter:

```typescript
// Before:
const admins = await c.env.DB.prepare(
  `SELECT id, email, display_name, role, is_active, created_at FROM admin_users ORDER BY created_at`
).all()

// After:
const admins = await c.env.DB.prepare(
  `SELECT id, email, display_name, role, is_active, created_at FROM admin_users 
   WHERE role IN ('owner', 'editor')
   ORDER BY created_at`
).all()
```

**Rationale:**
- Hosts are self-registered; not invited by Owner
- Owner has no management actions for hosts (no deactivate/promote/demote — hosts aren't team members)
- Showing hosts in the list would confuse the Owner
- This route is requireOwner-protected anyway, so hosts never see it
- Clean separation: team (Owner/Editor) vs. event-creators (hosts)

**Testing notes:**
- Owner views admin list, sees only Owner and Editor accounts
- No hosts appear in the list even if they exist
- Hosts cannot access this route (requireOwner blocks them)

**No breaking changes:** Since hosts cannot access this page anyway (requireOwner middleware), the filter is invisible to them. Existing Owner/Editor behavior unchanged — they see all Owner/Editor accounts as before.
  </action>
  <verify>
    <automated>
cd /home/andrey/projects/rsvpex && \
npm --prefix app run typecheck && \
grep -q "WHERE role IN ('owner', 'editor')" app/src/routes/adminManagement.ts
    </automated>
  </verify>
  <done>
    - adminManagement.ts admin list query filters WHERE role IN ('owner', 'editor')
    - Hosts do not appear in the admin list
    - Only Owner/Editor accounts are visible
    - TypeScript typecheck passes
  </done>
</task>

<task type="auto">
  <name>Task 10: Update home page navigation with signup/login links</name>
  <files>
    static-web/index.html
    static-web/css/main.css
  </files>
  <action>
Update the static marketing home page to include navigation links to signup and login (CORRECTED: no client-side session detection per correction #2).

**Step 1: Update static-web/index.html**

Find the `<header>` element and add a nav section with signup/login links. Target structure:

```html
<header>
  <nav class="site-nav" aria-label="Site navigation">
    <a href="/" class="nav-wordmark" aria-label="RSVPex home">RSVP<span>EX</span></a>
    <div class="nav-links">
      <a href="/rsvp/admin/signup" class="nav-link">Sign Up as Host</a>
      <a href="/rsvp/admin/login" class="nav-link">Admin Login</a>
    </div>
  </nav>
</header>
```

Key points:
- Links to `/rsvp/admin/signup` (public signup, no invite needed)
- Links to `/rsvp/admin/login` (existing login page, works for authenticated users too)
- NO hidden "My Events" link or client-side session detection (correction #2)
- Both links work correctly whether or not the visitor has a session:
  - Unauthenticated visitor clicks "Admin Login": arrives at login form
  - Authenticated visitor clicks "Admin Login": middleware redirects past form to /rsvp/admin/events
  - Same for signup: authenticated visitor can view form (won't submit since email already registered)
- Keep nav simple and static

**Step 2: Update static-web/css/main.css**

Add styles for .site-nav and .nav-links to style the header layout. Example:

```css
.site-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  border-bottom: 1px solid #e5e7eb;
}

.nav-wordmark {
  font-size: 1.25rem;
  font-weight: bold;
  text-decoration: none;
  color: inherit;
}

.nav-wordmark span {
  /* Optional: different color for "EX" part */
}

.nav-links {
  display: flex;
  gap: 1.5rem;
}

.nav-link {
  text-decoration: none;
  color: inherit;
  font-size: 0.95rem;
  border-bottom: 2px solid transparent;
  transition: border-color 0.2s;
}

.nav-link:hover {
  border-bottom-color: currentColor;
}

@media (max-width: 640px) {
  .site-nav {
    flex-direction: column;
    gap: 1rem;
  }

  .nav-links {
    gap: 1rem;
  }
}
```

Adjust colors/spacing to match existing design system.

**Critical point:** NO JavaScript for session detection. Links are always visible and always work. This simplifies the frontend and aligns with the httpOnly cookie security property.

**Testing note:** Visit home page, verify signup and login links are visible and clickable. Unauthenticated and authenticated users should both see the same nav (no state-based hiding).
  </action>
  <verify>
    <automated>
cd /home/andrey/projects/rsvpex && \
grep -q 'href="/rsvp/admin/signup"' static-web/index.html && \
grep -q 'href="/rsvp/admin/login"' static-web/index.html && \
grep -q "site-nav\|nav-links" static-web/css/main.css
    </automated>
  </verify>
  <done>
    - static-web/index.html includes nav with "Sign Up as Host" and "Admin Login" links
    - Links point to /rsvp/admin/signup and /rsvp/admin/login
    - No client-side session detection or hidden "My Events" link (correction #2 applied)
    - static-web/css/main.css includes styling for .site-nav and .nav-links (flexbox, responsive)
    - Navigation is static and works for both authenticated and unauthenticated visitors
  </done>
</task>

<task type="auto">
  <name>Task 11: Write unit tests for authorization.ts helpers</name>
  <files>tests/unit/authorization.test.ts</files>
  <action>
Create `tests/unit/authorization.test.ts` with comprehensive unit tests for appendOwnershipFilter() and verifyEventOwnership() functions.

**Test file structure:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { appendOwnershipFilter, verifyEventOwnership } from '../../app/src/domain/authorization'
import type { D1Database } from '@cloudflare/workers-types'

describe('authorization.ts — Ownership helpers', () => {
  // ─── appendOwnershipFilter ────────────────────────────────────────────

  describe('appendOwnershipFilter()', () => {
    it('returns empty string for owner role (no filter)', () => {
      const filter = appendOwnershipFilter('owner', 'user-123', 'events')
      expect(filter).toBe('')
    })

    it('returns empty string for editor role (no filter)', () => {
      const filter = appendOwnershipFilter('editor', 'user-123', 'events')
      expect(filter).toBe('')
    })

    it('returns ownership filter for host role (strict equality only)', () => {
      const filter = appendOwnershipFilter('host', 'user-123', 'events')
      expect(filter).toBe('AND (events.created_by = ?)')
    })

    it('uses custom table alias when provided', () => {
      const filter = appendOwnershipFilter('host', 'user-123', 'e')
      expect(filter).toBe('AND (e.created_by = ?)')
    })

    it('uses default table alias "events" when not provided', () => {
      const filter = appendOwnershipFilter('host', 'user-123')
      expect(filter).toBe('AND (events.created_by = ?)')
    })

    it('does NOT include "OR created_by IS NULL" for hosts (backward compat not applied to hosts)', () => {
      const filter = appendOwnershipFilter('host', 'user-123', 'events')
      expect(filter).not.toContain('IS NULL')
    })
  })

  // ─── verifyEventOwnership ─────────────────────────────────────────────

  describe('verifyEventOwnership()', () => {
    let mockDb: D1Database

    beforeEach(() => {
      // Mock D1Database (using Miniflare in integration tests, not unit tests)
      // For unit tests, we can use a simple mock or skip these and rely on integration tests
      // Since verifyEventOwnership is database-dependent, most tests belong in integration
    })

    it('returns true immediately for owner role (no DB query)', async () => {
      // This test verifies the logic without DB
      // In integration tests below, we verify actual DB behavior
      const result = await verifyEventOwnership(mockDb, 'event-1', 'user-123', 'owner')
      // Note: requires actual DB for real test; unit test would mock this
    })

    it('returns true immediately for editor role (no DB query)', async () => {
      // Similar to above
    })

    // Host-specific tests require DB and belong in integration tests (below)
  })
})
```

**Note on testing philosophy:** appendOwnershipFilter() is a pure string-building function with no side effects — it's fully unit-testable with zero setup. verifyEventOwnership() requires database access, so its main tests belong in integration tests below.

**For this file:** Write 6-7 unit tests for appendOwnershipFilter() (covers all 3 roles, table alias variations, no NULL matching for hosts). Keep verifyEventOwnership() tests minimal or skip them here, since they need Miniflare + D1.

**Key assertions:**
- Owner/Editor: empty filter string
- Host: 'AND (table.created_by = ?)' format with correct table alias
- No 'IS NULL' in host filter (correction #1)

**Run command:**
```bash
npm --prefix app run test -- tests/unit/authorization.test.ts
```
  </action>
  <verify>
    <automated>
cd /home/andrey/projects/rsvpex && \
npm --prefix app run typecheck && \
test -f tests/unit/authorization.test.ts && \
grep -q "describe.*appendOwnershipFilter\|describe.*authorization" tests/unit/authorization.test.ts && \
npm --prefix app run test -- tests/unit/authorization.test.ts
    </automated>
  </verify>
  <done>
    - File exists at tests/unit/authorization.test.ts
    - Tests cover appendOwnershipFilter() for owner/editor/host roles
    - Tests verify empty string for owner/editor, 'AND (table.created_by = ?)' for host
    - Tests confirm no 'IS NULL' in host filter (correction #1)
    - Tests verify correct table alias handling
    - Unit tests pass (vitest)
  </done>
</task>

<task type="auto">
  <name>Task 12: Write integration tests for signup route and ownership scoping across routes</name>
  <files>tests/integration/adminSignup.test.ts</files>
  <action>
Create `tests/integration/adminSignup.test.ts` with integration tests for the full signup flow and ownership scoping across multiple routes.

**Test structure (using Miniflare + D1):**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { app } from '../../app/src/index'
import type { HonoRequest } from '../../app/src/index'

describe('adminSignup and ownership scoping (integration)', () => {
  let db: D1Database
  let baseRequest: HonoRequest

  beforeEach(async () => {
    // Set up Miniflare + D1 for each test
    // See existing integration tests for pattern
  })

  // ─── Signup Tests ────────────────────────────────────────────────────

  describe('POST /rsvp/admin/signup', () => {
    it('creates a new host account with valid email and 12+ char password', async () => {
      const response = await app.fetch(
        new Request('http://localhost/rsvp/admin/signup', {
          method: 'POST',
          body: new URLSearchParams({
            email: 'newhost@example.com',
            password: 'ValidPassword123!',
            displayName: 'New Host',
          }),
        }),
        env
      )

      expect(response.status).toBe(302) // Redirect on success
      expect(response.headers.get('Location')).toContain('/rsvp/admin/login')

      // Verify account created in DB
      const user = await db
        .prepare('SELECT role FROM admin_users WHERE email = ?')
        .bind('newhost@example.com')
        .first<{ role: string }>()

      expect(user?.role).toBe('host')
    })

    it('returns 409 when email already exists', async () => {
      // Create first account
      await app.fetch(/* ... */)

      // Try to create second account with same email
      const response = await app.fetch(
        new Request('http://localhost/rsvp/admin/signup', {
          method: 'POST',
          body: new URLSearchParams({
            email: 'newhost@example.com',
            password: 'AnotherPassword123!',
          }),
        }),
        env
      )

      expect(response.status).toBe(409)
      const html = await response.text()
      expect(html).toContain('Email Already in Use')
    })

    it('returns 400 when password is less than 12 characters', async () => {
      const response = await app.fetch(/* ... password: 'short' ... */)
      expect(response.status).toBe(400)
      expect(await response.text()).toContain('12 characters')
    })

    it('stores email in lowercase (case-insensitive)', async () => {
      await app.fetch(
        new Request('http://localhost/rsvp/admin/signup', {
          method: 'POST',
          body: new URLSearchParams({
            email: 'NewHost@EXAMPLE.COM',
            password: 'ValidPassword123!',
          }),
        }),
        env
      )

      const user = await db
        .prepare('SELECT email FROM admin_users WHERE email = ?')
        .bind('newhost@example.com')
        .first()

      expect(user?.email).toBe('newhost@example.com')
    })

    it('is rate-limited to 5 requests per minute per IP', async () => {
      // Send 6 requests rapidly from same IP
      for (let i = 0; i < 6; i++) {
        const response = await app.fetch(/* ... */)
        if (i < 5) {
          expect(response.status).toBeOneOf([200, 302, 400, 409])
        } else {
          // 6th request should be rate-limited
          expect(response.status).toBe(429) // Too Many Requests
        }
      }
    })
  })

  // ─── Ownership Scoping Tests ────────────────────────────────────────

  describe('Ownership scoping across routes', () => {
    let hostAId: string
    let hostBId: string
    let hostAEventId: string
    let ownerSessionId: string

    beforeEach(async () => {
      // Create two hosts
      hostAId = await createHost('hosta@example.com', 'HostA123!')
      hostBId = await createHost('hostb@example.com', 'HostB123!')

      // Create event as Host A
      const eventResponse = await app.fetch(
        new Request('http://localhost/rsvp/admin/events', {
          method: 'POST',
          headers: { Cookie: `session_id=${hostASessionId}` },
          body: new FormData(/* event data */),
        }),
        env
      )
      hostAEventId = extractEventIdFromResponse(eventResponse)

      // Also create owner session for comparison
      ownerSessionId = await loginAsOwner('owner@example.com', 'OwnerPassword123!')
    })

    it('host A sees only their own events in list', async () => {
      const response = await app.fetch(
        new Request('http://localhost/rsvp/admin/events', {
          headers: { Cookie: `session_id=${hostASessionId}` },
        }),
        env
      )

      const html = await response.text()
      expect(html).toContain(hostAEventId)
      // Should NOT contain Host B's event
    })

    it('host B cannot access host A event via GET /events/:id (returns 404)', async () => {
      const response = await app.fetch(
        new Request(`http://localhost/rsvp/admin/events/${hostAEventId}`, {
          headers: { Cookie: `session_id=${hostBSessionId}` },
        }),
        env
      )

      expect(response.status).toBe(404)
    })

    it('host B cannot list host A event RSVPs (returns 404)', async () => {
      const response = await app.fetch(
        new Request(`http://localhost/rsvp/admin/events/${hostAEventId}/rsvps`, {
          headers: { Cookie: `session_id=${hostBSessionId}` },
        }),
        env
      )

      expect(response.status).toBe(404)
    })

    it('host B cannot export host A event (returns 404)', async () => {
      const response = await app.fetch(
        new Request(`http://localhost/rsvp/admin/events/${hostAEventId}/export.csv`, {
          headers: { Cookie: `session_id=${hostBSessionId}` },
        }),
        env
      )

      expect(response.status).toBe(404)
    })

    it('owner still sees all events including legacy NULL-owner events', async () => {
      // Create a legacy event with NULL created_by
      await db.prepare(`
        INSERT INTO events (id, slug, title, created_by)
        VALUES (?, ?, ?, NULL)
      `).bind('legacy-event-1', 'legacy-slug', 'Legacy Event').run()

      const response = await app.fetch(
        new Request('http://localhost/rsvp/admin/events', {
          headers: { Cookie: `session_id=${ownerSessionId}` },
        }),
        env
      )

      const html = await response.text()
      expect(html).toContain(hostAEventId)
      expect(html).toContain('legacy-event-1')
    })

    it('host cannot see legacy NULL-owner events', async () => {
      // Create legacy event
      await db.prepare(`
        INSERT INTO events (id, slug, title, created_by)
        VALUES (?, ?, ?, NULL)
      `).bind('legacy-event-1', 'legacy-slug', 'Legacy Event').run()

      const response = await app.fetch(
        new Request('http://localhost/rsvp/admin/events', {
          headers: { Cookie: `session_id=${hostASessionId}` },
        }),
        env
      )

      const html = await response.text()
      expect(html).not.toContain('legacy-event-1')
      // Should only show events created by this host
    })
  })
})

// Helper functions
async function createHost(email: string, password: string): Promise<string> {
  // Return the created host's ID
}

async function loginAsOwner(email: string, password: string): Promise<string> {
  // Return session ID
}
```

**Key tests:**
- Signup creates host with correct role
- Duplicate email returns 409
- Email stored lowercase
- Rate-limiting enforced
- Host A cannot see/edit Host B's events (returns 404, not 403)
- Host cannot see legacy NULL-owner events
- Owner/Editor can see all events including legacy NULL-owner
- Cross-host access to RSVPs, exports, imports all return 404 for hosts

**Run command:**
```bash
npm --prefix app run test -- tests/integration/adminSignup.test.ts
```

This test file should live in the integration test directory and use Miniflare setup from existing tests as a template.
  </action>
  <verify>
    <automated>
cd /home/andrey/projects/rsvpex && \
npm --prefix app run typecheck && \
test -f tests/integration/adminSignup.test.ts && \
npm --prefix app run test -- tests/integration/adminSignup.test.ts
    </automated>
  </verify>
  <done>
    - File exists at tests/integration/adminSignup.test.ts
    - Tests cover signup route (success, duplicate email 409, password validation, email lowercase, rate-limiting)
    - Tests cover ownership scoping (host cannot see other host's events; owner can see all including legacy NULL-owner)
    - Tests verify 404 responses for cross-host access (not 403)
    - Integration tests pass (vitest + Miniflare + D1)
  </done>
</task>

<task type="auto">
  <name>Task 13: Final validation — typecheck, lint, format, full vitest suite, and wrangler dry-run build</name>
  <files>
    (validation only — no file modifications)
  </files>
  <action>
Run all code quality and build validation checks to ensure the implementation is complete and correct.

**Step 1: TypeScript type checking**
```bash
cd /home/andrey/projects/rsvpex/app && npm run typecheck
```
Expected: No errors. All files modified in tasks 1-10 should typecheck cleanly.

**Step 2: ESLint (linting with @req rule)**
```bash
cd /home/andrey/projects/rsvpex/app && npm run lint
```
Expected: No errors (warnings acceptable if pre-existing). New code should comply with:
- Strict TypeScript rules
- @req JSDoc tag on exported functions (check authorization.ts exports)
- No unused variables or imports

**Step 3: Prettier (format check)**
```bash
cd /home/andrey/projects/rsvpex/app && npm run format:check
```
Expected: All files pass formatting check. If not:
```bash
npm run format
```
to auto-fix formatting, then commit the change.

**Step 4: Unit + Integration test suite (vitest)**
```bash
cd /home/andrey/projects/rsvpex/app && npm run test
```
Expected: All tests pass, including:
- Existing vitest suite (should not regress)
- New authorization.test.ts unit tests (Task 11)
- New adminSignup.test.ts integration tests (Task 12)
- Existing admin route tests should still pass with retrofitted ownership checks

Test output should show:
- ✓ authorization.test.ts (unit tests)
- ✓ adminSignup.test.ts (integration tests)
- ✓ All existing admin route tests (no regressions)

**Step 5: Wrangler build (dry-run)**
```bash
cd /home/andrey/projects/rsvpex/app && npx wrangler deploy --dry-run
```
Expected: Build succeeds with no errors. Output should show:
- Uploading Workers script
- D1 database configured
- All bindings (DB, KV, Queues) recognized

This proves the codebase compiles and all configurations are valid.

**Step 6: Final smoke test (optional but recommended)**
```bash
# Start local dev server
cd /home/andrey/projects/rsvpex/app && npm run dev

# In another terminal, test signup route
curl -X GET http://localhost:8787/rsvp/admin/signup
# Should return 200 with form HTML

curl -X POST http://localhost:8787/rsvp/admin/signup \
  -d "email=test@example.com&password=TestPassword123&displayName=Test" \
  -L
# Should redirect to login (302) or show duplicate email message
```

**Success criteria:**
- ✅ npm run typecheck: no errors
- ✅ npm run lint: no errors (warnings allowed if pre-existing)
- ✅ npm run format:check: all files pass formatting
- ✅ npm run test: all tests pass (unit + integration)
- ✅ wrangler deploy --dry-run: build succeeds
- ✅ Dev server starts and routes respond

All 6 checks must pass before marking task complete.
  </action>
  <verify>
    <automated>
cd /home/andrey/projects/rsvpex && \
npm --prefix app run typecheck && \
npm --prefix app run lint && \
npm --prefix app run format:check && \
npm --prefix app run test && \
npm --prefix app exec -- wrangler deploy --dry-run
    </automated>
  </verify>
  <done>
    - TypeScript typecheck passes with no errors
    - ESLint linting passes with no errors
    - Prettier formatting check passes
    - Full vitest suite passes (unit + integration tests)
    - Wrangler build (dry-run) succeeds
    - All migration, schema, authorization, signup, retrofit, and UI changes integrated and validated
    - Ready for deployment
  </done>
</task>

</tasks>

<verification>
After all 13 tasks are complete, verify the feature end-to-end:

1. **Schema & Migration:**
   - [ ] Migration 0006_*.sql exists and adds created_by column + index
   - [ ] schema.ts role enum includes 'host'
   - [ ] No TypeScript errors

2. **Authorization Domain Module:**
   - [ ] authorization.ts exists with appendOwnershipFilter() and verifyEventOwnership()
   - [ ] appendOwnershipFilter() returns '' for owner/editor, 'AND (table.created_by = ?)' for host
   - [ ] verifyEventOwnership() uses strict equality (===) for host ownership checks, no NULL matching
   - [ ] Unit tests pass

3. **Public Signup Route:**
   - [ ] GET /rsvp/admin/signup returns signup form (public, no auth)
   - [ ] POST /rsvp/admin/signup creates host account with role='host'
   - [ ] Email stored lowercase
   - [ ] Duplicate email returns 409
   - [ ] Password hashing uses hashPassword(password, pepper)
   - [ ] Rate-limiting applied (5 req/min/IP)
   - [ ] Integration tests pass

4. **Ownership Retrofitting (All 6 Routes):**
   - [ ] adminDashboard.ts: Stats queries filtered by ownership for hosts
   - [ ] adminEvents.ts: List/get/create/update/publish/archive verify ownership
   - [ ] adminRsvps.ts: All RSVP routes verify event ownership
   - [ ] adminData.ts: Export/import verify event ownership
   - [ ] adminQr.ts: QR render verifies ownership
   - [ ] adminManagement.ts: Admin list excludes hosts (WHERE role IN ('owner', 'editor'))
   - [ ] All routes: Ownership failures return 404 (not 403)

5. **Home Page Navigation:**
   - [ ] index.html has nav with "Sign Up as Host" and "Admin Login" links
   - [ ] Links point to /rsvp/admin/signup and /rsvp/admin/login
   - [ ] NO client-side session detection or hidden "My Events" link
   - [ ] css/main.css styles nav (flexbox, responsive)

6. **Test Coverage:**
   - [ ] Unit tests for authorization helpers (6+ tests)
   - [ ] Integration tests for signup flow (duplicate email, rate-limiting, etc.)
   - [ ] Integration tests for ownership scoping (host cannot see other host's events, owner sees all)
   - [ ] All tests pass

7. **Build & Validation:**
   - [ ] TypeScript typecheck passes
   - [ ] ESLint passes
   - [ ] Prettier format check passes
   - [ ] Full vitest suite passes
   - [ ] Wrangler deploy --dry-run succeeds

**Feature-level behavior check (manual or via E2E):**
- [ ] New user signs up as host at /rsvp/admin/signup
- [ ] Host logs in, sees empty event list (no events yet)
- [ ] Host creates event (created_by set to their id)
- [ ] Host edits their event: succeeds
- [ ] Host lists RSVPs for their event: succeeds
- [ ] Host exports/imports their event data: succeeds
- [ ] Host A tries to access Host B's event: returns 404
- [ ] Owner logs in, sees all events (including legacy NULL-owner events)
- [ ] Owner can manage any event without ownership restriction
</verification>

<success_criteria>
Implementation is complete and correct when:

1. **All 13 tasks pass** — Each task's <verify> command runs successfully
2. **Backward compatibility maintained** — Owner/Editor role sees all events unchanged; no regressions in existing functionality
3. **Security properties preserved:**
   - Hosts cannot see other hosts' events (404 response, not 403, to avoid leaking existence)
   - Hosts do NOT see legacy NULL-owner events (strict equality check, no NULL match)
   - Session cookie remains httpOnly (no client-side JS can read it)
4. **Full test coverage:** Unit + integration tests cover new signup flow and ownership scoping across all 6 retrofitted routes
5. **Code quality:** TypeScript, ESLint, Prettier, and Wrangler build all pass cleanly
6. **Feature ready:** Users can self-register as hosts, create/manage their own events, with no friction (no invite codes required)

**Blockers if NOT met:**
- Ownership check returns 403 instead of 404 → Fix: return c.notFound() not c.forbidden()
- Hosts see legacy NULL-owner events → Fix: Remove 'OR created_by IS NULL' from appendOwnershipFilter for hosts
- Client-side session detection JS exists → Fix: Delete the JS, show static nav links always
- Test suite fails → Fix: Run npm test to identify and fix failing tests before deployment
- Wrangler dry-run fails → Fix: TypeScript or binding errors; run typecheck and inspect error messages
</success_criteria>

<output>
After all tasks complete and verification passes, commit work:

```bash
cd /home/andrey/projects/rsvpex && \
git add -A && \
git commit -m "feat(260710-uuh): add public self-service host registration & event ownership scoping

- Add 'host' role to admin_users: self-registered users who manage own events only
- Add events.created_by column (nullable) + index for ownership tracking
- Create src/domain/authorization.ts: appendOwnershipFilter() and verifyEventOwnership() — single source of truth
- Create public signup route POST/GET /rsvp/admin/signup (rate-limited, case-insensitive email, 409 on duplicate)
- Retrofit 6 admin routes with ownership verification: adminDashboard, adminEvents, adminRsvps, adminData, adminQr, adminManagement
- Update home page navigation with signup/login links (static nav, no client-side session detection)
- Add unit tests for authorization helpers + integration tests for signup & ownership scoping
- Backward compatibility: Owner/Editor still see all events including legacy NULL-owner events
- Security: Ownership checks return 404 (not 403); hosts never see NULL-owner legacy events

Corrections applied to research:
1. verifyEventOwnership() for hosts uses strict equality (event.created_by === adminUserId), no NULL matching
2. Home page shows static nav (no client-side session detection via httpOnly cookie reading)

Validation: typecheck ✓, lint ✓, format ✓, vitest ✓, wrangler dry-run ✓"
```

Create `.planning/quick/260710-uuh-add-public-self-service-host-registratio/260710-uuh-SUMMARY.md` after execution completes:

```markdown
# Quick Task 260710-uuh: Public Self-Service Host Registration — Summary

**Status:** Complete  
**Date:** 2026-07-10  
**Branch:** (merge branch name here after execution)

## What Was Built

### New Features
- **Public host signup** (no invite code required): `/rsvp/admin/signup` GET/POST with rate-limiting
- **Event ownership scoping:** Hosts see only their own events; Owner/Editor retain global visibility
- **Home page navigation:** Links to signup and login (static nav, always visible)
- **New 'host' role:** Extends admin_users.role enum; hosts manage own events only

### Files Created
- `migrations/0006_add_event_ownership_and_host_role.sql` — Add created_by column + index
- `app/src/domain/authorization.ts` — Ownership helpers (appendOwnershipFilter, verifyEventOwnership)
- `app/src/routes/adminSignup.ts` — Public signup route
- `tests/unit/authorization.test.ts` — Unit tests for authorization helpers
- `tests/integration/adminSignup.test.ts` — Integration tests for signup & ownership scoping

### Files Modified
- `app/src/db/schema.ts` — Extend role enum to ['owner', 'editor', 'host']
- `app/src/routes/adminDashboard.ts` — Add ownership filter to stats queries
- `app/src/routes/adminEvents.ts` — Add ownership checks to all CRUD routes
- `app/src/routes/adminRsvps.ts` — Add ownership verification to RSVP routes
- `app/src/routes/adminData.ts` — Add ownership checks to export/import
- `app/src/routes/adminQr.ts` — Add ownership verification
- `app/src/routes/adminManagement.ts` — Filter admin list (exclude hosts)
- `static-web/index.html` — Add signup/login nav links
- `static-web/css/main.css` — Style nav links

## Key Design Decisions

1. **Ownership model:** events.created_by (nullable TEXT, indexed) tracks host ownership
2. **Authorization domain layer:** Single source of truth (authorization.ts) for ownership checks — testable without HTTP context
3. **Backward compatibility:** Legacy events with created_by=NULL visible to Owner/Editor, invisible to hosts (strict equality check)
4. **Security posture:** Ownership failures return 404 (not 403) to avoid revealing event existence
5. **Nav simplicity:** Static nav (no client-side session detection) — httpOnly cookie cannot be read by JS anyway

## Corrections Applied

**Correction #1:** verifyEventOwnership() for hosts uses strict equality (===), not NULL matching
- Research doc proposed: `event.created_by === adminUserId || event.created_by === null`
- Applied: `event.created_by === adminUserId` only
- Result: Hosts NEVER see legacy NULL-owner events

**Correction #2:** Home page shows static nav, no client-side session detection
- Research doc proposed: Read document.cookie to conditionally show "My Events" vs "Sign Up/Login"
- Applied: Removed all JS; nav always shows "Sign Up" and "Admin Login" (both work for any session state)
- Reason: httpOnly cookie cannot be read by JavaScript (deliberate security property)

## Test Coverage

- **Unit tests:** appendOwnershipFilter() and verifyEventOwnership() helpers (6+ tests)
- **Integration tests:** Signup flow (success, duplicate email 409, rate-limiting, lowercase email), ownership scoping (host cannot see other host's events, owner sees all including legacy)
- **Route tests:** All 6 retrofitted routes tested for ownership verification

## Validation Results

- ✅ TypeScript typecheck: 0 errors
- ✅ ESLint: 0 errors
- ✅ Prettier format check: all files pass
- ✅ Vitest (unit + integration): all tests pass
- ✅ Wrangler deploy --dry-run: succeeds

## Deployment Notes

- Migration 0006_*.sql must run before the app starts (wrangler handles this)
- New signup route is public (no auth required) — no environment variables needed
- Rate-limiting uses existing adminAuthRateLimit() middleware
- All retrofitted routes maintain backward compatibility (no breaking changes for Owner/Editor)

## Future Enhancements (Not in Scope)

- Host password reset (can use existing /rsvp/admin/password-reset)
- Host profile page (e.g., /rsvp/admin/host/profile)
- Host deactivation workflow
- Invite-based host provisioning (if needed in future)
```

Then return: ## PLANNING COMPLETE with file path to the plan.
</output>

---

## PLANNING COMPLETE

**Plan created:** `.planning/quick/260710-uuh-add-public-self-service-host-registratio/260710-uuh-PLAN.md`

**Summary:**

I've created a focused, 13-task plan for adding public self-service host registration with strict event ownership scoping. The plan applies the two critical corrections from the constraints:

### Corrections Applied

1. **`verifyEventOwnership()` logic (CRITICAL):** For hosts, uses **strict equality only** (`event.created_by === adminUserId`), with NO NULL matching. This ensures legacy events with `created_by = NULL` are never visible to hosts — they belong to Owner/Editor only.

2. **Home page session detection (CRITICAL):** Dropped all client-side JS that attempts to read `document.cookie`. The session cookie is `httpOnly: true` (security property S-15), so JavaScript cannot read it anyway. Home page shows static "Sign Up as Host" and "Admin Login" links always.

### Task Structure (4 Waves, 13 Tasks)

**Wave 1 — Foundation (2 tasks):**
- Task 1: Create migration 0006 + extend schema.ts (created_by column, 'host' role enum)
- Task 2: Create authorization.ts domain module (ownership helpers, unit-testable)

**Wave 2 — Public Signup (1 task):**
- Task 3: Create `/rsvp/admin/signup` route (GET form + POST handler, rate-limited, 409 on duplicate)

**Wave 3 — Route Retrofitting (6 tasks):**
- Task 4: adminDashboard.ts (ownership-filtered stats)
- Task 5: adminEvents.ts (ownership checks on list/get/create/update/publish/archive)
- Task 6: adminRsvps.ts (ownership checks on all RSVP routes)
- Task 7: adminData.ts (ownership checks on export/import)
- Task 8: adminQr.ts (ownership check on QR render)
- Task 9: adminManagement.ts (filter hosts from admin list)

**Wave 4 — UI & Testing (4 tasks):**
- Task 10: Home page navigation (signup/login links, static nav)
- Task 11: Unit tests for authorization.ts helpers
- Task 12: Integration tests for signup + ownership scoping
- Task 13: Final validation (typecheck, lint, format, vitest, wrangler dry-run)

### Key Features

- ✅ Hosts self-register without invite codes
- ✅ Event ownership tracking (events.created_by)
- ✅ Hosts see ONLY their own events (404 on cross-host access, not 403)
- ✅ Owner/Editor retain global visibility (including legacy NULL-owner events)
- ✅ Hosts don't appear in admin list
- ✅ Full test coverage (unit + integration)
- ✅ All code quality checks included (typecheck, lint, format, vitest, build)

The plan is self-contained, autonomous, and ready to execute end-to-end.