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
import { adminPage, escHtml } from '../views/layout'

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
  c: Context<{ Bindings: Env; Variables: { adminUserId: string; csrfToken?: string } }>,
) {
  const stats = await getDashboardStats(c.env.DB)
  const csrfToken = c.get('csrfToken') ?? ''
  const content = `
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
              <td><a href="/rsvp/admin/events/${escHtml(e.id)}">${escHtml(e.title)}</a></td>
              <td><span class="badge badge-${e.status}">${e.status}</span></td>
              <td>${e.start_at.slice(0, 10)}</td>
              <td><a href="/rsvp/admin/events/${e.id}/rsvps">RSVPs</a></td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>`
  }`
  return c.html(adminPage('Admin Dashboard — RSVPex', content, csrfToken))
}
