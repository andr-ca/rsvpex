# Phase 6: Data Management - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 delivers admin export and import capabilities for guest lists. The host can download all RSVPs as a UTF-8 CSV (safe for caterers), download a JSON export with optional RSVP tokens (gated by session freshness), and upload a CSV to bulk-import guests with per-row error feedback. No public-facing changes — all endpoints are behind `requireAdmin`.

</domain>

<decisions>
## Implementation Decisions

### CSV Export Format
- All RSVP fields except `rsvp_token` and `access_token`: id, name, email, phone, status, adults, parents_count, siblings_count, children_count, party_total, dietary (expanded), notes, submitted_at
- Dietary restrictions expanded from JSON array to human-readable comma-separated text: e.g. `"Gluten-Free, Vegan"` (properly CSV-escaped)
- Filename: `{event-slug}-rsvps-{YYYY-MM-DD}.csv` with `Content-Disposition: attachment`
- Always exports all RSVPs — does not respect query filters (caterers need complete list)

### JSON Export & Re-auth
- Re-auth for `include_tokens=true`: check session `issued_at` — if issued > 15 min ago, return 403 with `{"error":"reauth_required","redirect":"/rsvp/admin/login?next=..."}` — no modal, redirect to login
- Without re-auth (or missing `include_tokens`): 403 JSON response as above
- JSON structure per row: flat object — `{id, name, email, phone, status, adults, parents_count, siblings_count, children_count, dietary, notes, submitted_at, rsvp_token}`
- Filename: `{event-slug}-rsvps-{YYYY-MM-DD}.json` with `Content-Disposition: attachment`

### CSV Import
- Expected header columns: `name,email,phone,status,adults,parents_count,siblings_count,children_count,notes`
- Duplicate email: report as error row `{row: N, reason: "duplicate email: foo@bar.com"}`, skip that row, continue batch
- Return format: JSON `{"imported": N, "failed": M, "errors": [{row: R, reason: "..."}]}`
- Limits: 1 MB file size max, 1000 rows max — enforced before processing with clear error message

### the agent's Discretion
- CSV parsing strategy (line splitting vs. dedicated parser — prefer simple split since Worker has no Node.js `csv-parse`; handle quoted fields with commas)
- Session `issued_at` storage detail — check `sessions` table `created_at` column
- Exact column order in CSV output
- Whether to add import UI (HTML form) or JSON-only endpoint — recommend both: HTML upload form on the events detail page + JSON response

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireAdmin` middleware from `app/src/middleware/requireAdmin.ts` — guards all admin routes
- `getEvent` from `app/src/domain/adminEvents.ts` — loads event by ID, returns null if not found
- `listRsvps` from `app/src/domain/adminRsvps.ts` — paginated RSVP list with filters (export uses unpaginated variant)
- Full-path router pattern established in Phase 5: sub-routers registered at `app.route('/', router)` with full paths inside
- Sessions stored in D1 `sessions` table with `created_at` column (ISO string)

### Established Patterns
- Route files: `const router = new Hono<{ Bindings: Env; Variables: { adminUserId: string } }>()`
- Auth guard: `router.use('/rsvp/admin/...', requireAdmin)`
- DB queries: `c.env.DB.prepare('...').bind(...).all<T>()` / `.first<T>()`
- Error responses: `c.json({error: '...'}, 4xx)` for API endpoints
- HTML pages: `adminPage(title, content)` helper pattern (inline in route file)

### Integration Points
- New routes registered in `app/src/app.ts` as `app.route('/', adminDataRouter)` (full-path pattern)
- Export links added to event detail page in `app/src/routes/adminEvents.ts`
- Import form added to event detail page or RSVP list page in `app/src/routes/adminRsvps.ts`
- Sessions table schema: `sessions(id, admin_user_id, created_at, expires_at)` — `created_at` used for re-auth check

</code_context>

<specifics>
## Specific Ideas

- Export CSV link should appear on the event detail page (`/rsvp/admin/events/:id`) alongside existing QR code link
- Import CSV form should appear on the RSVP list page (`/rsvp/admin/events/:id/rsvps`) as a collapsible section
- No specific UI requirements beyond what exists — use the same `adminPage()` helper and CSS from Phase 5

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
