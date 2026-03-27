// app/src/routes/adminEvents.ts
/**
 * Admin event management routes.
 *
 * IMPORTANT: Hono's app.route(prefix, sub) does NOT strip the prefix.
 * All routes here use full paths: /rsvp/admin/events, /rsvp/admin/events/:id, etc.
 *
 * @req ADMIN-04 — Event CRUD: create, list, edit, publish, archive
 */
import { Hono } from 'hono'
import { z } from 'zod'
import {
  createEvent, getEvent, listEvents, updateEvent,
  publishEvent, archiveEvent, getEventStats,
} from '../domain/adminEvents'
import { requireAdmin } from '../middleware/requireAdmin'

const adminEventsRouter = new Hono<{ Bindings: Env; Variables: { adminUserId: string } }>()

adminEventsRouter.use('/rsvp/admin/events', requireAdmin)
adminEventsRouter.use('/rsvp/admin/events/*', requireAdmin)

const eventSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(100).optional(),
  host_name: z.string().max(200).optional(),
  description_html: z.string().max(50000).optional(),
  timezone: z.string().min(1).max(50).default('America/Toronto'),
  start_at: z.string().min(1),
  end_at: z.string().optional(),
  location_text: z.string().max(300).optional(),
  wishlist_url: z.string().url().max(500).optional().or(z.literal('')),
  visibility: z.enum(['public', 'unlisted', 'private']).default('public'),
  is_kids_event: z.coerce.boolean().optional().default(false),
  allow_children: z.coerce.boolean().optional().default(true),
  allow_siblings: z.coerce.boolean().optional().default(true),
  allow_parents: z.coerce.boolean().optional().default(true),
  allow_status_choice: z.coerce.boolean().optional().default(true),
  enable_waitlist: z.coerce.boolean().optional().default(false),
  enable_heuristic_dup_check: z.coerce.boolean().optional().default(false),
  locale: z.enum(['en', 'fr', 'es']).default('en'),
  max_guests_total: z.coerce.number().int().min(1).optional().nullable(),
  max_party_size_per_rsvp: z.coerce.number().int().min(1).max(100).default(10),
  opens_at: z.string().optional(),
  closes_at: z.string().optional(),
  notify_via_email: z.coerce.boolean().optional().default(true),
  notify_via_sms: z.coerce.boolean().optional().default(false),
  reminder_days_before: z.coerce.number().int().min(0).max(365).optional(),
})

// GET /rsvp/admin/events — list all events
adminEventsRouter.get('/rsvp/admin/events', async (c) => {
  const events = await listEvents(c.env.DB)
  return c.html(adminPage('Events — RSVPex Admin', `
    <div class="page-header">
      <h1>Events</h1>
      <a href="/rsvp/admin/events/new" class="btn">+ New Event</a>
    </div>
    ${events.length === 0 ? '<p>No events yet. <a href="/rsvp/admin/events/new">Create your first event.</a></p>' : ''}
    <table>
      <thead><tr>
        <th>Title</th><th>Slug</th><th>Status</th><th>Starts</th><th>Visibility</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${events.map(e => `
          <tr>
            <td><a href="/rsvp/admin/events/${e.id}">${escHtml(e.title)}</a></td>
            <td><code>${escHtml(e.slug)}</code></td>
            <td><span class="badge badge-${e.status}">${e.status}</span></td>
            <td>${e.start_at.slice(0, 10)}</td>
            <td>${e.visibility}</td>
            <td>
              <a href="/rsvp/admin/events/${e.id}/edit">Edit</a> ·
              <a href="/rsvp/admin/events/${e.id}/rsvps">RSVPs</a>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `))
})

// GET /rsvp/admin/events/new — new event form
adminEventsRouter.get('/rsvp/admin/events/new', (c) => {
  return c.html(adminPage('New Event — RSVPex Admin', `
    <h1>New Event</h1>
    ${eventForm(null)}
  `))
})

// POST /rsvp/admin/events — create event
adminEventsRouter.post('/rsvp/admin/events', async (c) => {
  const body = await c.req.parseBody()
  const parsed = eventSchema.safeParse(body)
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    return c.html(adminPage('New Event — RSVPex Admin', `
      <h1>New Event</h1>
      <div class="error">${Object.values(errors).flat().join(', ')}</div>
      ${eventForm(null, body as Record<string, string>)}
    `), 422)
  }
  const d = parsed.data
  const id = await createEvent(c.env.DB, {
    title: d.title,
    slug: d.slug,
    hostName: d.host_name,
    descriptionHtml: d.description_html,
    timezone: d.timezone,
    startAt: d.start_at,
    endAt: d.end_at,
    locationText: d.location_text,
    wishlistUrl: d.wishlist_url || undefined,
    visibility: d.visibility,
    isKidsEvent: d.is_kids_event,
    allowChildren: d.allow_children,
    allowSiblings: d.allow_siblings,
    allowParents: d.allow_parents,
    allowStatusChoice: d.allow_status_choice,
    enableWaitlist: d.enable_waitlist,
    enableHeuristicDupCheck: d.enable_heuristic_dup_check,
    locale: d.locale,
    maxGuestsTotal: d.max_guests_total ?? undefined,
    maxPartySizePerRsvp: d.max_party_size_per_rsvp,
    opensAt: d.opens_at,
    closesAt: d.closes_at,
    notifyViaEmail: d.notify_via_email,
    notifyViaSms: d.notify_via_sms,
    reminderDaysBefore: d.reminder_days_before,
    questions: '[]',
  })
  return c.redirect(`/rsvp/admin/events/${id}`, 303)
})

// GET /rsvp/admin/events/:id — event detail
adminEventsRouter.get('/rsvp/admin/events/:id', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()
  const stats = await getEventStats(c.env.DB, event.id)
  const capacityStr = stats.capacity != null ? `${stats.attending}/${stats.capacity}` : `${stats.attending} attending`
  return c.html(adminPage(`${escHtml(event.title)} — RSVPex Admin`, `
    <div class="page-header">
      <h1>${escHtml(event.title)}</h1>
      <div class="actions">
        <a href="/rsvp/admin/events/${event.id}/edit" class="btn">Edit</a>
        <a href="/rsvp/admin/events/${event.id}/rsvps" class="btn">RSVPs (${stats.total})</a>
        <a href="/rsvp/admin/events/${event.id}/qr" class="btn">QR Code</a>
        <a href="/rsvp/admin/events/${event.id}/export.csv" class="btn">Export CSV</a>
        <a href="/rsvp/admin/events/${event.id}/export.json" class="btn">Export JSON</a>
      </div>
    </div>
    ${event.status === 'published' ? '<div class="warning">This event is live — changes will affect the public form immediately.</div>' : ''}
    <dl>
      <dt>Status</dt><dd><span class="badge badge-${event.status}">${event.status}</span></dd>
      <dt>Slug</dt><dd><code>${escHtml(event.slug)}</code></dd>
      <dt>Starts</dt><dd>${event.start_at}</dd>
      <dt>Visibility</dt><dd>${event.visibility}</dd>
      <dt>Capacity</dt><dd>${capacityStr}</dd>
      <dt>Locale</dt><dd>${event.locale}</dd>
      <dt>Waitlist</dt><dd>${event.enable_waitlist ? 'Enabled' : 'Disabled'}</dd>
    </dl>
    <div class="action-row">
      ${event.status === 'draft' ? `
        <form method="POST" action="/rsvp/admin/events/${event.id}/publish" style="display:inline">
          <button type="submit" class="btn btn-primary">Publish Event</button>
        </form>
      ` : ''}
      ${event.status !== 'archived' ? `
        <form method="POST" action="/rsvp/admin/events/${event.id}/archive" style="display:inline">
          <button type="submit" onclick="return confirm('Archive this event?')">Archive</button>
        </form>
      ` : ''}
    </div>
    ${chartSection(event.id, stats)}
  `))
})

// GET /rsvp/admin/events/:id/edit — edit form
adminEventsRouter.get('/rsvp/admin/events/:id/edit', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()
  return c.html(adminPage(`Edit ${escHtml(event.title)} — RSVPex Admin`, `
    <h1>Edit Event</h1>
    ${event.status === 'published' ? '<div class="warning">This event is published — changes will affect the live form immediately.</div>' : ''}
    ${eventForm(event)}
  `))
})

// POST /rsvp/admin/events/:id/edit — save event edits
adminEventsRouter.post('/rsvp/admin/events/:id/edit', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()
  const body = await c.req.parseBody()
  const parsed = eventSchema.safeParse(body)
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    return c.html(adminPage(`Edit ${escHtml(event.title)} — RSVPex Admin`, `
      <h1>Edit Event</h1>
      <div class="error">${Object.values(errors).flat().join(', ')}</div>
      ${eventForm(event, body as Record<string, string>)}
    `), 422)
  }
  const d = parsed.data
  await updateEvent(c.env.DB, event.id, {
    title: d.title,
    hostName: d.host_name,
    descriptionHtml: d.description_html,
    timezone: d.timezone,
    startAt: d.start_at,
    endAt: d.end_at,
    locationText: d.location_text,
    wishlistUrl: d.wishlist_url || undefined,
    visibility: d.visibility,
    isKidsEvent: d.is_kids_event,
    allowChildren: d.allow_children,
    allowSiblings: d.allow_siblings,
    allowParents: d.allow_parents,
    allowStatusChoice: d.allow_status_choice,
    enableWaitlist: d.enable_waitlist,
    enableHeuristicDupCheck: d.enable_heuristic_dup_check,
    locale: d.locale,
    maxGuestsTotal: d.max_guests_total ?? undefined,
    maxPartySizePerRsvp: d.max_party_size_per_rsvp,
    opensAt: d.opens_at,
    closesAt: d.closes_at,
    notifyViaEmail: d.notify_via_email,
    notifyViaSms: d.notify_via_sms,
    reminderDaysBefore: d.reminder_days_before,
  })
  return c.redirect(`/rsvp/admin/events/${event.id}?saved=1`, 303)
})

// POST /rsvp/admin/events/:id/publish
adminEventsRouter.post('/rsvp/admin/events/:id/publish', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()
  await publishEvent(c.env.DB, event.id)
  return c.redirect(`/rsvp/admin/events/${event.id}?published=1`, 303)
})

// POST /rsvp/admin/events/:id/archive
adminEventsRouter.post('/rsvp/admin/events/:id/archive', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()
  await archiveEvent(c.env.DB, event.id)
  return c.redirect(`/rsvp/admin/events`, 303)
})

export default adminEventsRouter

// ── Shared helpers ─────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function adminPage(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 1.5rem; }
    nav { display: flex; gap: 1rem; padding: .75rem 0; border-bottom: 1px solid #ddd; margin-bottom: 2rem; }
    nav a { text-decoration: none; color: #333; }
    nav a:hover { color: #0066cc; }
    h1 { margin-top: 0; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .page-header h1 { margin: 0; }
    .actions { display: flex; gap: .5rem; }
    .btn { padding: .5rem 1rem; border: 1px solid #ccc; border-radius: 4px; text-decoration: none; color: #333; background: #f5f5f5; cursor: pointer; font-size: .9rem; }
    .btn:hover { background: #e5e5e5; }
    .btn-primary { background: #0066cc; color: #fff; border-color: #0066cc; }
    .btn-primary:hover { background: #0055aa; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: .5rem .75rem; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f5f5f5; font-weight: 600; }
    .badge { padding: .2rem .5rem; border-radius: 3px; font-size: .8rem; text-transform: uppercase; }
    .badge-draft { background: #eee; color: #555; }
    .badge-published { background: #dfd; color: #060; }
    .badge-closed { background: #ffeedd; color: #c60; }
    .badge-archived { background: #eee; color: #999; }
    .badge-attending { background: #dfd; color: #060; }
    .badge-waitlist { background: #ffeedd; color: #c60; }
    .badge-not_attending { background: #fdd; color: #c00; }
    .badge-maybe { background: #eef; color: #339; }
    .error { color: #c00; background: #fee; padding: .75rem; border-radius: 4px; margin-bottom: 1rem; }
    .success { color: #060; background: #efe; padding: .75rem; border-radius: 4px; margin-bottom: 1rem; }
    .warning { color: #840; background: #fff3cd; padding: .75rem; border-radius: 4px; margin-bottom: 1rem; border: 1px solid #ffc107; }
    label { display: block; margin-top: 1rem; font-weight: 600; }
    input, select, textarea { display: block; width: 100%; padding: .5rem; margin-top: .25rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 4px; }
    textarea { min-height: 80px; resize: vertical; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .form-check { display: flex; align-items: center; gap: .5rem; margin-top: .75rem; }
    .form-check input { width: auto; margin: 0; }
    .action-row { display: flex; gap: .75rem; margin-top: 1.5rem; flex-wrap: wrap; }
    dl { display: grid; grid-template-columns: 140px 1fr; gap: .5rem .75rem; }
    dt { font-weight: 600; color: #555; }
    code { background: #f0f0f0; padding: .1rem .3rem; border-radius: 3px; font-size: .9em; }
    .filter-bar { display: flex; gap: .75rem; margin-bottom: 1.5rem; flex-wrap: wrap; align-items: flex-end; }
    .filter-bar label { margin: 0; font-weight: normal; }
    .filter-bar input, .filter-bar select { width: auto; min-width: 120px; }
    .capacity-meter { margin-bottom: 1rem; color: #555; font-size: .9rem; }
    .pagination { display: flex; gap: .5rem; margin-top: 1.5rem; }
    .pagination a, .pagination span { padding: .4rem .75rem; border: 1px solid #ccc; border-radius: 4px; text-decoration: none; color: #333; }
    .pagination .active { background: #0066cc; color: #fff; border-color: #0066cc; }
    .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 2rem; }
    .chart-card { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 1rem; }
    .chart-card h3 { margin: 0 0 1rem; font-size: .95rem; color: #555; }
  </style>
</head>
<body>
  <nav>
    <a href="/rsvp/admin/">Dashboard</a>
    <a href="/rsvp/admin/events">Events</a>
    <form method="POST" action="/rsvp/admin/logout" style="margin:0">
      <button style="background:none;border:none;cursor:pointer;color:#333;padding:0">Log Out</button>
    </form>
  </nav>
  ${content}
</body>
</html>`
}

function eventForm(event: Record<string, unknown> | null, override?: Record<string, string>): string {
  const v = (field: string, fallback = '') => {
    if (override?.[field] !== undefined) return escHtml(String(override[field]))
    if (event?.[field as keyof typeof event] !== undefined) return escHtml(String(event[field as keyof typeof event]))
    return fallback
  }
  const checked = (field: string) => {
    if (override?.[field] !== undefined) return override[field] ? 'checked' : ''
    if (event) return (event as Record<string, unknown>)[field] ? 'checked' : ''
    return field === 'allow_children' || field === 'allow_status_choice' || field === 'notify_via_email' ? 'checked' : ''
  }
  const action = event ? `/rsvp/admin/events/${(event as { id: string }).id}/edit` : '/rsvp/admin/events'

  return `<form method="POST" action="${action}">
    <div class="form-row">
      <div>
        <label for="title">Title *</label>
        <input id="title" name="title" required maxlength="200" value="${v('title')}">
      </div>
      <div>
        <label for="slug">Slug (auto-generated if blank)</label>
        <input id="slug" name="slug" maxlength="100" value="${v('slug')}">
      </div>
    </div>
    <div class="form-row">
      <div>
        <label for="start_at">Start Date/Time *</label>
        <input id="start_at" name="start_at" type="datetime-local" required value="${v('start_at')}">
      </div>
      <div>
        <label for="end_at">End Date/Time</label>
        <input id="end_at" name="end_at" type="datetime-local" value="${v('end_at')}">
      </div>
    </div>
    <div class="form-row">
      <div>
        <label for="timezone">Timezone</label>
        <input id="timezone" name="timezone" value="${v('timezone', 'America/Toronto')}">
      </div>
      <div>
        <label for="visibility">Visibility</label>
        <select id="visibility" name="visibility">
          <option value="public" ${v('visibility', 'public') === 'public' ? 'selected' : ''}>Public</option>
          <option value="unlisted" ${v('visibility') === 'unlisted' ? 'selected' : ''}>Unlisted</option>
          <option value="private" ${v('visibility') === 'private' ? 'selected' : ''}>Private</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div>
        <label for="max_guests_total">Max Guests (leave blank for unlimited)</label>
        <input id="max_guests_total" name="max_guests_total" type="number" min="1" value="${v('max_guests_total')}">
      </div>
      <div>
        <label for="locale">Language</label>
        <select id="locale" name="locale">
          <option value="en" ${v('locale', 'en') === 'en' ? 'selected' : ''}>English</option>
          <option value="fr" ${v('locale') === 'fr' ? 'selected' : ''}>Français</option>
          <option value="es" ${v('locale') === 'es' ? 'selected' : ''}>Español</option>
        </select>
      </div>
    </div>
    <label for="location_text">Location</label>
    <input id="location_text" name="location_text" maxlength="300" value="${v('location_text')}">
    <label for="wishlist_url">Gift Registry URL</label>
    <input id="wishlist_url" name="wishlist_url" type="url" value="${v('wishlist_url')}">
    <label for="description_html">Description (HTML allowed)</label>
    <textarea id="description_html" name="description_html">${v('description_html')}</textarea>
    <div class="form-check">
      <input id="enable_waitlist" name="enable_waitlist" type="checkbox" value="true" ${checked('enable_waitlist')}>
      <label for="enable_waitlist" style="font-weight:normal">Enable waitlist when at capacity</label>
    </div>
    <div class="form-check">
      <input id="is_kids_event" name="is_kids_event" type="checkbox" value="true" ${checked('is_kids_event')}>
      <label for="is_kids_event" style="font-weight:normal">Kids event (show children/siblings/parents fields)</label>
    </div>
    <div class="form-check">
      <input id="notify_via_email" name="notify_via_email" type="checkbox" value="true" ${checked('notify_via_email')}>
      <label for="notify_via_email" style="font-weight:normal">Email notifications</label>
    </div>
    <div class="action-row">
      <button type="submit" class="btn btn-primary">${event ? 'Save Changes' : 'Create Event'}</button>
      <a href="${event ? `/rsvp/admin/events/${(event as { id: string }).id}` : '/rsvp/admin/events'}" class="btn">Cancel</a>
    </div>
  </form>`
}

function chartSection(eventId: string, stats: { attending: number; waitlist: number; not_attending: number; maybe: number; capacity: number | null }): string {
  const data = JSON.stringify(stats)
  return `
    <div class="chart-grid" aria-label="Event statistics charts">
      <div class="chart-card">
        <h3>RSVP Status</h3>
        <canvas id="chartStatus" aria-label="RSVP status distribution pie chart" role="img"></canvas>
      </div>
      <div class="chart-card">
        <h3>Capacity</h3>
        <canvas id="chartCapacity" aria-label="Capacity utilization bar chart" role="img"></canvas>
      </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
    <script>
      (function() {
        var stats = ${data};
        var statusCtx = document.getElementById('chartStatus');
        new Chart(statusCtx, {
          type: 'pie',
          data: {
            labels: ['Attending', 'Waitlist', 'Not Attending', 'Maybe'],
            datasets: [{ data: [stats.attending, stats.waitlist, stats.not_attending, stats.maybe],
              backgroundColor: ['#4caf50','#ff9800','#f44336','#9c27b0'] }]
          },
          options: { plugins: { legend: { position: 'bottom' } } }
        });
        var capCtx = document.getElementById('chartCapacity');
        new Chart(capCtx, {
          type: 'bar',
          data: {
            labels: ['Attending', 'Capacity'],
            datasets: [{ data: [stats.attending, stats.capacity || stats.attending],
              backgroundColor: ['#4caf50','#e0e0e0'] }]
          },
          options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
      })();
    </script>`
}
