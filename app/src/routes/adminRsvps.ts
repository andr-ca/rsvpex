// app/src/routes/adminRsvps.ts
/**
 * Admin RSVP management routes.
 *
 * IMPORTANT: Sub-router uses full paths due to Hono prefix-non-stripping.
 *
 * @req ADMIN-05 — RSVP list with filters, pagination
 * @req ADMIN-10 — Waitlist promotion
 * @req GAP-04 — Admin edit capacity guard
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { getEvent, getEventStats } from '../domain/adminEvents'
import {
  listRsvps, getRsvp, updateRsvpWithCapacityGuard,
  promoteFromWaitlist, deleteRsvp,
} from '../domain/adminRsvps'
import { requireAdmin } from '../middleware/requireAdmin'

const adminRsvpsRouter = new Hono<{ Bindings: Env; Variables: { adminUserId: string } }>()

adminRsvpsRouter.use('/rsvp/admin/events/*', requireAdmin)

// GET /rsvp/admin/events/:id/rsvps — list RSVPs with filters
adminRsvpsRouter.get('/rsvp/admin/events/:id/rsvps', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()
  const stats = await getEventStats(c.env.DB, event.id)

  const page = Math.max(1, Number(c.req.query('page') || 1))
  const statusFilter = c.req.query('status') as 'attending' | 'waitlist' | 'not_attending' | 'maybe' | undefined
  const nameSearch = c.req.query('name') || undefined
  const dateFrom = c.req.query('date_from') || undefined
  const dateTo = c.req.query('date_to') || undefined

  const result = await listRsvps(c.env.DB, event.id, {
    status: statusFilter,
    nameSearch,
    dateFrom,
    dateTo,
    page,
    perPage: 50,
  })

  const flash = c.req.query('flash')

  return c.html(adminPage(`RSVPs: ${escHtml(event.title)} — RSVPex Admin`, `
    <div class="page-header">
      <h1>RSVPs: ${escHtml(event.title)}</h1>
      <a href="/rsvp/admin/events/${event.id}" class="btn">← Event</a>
    </div>
    ${flash === 'promoted' ? '<div class="success">Guest promoted to attending.</div>' : ''}
    ${flash === 'no_capacity' ? '<div class="error">No capacity available — promotion blocked.</div>' : ''}
    ${flash === 'saved' ? '<div class="success">RSVP updated.</div>' : ''}
    ${flash === 'capacity_error' ? '<div class="error">Edit would exceed capacity. Reduce party size or free capacity first.</div>' : ''}
    <div class="capacity-meter">
      Capacity: ${stats.attending} attending${stats.capacity != null ? ` / ${stats.capacity} max` : ' (unlimited)'}
      · ${stats.waitlist} waitlist · ${stats.not_attending} not attending · ${stats.maybe} maybe
    </div>
    <form method="GET" action="/rsvp/admin/events/${event.id}/rsvps" class="filter-bar">
      <div>
        <label>Status</label>
        <select name="status">
          <option value="">All</option>
          <option value="attending" ${statusFilter === 'attending' ? 'selected' : ''}>Attending</option>
          <option value="waitlist" ${statusFilter === 'waitlist' ? 'selected' : ''}>Waitlist</option>
          <option value="not_attending" ${statusFilter === 'not_attending' ? 'selected' : ''}>Not Attending</option>
          <option value="maybe" ${statusFilter === 'maybe' ? 'selected' : ''}>Maybe</option>
        </select>
      </div>
      <div>
        <label>Name</label>
        <input name="name" placeholder="Search name…" value="${escHtml(nameSearch || '')}">
      </div>
      <div>
        <label>From</label>
        <input name="date_from" type="date" value="${escHtml(dateFrom || '')}">
      </div>
      <div>
        <label>To</label>
        <input name="date_to" type="date" value="${escHtml(dateTo || '')}">
      </div>
      <button type="submit" class="btn">Filter</button>
      <a href="/rsvp/admin/events/${event.id}/rsvps" class="btn">Clear</a>
    </form>
    <p>Showing ${result.rsvps.length} of ${result.total} RSVPs</p>
    <table>
      <thead><tr>
        <th>Name</th><th>Email</th><th>Status</th><th>Party</th><th>Dietary</th><th>Submitted</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${result.rsvps.map(r => {
          const dietary = JSON.parse(r.dietary || '[]') as Array<{ kind: string; value?: string }>
          const dietaryText = dietary.map(d => d.value || d.kind).join(', ')
          return `<tr>
            <td>${escHtml(r.name)}</td>
            <td>${r.email ? escHtml(r.email) : '—'}</td>
            <td><span class="badge badge-${r.status}">${r.status}</span></td>
            <td>${r.party_total}</td>
            <td>${escHtml(dietaryText || '—')}</td>
            <td>${r.submitted_at.slice(0, 10)}</td>
            <td>
              <a href="/rsvp/admin/events/${event.id}/rsvps/${r.id}/edit">Edit</a>
              ${r.status === 'waitlist' ? `
                · <form method="POST" action="/rsvp/admin/events/${event.id}/rsvps/${r.id}/promote" style="display:inline">
                    <button type="submit" class="btn" style="padding:.2rem .5rem;font-size:.85rem">Promote</button>
                  </form>
              ` : ''}
            </td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
    ${paginationHtml(result.page, result.totalPages, `/rsvp/admin/events/${event.id}/rsvps`, { status: statusFilter, name: nameSearch, date_from: dateFrom, date_to: dateTo })}
    <details style="margin-top:2rem">
      <summary style="cursor:pointer;font-weight:600">Import Guests from CSV</summary>
      <div style="margin-top:1rem;padding:1rem;background:#f9f9f9;border-radius:4px;border:1px solid #eee">
        <p style="margin-top:0;font-size:.9rem;color:#555">
          CSV must have a header row. Required column: <code>name</code>.
          Optional: <code>email, phone, status, adults, parents_count, siblings_count, children_count, notes</code>
        </p>
        <form method="POST" action="/rsvp/admin/events/${event.id}/import" enctype="multipart/form-data">
          <input type="file" name="csv_file" accept=".csv,text/csv" required style="margin-bottom:.75rem">
          <button type="submit" class="btn btn-primary">Import</button>
        </form>
      </div>
    </details>
  `))
})

// GET /rsvp/admin/events/:id/rsvps/:rsvpId/edit
adminRsvpsRouter.get('/rsvp/admin/events/:id/rsvps/:rsvpId/edit', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()
  const rsvp = await getRsvp(c.env.DB, c.req.param('rsvpId'))
  if (!rsvp || rsvp.event_id !== event.id) return c.notFound()
  const stats = await getEventStats(c.env.DB, event.id)
  return c.html(adminPage(`Edit RSVP — RSVPex Admin`, `
    <h1>Edit RSVP</h1>
    <div class="capacity-meter">Event capacity: ${stats.attending} attending${stats.capacity != null ? ` / ${stats.capacity} max` : ' (unlimited)'}</div>
    ${rsvpEditForm(event.id, rsvp)}
  `))
})

// POST /rsvp/admin/events/:id/rsvps/:rsvpId/edit
adminRsvpsRouter.post('/rsvp/admin/events/:id/rsvps/:rsvpId/edit', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()
  const rsvp = await getRsvp(c.env.DB, c.req.param('rsvpId'))
  if (!rsvp || rsvp.event_id !== event.id) return c.notFound()

  const body = await c.req.parseBody()
  const parsed = rsvpEditSchema.safeParse(body)
  if (!parsed.success) {
    return c.redirect(`/rsvp/admin/events/${event.id}/rsvps?flash=capacity_error`, 303)
  }
  const d = parsed.data
  const result = await updateRsvpWithCapacityGuard(c.env.DB, rsvp.id, {
    name: d.name,
    email: d.email || null,
    phone: d.phone || null,
    adults: d.adults,
    parentsCount: d.parents_count,
    siblingsCount: d.siblings_count,
    childrenCount: d.children_count,
    notes: d.notes || null,
    status: d.status,
  })

  if (!result.success) {
    return c.redirect(`/rsvp/admin/events/${event.id}/rsvps?flash=capacity_error`, 303)
  }
  return c.redirect(`/rsvp/admin/events/${event.id}/rsvps?flash=saved`, 303)
})

// POST /rsvp/admin/events/:id/rsvps/:rsvpId/promote
adminRsvpsRouter.post('/rsvp/admin/events/:id/rsvps/:rsvpId/promote', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()
  const result = await promoteFromWaitlist(c.env.DB, c.req.param('rsvpId'))
  if (result.success) {
    return c.redirect(`/rsvp/admin/events/${event.id}/rsvps?flash=promoted`, 303)
  }
  return c.redirect(`/rsvp/admin/events/${event.id}/rsvps?flash=no_capacity`, 303)
})

// POST /rsvp/admin/events/:id/rsvps/:rsvpId/delete
adminRsvpsRouter.post('/rsvp/admin/events/:id/rsvps/:rsvpId/delete', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()
  await deleteRsvp(c.env.DB, c.req.param('rsvpId'))
  return c.redirect(`/rsvp/admin/events/${event.id}/rsvps`, 303)
})

export default adminRsvpsRouter

// ── Helpers ────────────────────────────────────────────────────────────────

const rsvpEditSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(254).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  adults: z.coerce.number().int().min(0).max(50).default(1),
  parents_count: z.coerce.number().int().min(0).max(50).default(0),
  siblings_count: z.coerce.number().int().min(0).max(50).default(0),
  children_count: z.coerce.number().int().min(0).max(50).default(0),
  notes: z.string().max(2000).optional(),
  status: z.enum(['attending', 'not_attending', 'maybe', 'waitlist']),
})

type RsvpRow = {
  id: string; name: string; email: string | null; phone: string | null;
  adults: number; parents_count: number; siblings_count: number;
  children_count: number; notes: string | null; status: string;
}

function rsvpEditForm(eventId: string, rsvp: RsvpRow): string {
  return `<form method="POST" action="/rsvp/admin/events/${eventId}/rsvps/${rsvp.id}/edit">
    <label>Name *</label>
    <input name="name" required maxlength="200" value="${escHtml(rsvp.name)}">
    <label>Email</label>
    <input name="email" type="email" value="${escHtml(rsvp.email || '')}">
    <label>Phone</label>
    <input name="phone" value="${escHtml(rsvp.phone || '')}">
    <div class="form-row">
      <div><label>Adults</label><input name="adults" type="number" min="0" max="50" value="${rsvp.adults}"></div>
      <div><label>Parents</label><input name="parents_count" type="number" min="0" max="50" value="${rsvp.parents_count}"></div>
    </div>
    <div class="form-row">
      <div><label>Siblings</label><input name="siblings_count" type="number" min="0" max="50" value="${rsvp.siblings_count}"></div>
      <div><label>Children</label><input name="children_count" type="number" min="0" max="50" value="${rsvp.children_count}"></div>
    </div>
    <label>Status</label>
    <select name="status">
      <option value="attending" ${rsvp.status === 'attending' ? 'selected' : ''}>Attending</option>
      <option value="not_attending" ${rsvp.status === 'not_attending' ? 'selected' : ''}>Not Attending</option>
      <option value="maybe" ${rsvp.status === 'maybe' ? 'selected' : ''}>Maybe</option>
      <option value="waitlist" ${rsvp.status === 'waitlist' ? 'selected' : ''}>Waitlist</option>
    </select>
    <label>Notes</label>
    <textarea name="notes">${escHtml(rsvp.notes || '')}</textarea>
    <div class="action-row">
      <button type="submit" class="btn btn-primary">Save Changes</button>
      <a href="/rsvp/admin/events/${eventId}/rsvps" class="btn">Cancel</a>
    </div>
  </form>`
}

function paginationHtml(current: number, total: number, base: string, params: Record<string, string | undefined>): string {
  if (total <= 1) return ''
  const p = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')
  const sep = p ? '&' : '?'
  const pages = Array.from({ length: total }, (_, i) => i + 1)
  return `<div class="pagination">
    ${pages.map(n => `<a href="${base}?page=${n}${p ? sep + p : ''}" class="${n === current ? 'active' : ''}">${n}</a>`).join('')}
  </div>`
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function adminPage(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 1.5rem; }
    nav { display: flex; gap: 1rem; padding: .75rem 0; border-bottom: 1px solid #ddd; margin-bottom: 2rem; }
    nav a, nav button { text-decoration: none; color: #333; background: none; border: none; cursor: pointer; font-size: 1rem; padding: 0; }
    nav a:hover { color: #0066cc; }
    h1 { margin-top: 0; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .page-header h1 { margin: 0; }
    .btn { padding: .5rem 1rem; border: 1px solid #ccc; border-radius: 4px; text-decoration: none; color: #333; background: #f5f5f5; cursor: pointer; font-size: .9rem; display: inline-block; }
    .btn:hover { background: #e5e5e5; }
    .btn-primary { background: #0066cc; color: #fff; border-color: #0066cc; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: .5rem .75rem; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f5f5f5; font-weight: 600; }
    .badge { padding: .2rem .5rem; border-radius: 3px; font-size: .8rem; text-transform: uppercase; }
    .badge-attending { background: #dfd; color: #060; }
    .badge-waitlist { background: #ffeedd; color: #c60; }
    .badge-not_attending { background: #fdd; color: #c00; }
    .badge-maybe { background: #eef; color: #339; }
    .error { color: #c00; background: #fee; padding: .75rem; border-radius: 4px; margin-bottom: 1rem; }
    .success { color: #060; background: #efe; padding: .75rem; border-radius: 4px; margin-bottom: 1rem; }
    label { display: block; margin-top: 1rem; font-weight: 600; }
    input, select, textarea { display: block; width: 100%; padding: .5rem; margin-top: .25rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 4px; }
    textarea { min-height: 80px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .action-row { display: flex; gap: .75rem; margin-top: 1.5rem; }
    .filter-bar { display: flex; gap: .75rem; margin-bottom: 1.5rem; flex-wrap: wrap; align-items: flex-end; }
    .filter-bar label { margin: 0; font-weight: normal; font-size: .85rem; }
    .filter-bar input, .filter-bar select { width: auto; min-width: 110px; padding: .4rem; }
    .capacity-meter { margin-bottom: 1rem; color: #555; font-size: .9rem; background: #f5f5f5; padding: .5rem .75rem; border-radius: 4px; }
    .pagination { display: flex; gap: .5rem; margin-top: 1.5rem; flex-wrap: wrap; }
    .pagination a { padding: .4rem .75rem; border: 1px solid #ccc; border-radius: 4px; text-decoration: none; color: #333; }
    .pagination .active { background: #0066cc; color: #fff; border-color: #0066cc; }
  </style>
</head>
<body>
  <nav>
    <a href="/rsvp/admin/">Dashboard</a>
    <a href="/rsvp/admin/events">Events</a>
    <form method="POST" action="/rsvp/admin/logout" style="margin:0">
      <button>Log Out</button>
    </form>
  </nav>
  ${content}
</body>
</html>`
}
