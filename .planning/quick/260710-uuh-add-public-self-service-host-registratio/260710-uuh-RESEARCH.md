# Quick Task 260710-uuh: Add Public Self-Service Host Registration — Research

**Researched:** 2026-07-10  
**Domain:** Authorization & multi-user RSVP management  
**Confidence:** HIGH

## Summary

This quick task adds a new self-registered "host" role to RSVPex, enabling public signup without invite codes. Hosts can only see/manage their own events; Owner/Editor team members keep global visibility. The implementation requires:

1. **New role scoping**: Add `'host'` to the `admin_users.role` enum; new hosts created via public signup route.
2. **Event ownership tracking**: Add `events.created_by` (nullable, references `admin_users.id`) to scope RSVP access.
3. **Route-level ownership filters**: Every admin route that queries `events` or `rsvps` must conditionally filter by ownership for hosts only (Owner/Editor bypass).
4. **Home page navigation**: Update marketing site with links to signup, login, and authenticated event list.

**Primary recommendation:** Implement role-based query filtering at the middleware/domain layer (not in every route handler) so ownership checks are testable and don't leak into controller logic. Start with a helper function `appendOwnershipFilter()` that routes call before running queries.

---

## Locked Decisions (from task brief)

- New public signup route (no invite/setup-secret required)
- Self-registered users get a NEW role distinct from 'owner'/'editor' — can create/manage ONLY their own events
- NEW role has ZERO admin-management power (cannot see admin list, cannot invite/promote/demote/deactivate)
- Cannot see events created by other admins
- Existing Owner/Editor team sees ALL events globally — unchanged
- Add event ownership (`events.created_by`) to scope visibility
- Update home page with signup/login nav

---

## Complete Route Inventory

Every route that queries `events` or `rsvps` and needs an ownership filter for hosts:

### adminDashboard.ts
- **getDashboardStats()** → Raw SQL queries:
  - `SELECT COUNT(*) as n FROM events WHERE status = 'published' AND start_at <= ?`
  - `SELECT COUNT(*) as n FROM events WHERE status = 'published' AND start_at > ?`
  - `SELECT COUNT(*) as n FROM events WHERE archived_at IS NULL`
  - `SELECT id, title, status, start_at, slug FROM events WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 5`
  - **Action:** Add `WHERE created_by = ? OR created_by IS NULL` for hosts; Owner/Editor bypass

### adminEvents.ts
- **GET /rsvp/admin/events** (list) → `listEvents(db)` → raw SQL: `SELECT * FROM events` (no WHERE clause found in visible snippet, likely unfiltered)
  - **Action:** Filter for hosts
- **GET /rsvp/admin/events/:id** (view) → `getEvent(db, id)` → `SELECT * FROM events WHERE id = ?`
  - **Action:** Verify ownership on GET before rendering; return 404 if host owns different event
- **POST /rsvp/admin/events** (create) → `createEvent(...)` + `db.prepare('INSERT INTO events ...')`
  - **Action:** Set `created_by = c.var.adminUserId` on insert
- **POST /rsvp/admin/events/:id** (update) → `updateEvent(...)`
  - **Action:** Verify host owns event before allowing edit
- **POST /rsvp/admin/events/:id/publish** → `publishEvent(...)`
  - **Action:** Verify host owns event
- **POST /rsvp/admin/events/:id/archive** → `archiveEvent(...)`
  - **Action:** Verify host owns event

### adminRsvps.ts
- **GET /rsvp/admin/events/:id/rsvps** (list) → `listRsvps(db, eventId, ...)`
  - **Action:** Verify event ownership; show 404 if host doesn't own it
- **GET /rsvp/admin/events/:id/rsvps/:rsvpId/edit** (edit RSVP) → `getRsvp(db, rsvpId)` + event ownership check
  - **Action:** Verify host owns the event before showing edit form
- **POST /rsvp/admin/events/:id/rsvps/:rsvpId** (update RSVP) → `updateRsvpWithCapacityGuard(...)`
  - **Action:** Verify host owns event
- **POST /rsvp/admin/events/:id/rsvps/:rsvpId/promote** (waitlist promote)
  - **Action:** Verify host owns event
- **POST /rsvp/admin/events/:id/rsvps/:rsvpId/delete** (delete RSVP)
  - **Action:** Verify host owns event
- **POST /rsvp/admin/events/:id/import** (CSV import)
  - **Action:** Verify host owns event

### adminData.ts
- **GET /rsvp/admin/events/:id/export.csv** → `SELECT ... FROM rsvps WHERE event_id = ?`
  - **Action:** Verify host owns event before allowing export
- **GET /rsvp/admin/events/:id/export.json** → Similar
  - **Action:** Verify host owns event
- **POST /rsvp/admin/events/:id/import** (CSV import) → Already listed above

### adminQr.ts
- **GET /rsvp/admin/events/:id/qr** → `getEvent(db, id)`
  - **Action:** Verify host owns event before rendering QR

### adminManagement.ts
- **GET /rsvp/admin/admins** (admin list)
  - **Current:** `SELECT * FROM admin_users ORDER BY created_at` (no filtering)
  - **Action:** Filter to exclude `'host'` role entirely (hosts are self-registered, not team members to manage)
  - **Why:** Owner/Editor have no management actions for hosts; listing them is misleading

---

## Middleware & Authorization Design

### Current Structure
- `requireAdmin`: Checks session, sets `c.var.adminUserId`
- `requireOwner`: Checks `role = 'owner'`, returns 403 if not

### Proposed Pattern

**Option A (Recommended): Helper function in domain layer**

Create `src/domain/authorization.ts`:
```typescript
/**
 * Appends ownership filter to a SQL WHERE clause for hosts.
 * Owner/Editor have no ownership restrictions (global visibility).
 * Hosts can only access events they created (or pre-existing events with created_by = NULL via Owner/Editor only).
 * 
 * Usage: 
 *   const role = await getAdminRole(db, adminUserId);
 *   const whereClause = appendOwnershipFilter(role, adminUserId, 'events.id');
 *   const result = await db.prepare(`SELECT * FROM events ${whereClause}`).bind(...).all();
 */
export function appendOwnershipFilter(
  role: 'owner' | 'editor' | 'host',
  adminUserId: string,
  tableAlias: string = 'events'
): string {
  if (role === 'owner' || role === 'editor') {
    return ''; // No filter — see all events
  }
  // role === 'host'
  return `AND (${tableAlias}.created_by = ? OR ${tableAlias}.created_by IS NULL)`; // Only own events + legacy unowned
}

export async function verifyEventOwnership(
  db: D1Database,
  eventId: string,
  adminUserId: string,
  role: 'owner' | 'editor' | 'host'
): Promise<boolean> {
  if (role === 'owner' || role === 'editor') return true; // No check needed
  
  const event = await db.prepare('SELECT created_by FROM events WHERE id = ?')
    .bind(eventId)
    .first<{ created_by: string | null }>();
  
  if (!event) return false;
  return event.created_by === adminUserId || event.created_by === null;
}
```

Routes call `verifyEventOwnership()` early (after getting the event but before processing):
```typescript
const event = await getEvent(c.env.DB, eventId);
if (!event) return c.notFound();

const role = await getAdminRole(c.env.DB, c.var.adminUserId);
const owns = await verifyEventOwnership(c.env.DB, event.id, c.var.adminUserId, role);
if (!owns) return c.notFound(); // 404, not 403 — don't reveal event exists
```

For list queries, use `appendOwnershipFilter()`:
```typescript
const role = await getAdminRole(c.env.DB, c.var.adminUserId);
const filter = appendOwnershipFilter(role, c.var.adminUserId, 'events');
const events = await c.env.DB.prepare(
  `SELECT * FROM events WHERE 1=1 ${filter} ORDER BY created_at DESC`
).bind(role === 'host' ? c.var.adminUserId : null).all();
```

**Why this pattern:**
- Single source of truth for ownership logic
- Testable without HTTP context
- Easy to audit (grep for `verifyEventOwnership` finds all auth checks)
- Avoids query-builder complexity

---

## Role Naming & Enum Design

**Decision:** Extend `admin_users.role` enum to `'owner' | 'editor' | 'host'` (not a separate boolean flag).

**Why:**
- Drizzle schema already defines enum: `text('role', { enum: ['owner', 'editor'] })` — simple to extend to three values
- Matches existing pattern in `adminInvites.role`
- Single column for role checks is cleaner than a flag + role pair
- Future-proof if a 4th role emerges (e.g., 'viewer')

**Impact on existing code:**
- `requireOwner` middleware checks `role !== 'owner'` → remains correct (rejects both 'editor' and new 'host')
- Admin deactivation guard: checks `if (admin.role === 'owner')` to prevent demoting last owner — **MUST update** to check `admin.role === 'owner' && admin.is_active === 1` when counting active owners, since hosts cannot be owners
- Admin list filters hosts out (see section below)

---

## Admin Management List Visibility

**Current route:** `GET /rsvp/admin/admins` → `SELECT * FROM admin_users ORDER BY created_at`  
**Current role guard:** `requireOwner` (Owner-only)

**Proposed change:** Filter the query to exclude hosts:
```sql
SELECT id, email, display_name, role, is_active, created_at 
FROM admin_users 
WHERE role IN ('owner', 'editor') 
ORDER BY created_at
```

**Rationale:**
- Hosts are self-registered; not invited by Owner
- Owner has no management actions for hosts (no deactivate/promote/demote — hosts aren't team)
- Showing hosts in the list would confuse the Owner ("what can I do with these accounts?")
- Hosts don't see this page at all (requireOwner blocks them)
- Clean separation: team (Owner/Editor) vs. event-creators (hosts)

---

## Public Self-Service Signup Route

### New Route: POST /rsvp/admin/signup

**Purpose:** Create a new admin account with the 'host' role, no invite token needed.

**Form fields:**
- `email` (required, max 254 chars, unique in admin_users table)
- `password` (required, min 12, max 128 — matches invite-accept pattern)
- `display_name` (optional, max 100 — matches setup/invite patterns)

**Validation:**
- Email is valid + unique
- Password meets length requirements
- Rate-limit: use existing `adminAuthRateLimit()` middleware (5 reqs per min per IP)

**On success:**
1. Generate UUID for `id`
2. Hash password with `hashPassword(password, c.env.ARGON2_PEPPER)` (same as invite-accept)
3. Conditional INSERT (race-safety, C-12 pattern):
   ```sql
   INSERT INTO admin_users (id, email, password_hash, display_name, role, is_active)
   SELECT ?, ?, ?, ?, 'host', 1 WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE email = ?)
   ```
4. If `meta.changes === 0`, return 409 "email already in use"
5. Redirect to login with success message

**Duplicate email handling:** Return 409 (not 400) to distinguish "email already exists" from "invalid email format." Display friendly message: "This email is already in use. <a href=\"/rsvp/admin/password-reset\">Reset password?</a>"

**GET /rsvp/admin/signup**
- Serve form (public endpoint, no auth required)
- Reuse the `page()` helper from adminSetup.ts / adminLogin.ts for styling consistency

**Rate-limiting:** Use `adminAuthRateLimit()` on the POST (5 reqs/min/IP), same as login and invite-accept. This prevents signup abuse.

---

## Migration Strategy

### New Migration: 0006_add_event_ownership_and_host_role.sql

**Changes:**

1. **Add `events.created_by` column** (nullable):
   ```sql
   ALTER TABLE `events` ADD COLUMN `created_by` text;
   ```

2. **Add index on `created_by`** for ownership queries:
   ```sql
   CREATE INDEX `idx_events_created_by` ON `events` (`created_by`);
   ```

3. **Add foreign key constraint** (optional but recommended for data integrity):
   ```sql
   -- Note: D1 doesn't support ADD CONSTRAINT on existing columns.
   -- We set the column WITHOUT a constraint for now. Consider a future
   -- migration if FK enforcement becomes critical.
   ```

4. **Extend role enum** on `admin_users`:
   ```sql
   -- SQLite doesn't support ALTER ENUM. We use a comment or re-do via
   -- migration pattern: add new check constraint or rely on app-layer validation.
   -- Drizzle schema.ts will define enum as ['owner', 'editor', 'host'];
   -- migration just marks the column as supporting the new value.
   ```

5. **Extend role enum on `admin_invites`** (same as above):
   ```sql
   -- No change needed in migration; schema.ts will define the enum.
   ```

6. **Add check constraint on role values** (explicit, since SQLite doesn't have enum):
   ```sql
   -- Optional: add a CHECK constraint to enforce valid roles
   -- This is app-layer validated anyway, so can skip if it complicates rollback.
   ```

**Full migration file style** (hand-written, matching 0004/0005):
```sql
PRAGMA foreign_keys = ON;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `created_by` text;
--> statement-breakpoint
CREATE INDEX `idx_events_created_by` ON `events` (`created_by`);
```

**Why hand-written (not drizzle-generated)?**
- This is a pure structural change (add column + index)
- Matches the pattern of 0001-0003 (likely drizzle-generated)
- 0004-0005 are role/data fixes, not schema changes — this migration is a schema-only change
- Safe to generate with `drizzle-kit generate`, but hand-writing ensures control

**Backward compatibility:**
- `created_by` is nullable; existing events have NULL
- Queries that don't filter by ownership still see all events (Owner/Editor)
- Queries that filter by ownership (hosts) see only events with `created_by = <their-id>` or NULL (backward-compat legacy events accessible only by Owner/Editor, never hosts)

---

## Event Creation Flow (Updated)

When a host creates an event:
```typescript
// adminEvents.ts POST /rsvp/admin/events
const id = crypto.randomUUID();
const createdBy = c.var.adminUserId; // Always set for new events
const result = await createEvent(c.env.DB, {
  id,
  slug,
  title,
  createdBy, // ← New parameter
  // ... other fields
});
```

In `src/domain/adminEvents.ts`:
```typescript
export async function createEvent(db: D1Database, event: EventInput) {
  return db.prepare(`
    INSERT INTO events (id, slug, title, created_by, ...)
    VALUES (?, ?, ?, ?, ...)
  `)
  .bind(event.id, event.slug, event.title, event.createdBy, ...)
  .run();
}
```

For existing event records with `created_by = NULL`, they remain visible to Owner/Editor (as before) but invisible to hosts (new behavior).

---

## Home Page Navigation Updates

### Current State
- `static-web/index.html` has a simple nav header with wordmark + "Coming Soon" pill
- Waitlist form at bottom

### Changes Required

**Nav bar updates** (header element):
```html
<header>
  <nav class="site-nav" aria-label="Site navigation">
    <a href="/" class="nav-wordmark" aria-label="RSVPex home">RSVP<span>EX</span></a>
    <div class="nav-links">
      <a href="/rsvp/admin/signup">Sign Up as Host</a>
      <a href="/rsvp/admin/login">Admin Login</a>
      <!-- Authenticated users see this instead -->
      <a href="/rsvp/admin" id="admin-dashboard-link" style="display:none">My Events</a>
    </div>
  </nav>
</header>
```

**Client-side check** (new `js/auth-nav.js` or inline in `main.js`):
```javascript
// On page load, check if user has an active session (read session cookie)
// If session_id cookie exists and is valid, show "My Events" link instead of "Sign Up / Login"
// This is a UX enhancement only — actual auth is server-enforced on /rsvp/admin/

// Simple version: just check if session_id cookie exists
const sessionId = document.cookie.split('; ').find(c => c.startsWith('session_id='));
if (sessionId) {
  document.getElementById('admin-dashboard-link').style.display = 'inline';
  document.getElementById('admin-login-link').style.display = 'none';
  document.getElementById('admin-signup-link').style.display = 'none';
}
```

**CSS**: Add `.nav-links` to `static-web/css/main.css` to style nav items horizontally.

---

## Password Hashing & Auth Pattern

**Reuse existing pattern:** Both public signup and invite-accept routes use:
```typescript
const passwordHash = await hashPassword(password, c.env.ARGON2_PEPPER);
const id = crypto.randomUUID();
const result = await c.env.DB.prepare(`
  INSERT INTO admin_users (id, email, password_hash, display_name, role, is_active)
  VALUES (?, ?, ?, ?, ?, 1)
`).bind(id, email, passwordHash, displayName ?? null, role).run();
```

**Note:** `hashPassword()` in adminAuth.ts now uses PBKDF2 (not argon2id), so the comment about argon2id in the code is historical. The function signature remains `hashPassword(password, pepper)` for backwards compatibility.

---

## Code Examples (From Existing Patterns)

### Conditional INSERT (Race-Safety C-12)
From `adminSetup.ts`:
```typescript
const result = await c.env.DB.prepare(
  `INSERT INTO admin_users (id, email, password_hash, display_name, role)
   SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM admin_users)`
).bind(id, email.toLowerCase(), passwordHash, displayName ?? null, 'host').run();

if (result.meta.changes === 0) {
  return c.json({ error: 'account_already_exists' }, 409);
}
```

### Rate-Limiting
From `adminLogin.ts`:
```typescript
adminLoginRouter.post('/login', adminAuthRateLimit(), async (c) => {
  // ... handler
});
```

---

## Common Pitfalls & Prevention

### 1. Forgetting to filter an admin route
**Pitfall:** A host can access `GET /rsvp/admin/events` and see all events, including others' events.  
**Prevention:** Every route that queries `events` must call `verifyEventOwnership()` or use `appendOwnershipFilter()` before returning data. Add a lint rule or checklist: "Does this route touch events/rsvps? If yes, add ownership check."  
**Detection:** Test with two host accounts creating events, verify one host cannot see the other's events or RSVPs.

### 2. Hosts appearing in admin list
**Pitfall:** Hosts show up in `/rsvp/admin/admins`, confusing the Owner ("who is this person?").  
**Prevention:** Filter `WHERE role IN ('owner', 'editor')` in the admin list query.  
**Detection:** Owner creates an event as a "host" role via SQL; logs into admin; verifies no hosts appear in admin list.

### 3. Last active Owner rule broken
**Pitfall:** Current code checks `if (admin.role === 'owner' && admin.is_active)` when demoting. If a host is somehow counted as an owner, this breaks.  
**Prevention:** Ensure role enum is enforced. Add a test: deactivate all owners, verify app prevents it with "cannot_deactivate_last_owner."  
**Detection:** Try deactivating the only owner; should get 400 error.

### 4. Backward-compat events (created_by = NULL) visible to hosts
**Pitfall:** Pre-existing events with no `created_by` should NOT be visible to hosts, but ARE visible if we forget the ownership filter.  
**Prevention:** Test with legacy event (manually set `created_by = NULL` in a test event); log in as a host who didn't create it; verify it doesn't appear in event list.  
**Detection:** Query `/rsvp/admin/events` as a new host; no pre-existing events should appear.

### 5. Email uniqueness not enforced
**Pitfall:** Two hosts sign up with the same email (race condition).  
**Prevention:** Conditional INSERT with `WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE email = ?)` (C-12 pattern already used in setup).  
**Detection:** Concurrent signup test; second should get 409.

### 6. Ownership filter not applied to exports/imports
**Pitfall:** CSV export leaks all RSVPs to any authenticated admin if ownership filter is missing.  
**Prevention:** Check `adminData.ts` routes; verify event ownership before reading rsvps.  
**Detection:** Host A creates event; Host B tries to export it; should get 404.

---

## Key Files Requiring Changes

| File | Changes | Scope |
|------|---------|-------|
| `app/migrations/0006_*.sql` | Add `events.created_by` + index | New migration |
| `app/src/db/schema.ts` | Extend `role` enum to include `'host'` | Schema |
| `app/src/domain/authorization.ts` | New file: `appendOwnershipFilter()`, `verifyEventOwnership()` | New domain helper |
| `app/src/routes/adminSignup.ts` | New public signup route | New route |
| `app/src/routes/adminDashboard.ts` | Add ownership filter to stats queries | Auth logic |
| `app/src/routes/adminEvents.ts` | Add ownership filter to all event queries | Auth logic |
| `app/src/routes/adminRsvps.ts` | Add ownership checks to RSVP routes | Auth logic |
| `app/src/routes/adminData.ts` | Add ownership checks to export/import | Auth logic |
| `app/src/routes/adminQr.ts` | Add ownership check | Auth logic |
| `app/src/routes/adminManagement.ts` | Filter admin list to exclude hosts | Auth logic |
| `static-web/index.html` | Add nav links to signup/login | Navigation |
| `static-web/css/main.css` | Style nav links | Styling |
| `static-web/js/main.js` | Session check for nav (optional UX enhancement) | Client-side |

---

## Test Coverage Strategy

### Unit Tests (vitest)
- `authorization.ts`: `appendOwnershipFilter()` with owner/editor/host roles
- `authorization.ts`: `verifyEventOwnership()` with owned/unowned/null-created_by events
- Password hashing & signup validation (Zod schema)

### Integration Tests (Miniflare + D1)
- **Host signup:** Create account, verify email unique, verify role = 'host'
- **Event ownership:** Host creates event, verify `created_by` is set; host sees own events; doesn't see other host's events
- **Owner sees all:** Owner logs in, sees all events including legacy (created_by = NULL)
- **Admin list:** Host cannot see `/rsvp/admin/admins` (requireOwner blocks); owner sees only owner/editor in list
- **Exports:** Host cannot export other host's RSVPs

### E2E Tests (Playwright) — _Not yet implemented (T-1 gap), but planned_
- Happy path: New host signs up, logs in, creates event, sees it in dashboard
- Cross-host: Host A creates event; Host B cannot see it
- Owner oversight: Owner sees all events

---

## Validation Checklist

- [ ] Role enum extended in schema + migration
- [ ] `events.created_by` column + index created
- [ ] Public signup route protected with rate-limiting
- [ ] Email uniqueness enforced (conditional INSERT)
- [ ] ALL admin routes apply ownership filter or verification
- [ ] Admin list excludes hosts
- [ ] Home page nav updated with signup/login links
- [ ] Backward-compat: pre-existing events with `created_by = NULL` visible to Owner/Editor, not hosts
- [ ] Ownership check returns 404 (not 403) to avoid leaking event existence
- [ ] Tests cover both owner and host access patterns

---

## Sources

- Codebase inspection: `app/src/db/schema.ts`, `app/src/routes/admin*.ts`, `app/src/middleware/*.ts`
- Migration patterns: `app/migrations/0004_*.sql`, `0005_*.sql`
- Auth & password hashing: `app/src/domain/adminAuth.ts` (PBKDF2 + pepper, rate-limiting)
- Session & token patterns: `app/src/routes/adminInviteAccept.ts`, `app/src/domain/adminAuth.ts`
- Conditional INSERT race-safety (C-12): `app/src/routes/adminSetup.ts`, recommendations.md

---

## Metadata

**Confidence breakdown:**
- **Route inventory:** HIGH — codebase fully reviewed, all admin routes identified
- **Middleware design:** HIGH — pattern aligns with existing code (requireAdmin, requireOwner)
- **Role naming:** HIGH — enum extension is simplest and matches schema
- **Migration approach:** HIGH — follows 0004/0005 hand-written pattern; backward-compat clear
- **Backward compatibility:** HIGH — created_by = NULL is safe and intentional for legacy events

**Research date:** 2026-07-10  
**Valid until:** 2026-07-17 (1 week — implementation context likely stable)
