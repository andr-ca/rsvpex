// app/src/routes/adminDashboard.ts
/**
 * Admin dashboard overview — tiles showing event counts + system status.
 *
 * NOTE: Exported as a handler function (not a router) because Hono's
 * app.route(prefix, sub) does NOT strip the prefix — sub-router '/' won't
 * match '/rsvp/admin/'. Registered directly in app.ts.
 *
 * @req ADMIN-03 — Dashboard tiles: active/upcoming/recent event counts, system status
 */
import type { Context } from 'hono'

type EventSummary = {
  id: string
  title: string
  status: string
  start_at: string
  slug: string
}

type DashboardStats = {
  active: number
  upcoming: number
  total: number
  recentEvents: EventSummary[]
  dbOk: boolean
}

async function getDashboardStats(db: D1Database): Promise<DashboardStats> {
  const now = new Date().toISOString()
  try {
    const [activeRes, upcomingRes, totalRes, recentRes] = await Promise.all([
      db
        .prepare(
          "SELECT COUNT(*) as n FROM events WHERE status = 'published' AND start_at <= ? AND (archived_at IS NULL)",
        )
        .bind(now)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) as n FROM events WHERE status = 'published' AND start_at > ? AND (archived_at IS NULL)",
        )
        .bind(now)
        .first<{ n: number }>(),
      db
        .prepare('SELECT COUNT(*) as n FROM events WHERE archived_at IS NULL')
        .first<{ n: number }>(),
      db
        .prepare(
          'SELECT id, title, status, start_at, slug FROM events WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 5',
        )
        .all<EventSummary>(),
    ])
    return {
      active: activeRes?.n ?? 0,
      upcoming: upcomingRes?.n ?? 0,
      total: totalRes?.n ?? 0,
      recentEvents: recentRes.results,
      dbOk: true,
    }
  } catch {
    return { active: 0, upcoming: 0, total: 0, recentEvents: [], dbOk: false }
  }
}

export async function adminDashboardHandler(
  c: Context<{ Bindings: Env; Variables: { adminUserId: string } }>,
) {
  const stats = await getDashboardStats(c.env.DB)
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard — RSVPex</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 1.5rem; }
    nav { display: flex; gap: 1rem; padding: .75rem 0; border-bottom: 1px solid #ddd; margin-bottom: 2rem; }
    nav a { text-decoration: none; color: #333; }
    nav a:hover { color: #0066cc; }
    h1 { margin-top: 0; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .tile { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 1.25rem; text-align: center; }
    .tile-value { font-size: 2.5rem; font-weight: 700; color: #0066cc; }
    .tile-label { font-size: .85rem; color: #555; margin-top: .25rem; }
    .tile-status-ok { border-left: 4px solid #4caf50; }
    .tile-status-error { border-left: 4px solid #f44336; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: .5rem .75rem; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f5f5f5; }
    .badge { padding: .2rem .5rem; border-radius: 3px; font-size: .8rem; text-transform: uppercase; }
    .badge-draft { background: #eee; color: #555; }
    .badge-published { background: #dfd; color: #060; }
    .badge-archived { background: #eee; color: #999; }
    .btn { padding: .5rem 1rem; border: 1px solid #ccc; border-radius: 4px; text-decoration: none; color: #333; background: #f5f5f5; }
  </style>
</head>
<body>
  <nav>
    <a href="/rsvp/admin/">Dashboard</a>
    <a href="/rsvp/admin/events">Events</a>
    <form method="POST" action="/rsvp/admin/logout" style="margin:0">
      <button style="background:none;border:none;cursor:pointer;color:#333;padding:0;font-size:1rem">Log Out</button>
    </form>
  </nav>
  <h1>Dashboard</h1>
  <div class="tiles" aria-label="Dashboard statistics">
    <div class="tile">
      <div class="tile-value">${stats.total}</div>
      <div class="tile-label">Total Events</div>
    </div>
    <div class="tile">
      <div class="tile-value">${stats.active}</div>
      <div class="tile-label">Active (Live Now)</div>
    </div>
    <div class="tile">
      <div class="tile-value">${stats.upcoming}</div>
      <div class="tile-label">Upcoming</div>
    </div>
    <div class="tile ${stats.dbOk ? 'tile-status-ok' : 'tile-status-error'}">
      <div class="tile-value">${stats.dbOk ? '✓' : '✗'}</div>
      <div class="tile-label">Database</div>
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
    <h2 style="margin:0">Recent Events</h2>
    <a href="/rsvp/admin/events/new" class="btn">+ New Event</a>
  </div>
  ${
    stats.recentEvents.length === 0
      ? '<p>No events yet. <a href="/rsvp/admin/events/new">Create your first event.</a></p>'
      : `<table>
        <thead><tr><th>Title</th><th>Status</th><th>Starts</th><th>Actions</th></tr></thead>
        <tbody>
          ${stats.recentEvents
            .map(
              (e) => `
            <tr>
              <td><a href="/rsvp/admin/events/${e.id}">${e.title.replace(/</g, '&lt;')}</a></td>
              <td><span class="badge badge-${e.status}">${e.status}</span></td>
              <td>${e.start_at.slice(0, 10)}</td>
              <td><a href="/rsvp/admin/events/${e.id}/rsvps">RSVPs</a></td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>`
  }
</body>
</html>`)
}
