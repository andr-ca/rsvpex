// app/src/routes/adminDashboard.ts
/**
 * Admin dashboard stub — replaced in Phase 5.
 * @req ADMIN-03 — dashboard placeholder
 */
import { Hono } from 'hono'

const adminDashboardRouter = new Hono<{ Bindings: Env; Variables: { adminUserId: string } }>()

adminDashboardRouter.get('/', (c) => {
  return c.html(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Admin — RSVPex</title></head>
    <body>
      <h1>Admin Dashboard</h1>
      <p>Phase 5 coming soon.</p>
      <form method="POST" action="/rsvp/admin/logout"><button type="submit">Log Out</button></form>
    </body></html>`)
})

export default adminDashboardRouter
