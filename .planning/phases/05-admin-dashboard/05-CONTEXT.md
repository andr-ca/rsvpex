# Phase 5: Admin Dashboard - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 delivers the complete admin management interface: event CRUD (create/edit/publish/archive), the RSVP list with filtering and pagination, waitlist promotion with transactional capacity recheck, admin RSVP edits with capacity guard, dashboard overview tiles, per-event Chart.js charts, and QR code PNG download. The admin area is protected by requireAdmin middleware (Phase 4). This phase replaces the stub dashboard with a fully functional interface.

</domain>

<decisions>
## Implementation Decisions

### Event CRUD UX
- Slug auto-generated from title with manual override field (consistent with modern CMS pattern)
- Single scrollable page form for event creation — simpler, no multi-step wizard
- Inline warning banner on published event edit ("Changes will affect the live form") — no checkbox required
- `<input type="datetime-local">` for date/time fields — native browser picker, no extra JS

### RSVP List & Filters
- Inline filter bar above the table (not sidebar) — simpler, mobile-friendly
- Numbered pagination at 50 RSVPs per page — per ROADMAP SC-2; easier to deep-link
- Table columns: Name, Email, Status, Party size, Dietary, Date submitted, Actions
- Separate edit page (`/rsvp/admin/events/:id/rsvps/:rsvpId/edit`) — not inline or modal

### Charts & Dashboard Tiles
- Chart.js bundled via npm import — no CDN dependency, works offline
- Dashboard tiles: active/upcoming/recent event counts + system status (D1 health)
- Summary tiles on `/rsvp/admin/` overview; per-event charts on event detail page
- QR code via `qrcode` npm package (pure JS, outputs data URL PNG) — Workers-compatible

### Waitlist Promotion & Capacity Guard UX
- Per-row "Promote" button — simpler, less risk of accidental bulk promotion
- Promotion failure (concurrent overbooking): page-level flash message ("No capacity available — promotion blocked")
- Capacity meter shown in RSVP edit form header (e.g. "47/50 attending") — helps admin make informed edits
- Admin edit capacity guard: block with error message ("Edit would exceed capacity — currently X/Y attending"); admin must reduce party size or free capacity first

### the agent's Discretion
- Chart types: status pie, guest-type stacked bar, RSVPs-over-time line, dietary bar — as specified in ROADMAP SC-5
- Exact CSS layout and color palette for admin pages
- QR code encodes event URL; includes `?t=<access_token>` for private/unlisted events
- Auto-slug collision handling: append `-2`, `-3` etc.
- RSVP list free-text name search implementation details

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `adminLogin.ts` — `page()` helper function with inline system-ui CSS styles; `escHtml()` utility — reuse across all admin pages
- `adminDashboard.ts` — `adminDashboardHandler` already registered at `GET /rsvp/admin/` — replace stub with real content
- `domain/capacity.ts` — `checkAndInsertRsvp()` with conditional INSERT pattern; adapt for admin edit capacity check
- `domain/adminAuth.ts` — `getSession()`, `createSession()`, `deleteSession()` — session management complete
- `middleware/requireAdmin.ts` — `requireAdmin` middleware sets `c.var.adminUserId`
- `app/src/db/schema.ts` — full Drizzle schema: `events`, `rsvps`, `adminUsers`, `sessions`, `auditLogs`

### Established Patterns
- Inline HTML template literals for all server-rendered pages (no template engine)
- `system-ui` sans-serif, max-width container, inline `<style>` in `<head>`
- Hono routes use `c.html()`, `c.json()`, `c.redirect()` — no JSX
- Form submissions: `application/x-www-form-urlencoded` via POST, redirect-after-POST (303)
- Error display: `.error { color: #c00; background: #fee; padding: .75rem; border-radius: 4px; }`
- Success display: `.success { color: #060; background: #efe; ... }`
- Zod validation on all form inputs (`z.string()`, `z.coerce.number()`, etc.)
- D1 atomic capacity check: conditional `INSERT ... SELECT ... WHERE` pattern
- `app.route('/rsvp/admin', subRouter)` — sub-router routes must use full paths (e.g. `/rsvp/admin/events`) due to Hono prefix-non-stripping
- **Critical:** Direct routes on main `app` for root paths (e.g. `app.get('/rsvp/admin/', handler)`) due to Hono sub-router path matching quirk discovered in Phase 4

### Integration Points
- `app.ts` — add new routes for events CRUD and RSVP management after existing admin routes
- `adminDashboard.ts` — replace stub handler with real dashboard overview
- `wrangler.jsonc` — no new bindings needed for Phase 5
- New migration needed: no schema changes required (events + rsvps tables already exist)
- `qrcode` npm package to install

</code_context>

<specifics>
## Specific Ideas

- No specific requirements — open to standard approaches for the admin UI layout
- Dashboard should be functional and clean, consistent with the system-ui minimal style established in Phase 4

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>
