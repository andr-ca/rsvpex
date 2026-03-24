// app/src/routes/adminDashboard.ts
/**
 * Admin dashboard stub — replaced in Phase 5.
 * @req ADMIN-03 — dashboard placeholder
 *
 * NOTE: This exports a handler function rather than a router because Hono's
 * app.route(prefix, sub) does NOT strip the prefix — sub-router '/' won't
 * match '/rsvp/admin/'. Routes for the root of this section are registered
 * directly in app.ts.
 */
import type { Context } from 'hono'

export function adminDashboardHandler(c: Context<{ Bindings: Env; Variables: { adminUserId: string } }>) {
  return c.html(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Admin — RSVPex</title></head>
    <body>
      <h1>Admin Dashboard</h1>
      <p>Phase 5 coming soon.</p>
      <form method="POST" action="/rsvp/admin/logout"><button type="submit">Log Out</button></form>
    </body></html>`)
}
