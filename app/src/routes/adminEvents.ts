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
  createEvent,
  getEvent,
  listEvents,
  updateEvent,
  publishEvent,
  archiveEvent,
  getEventStats,
  type EventRow,
} from '../domain/adminEvents'
import { requireAdmin } from '../middleware/requireAdmin'
import { writeAuditLog, buildDiff } from '../domain/audit'
import { escHtml, adminPage, csrfField } from '../views/layout'
import { localToUtc, utcToLocal } from '../domain/timezone'
import { appendOwnershipFilter, verifyEventOwnership } from '../domain/authorization'
import { getAdminRole } from '../domain/adminAuth'

/** Fire-and-forget audit log write; ignores errors and missing ExecutionContext. */
function fireAuditLog(
  c: { executionCtx?: { waitUntil: (p: Promise<unknown>) => void } },
  p: Promise<void>,
): void {
  try {
    c.executionCtx?.waitUntil(p.catch(() => {}))
  } catch {
    void p.catch(() => {})
  }
}

/**
 * Converts the datetime-local fields of a parsed event form submission from
 * event-local wall-clock time to UTC ISO-8601 (C-5 in recommendations.md).
 * Returns `{ error }` instead of throwing so callers can render a normal
 * form-validation error rather than a 500 on a garbled timezone name.
 */
function normalizeEventTimes<
  T extends {
    timezone: string
    start_at: string
    end_at?: string
    opens_at?: string
    closes_at?: string
  },
>(
  d: T,
):
  | { start_at: string; end_at?: string; opens_at?: string; closes_at?: string }
  | { error: string } {
  try {
    return {
      start_at: localToUtc(d.timezone, d.start_at),
      end_at: d.end_at ? localToUtc(d.timezone, d.end_at) : undefined,
      opens_at: d.opens_at ? localToUtc(d.timezone, d.opens_at) : undefined,
      closes_at: d.closes_at ? localToUtc(d.timezone, d.closes_at) : undefined,
    }
  } catch {
    return { error: 'Invalid timezone or date/time value.' }
  }
}

type Variables = { adminUserId: string; csrfToken?: string }

const adminEventsRouter = new Hono<{ Bindings: Env; Variables: Variables }>()

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
  // A blank <input type="number"> submits "" (not omitted), and z.coerce.number()
  // turns "" into 0 — which then fails .min(1) instead of being treated as
  // "no cap set". Previously undiscovered: this made "unlimited guests" (the
  // common case of leaving this field blank) impossible — every such event
  // creation/edit failed validation. preprocess() maps blank to undefined
  // first so .optional() actually takes effect.
  max_guests_total: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.coerce.number().int().min(1).optional().nullable(),
  ),
  max_party_size_per_rsvp: z.coerce.number().int().min(1).max(100).default(10),
  opens_at: z.string().optional(),
  closes_at: z.string().optional(),
  notify_via_email: z.coerce.boolean().optional().default(true),
  notify_via_sms: z.coerce.boolean().optional().default(false),
  reminder_days_before: z.coerce.number().int().min(0).max(365).optional(),
  questions: z
    .string()
    .max(20000)
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === '') return true
        try {
          return Array.isArray(JSON.parse(val))
        } catch {
          return false
        }
      },
      { message: 'Questions must be a valid JSON array' },
    ),
})

// GET /rsvp/admin/events — list all events
adminEventsRouter.get('/rsvp/admin/events', async (c) => {
  const role = await getAdminRole(c.env.DB, c.var.adminUserId)
  const filter = appendOwnershipFilter(role, c.var.adminUserId, 'events')

  const result = await c.env.DB.prepare(
    `SELECT * FROM events WHERE archived_at IS NULL ${filter} ORDER BY start_at DESC`,
  )
    .bind(role === 'host' ? [c.var.adminUserId] : [])
    .all<EventRow>()

  const events = result.results
  return c.html(
    adminPage(
      'Events — RSVPex Admin',
      `
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
        ${events
          .map(
            (e) => `
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
        `,
          )
          .join('')}
      </tbody>
    </table>
  `,
      c.get('csrfToken'),
    ),
  )
})

// GET /rsvp/admin/events/new — new event form
adminEventsRouter.get('/rsvp/admin/events/new', (c) => {
  const csrfToken = c.get('csrfToken') ?? ''
  return c.html(
    adminPage(
      'New Event — RSVPex Admin',
      `
    <h1>New Event</h1>
    ${eventForm(null, csrfToken)}
  `,
      csrfToken,
    ),
  )
})

// POST /rsvp/admin/events — create event
adminEventsRouter.post('/rsvp/admin/events', async (c) => {
  const csrfToken = c.get('csrfToken') ?? ''
  const body = await c.req.parseBody()
  const parsed = eventSchema.safeParse(body)
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    return c.html(
      adminPage(
        'New Event — RSVPex Admin',
        `
      <h1>New Event</h1>
      <div class="error">${Object.values(errors).flat().join(', ')}</div>
      ${eventForm(null, csrfToken, body as Record<string, string>)}
    `,
        csrfToken,
      ),
      422,
    )
  }
  const d = parsed.data
  const times = normalizeEventTimes(d)
  if ('error' in times) {
    return c.html(
      adminPage(
        'New Event — RSVPex Admin',
        `
      <h1>New Event</h1>
      <div class="error">${escHtml(times.error)}</div>
      ${eventForm(null, csrfToken, body as Record<string, string>)}
    `,
        csrfToken,
      ),
      422,
    )
  }
  const questionsJson = d.questions && d.questions.trim() !== '' ? d.questions : '[]'
  const id = await createEvent(
    c.env.DB,
    {
      title: d.title,
      slug: d.slug,
      hostName: d.host_name,
      descriptionHtml: d.description_html,
      timezone: d.timezone,
      startAt: times.start_at,
      endAt: times.end_at,
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
      questions: questionsJson,
    },
    c.var.adminUserId,
  )
  fireAuditLog(
    c,
    writeAuditLog(c.env.DB, {
      actorId: c.get('adminUserId'),
      entityType: 'event',
      entityId: id,
      action: 'create',
      diff: { title: d.title, slug: d.slug, start_at: d.start_at, visibility: d.visibility },
    }),
  )
  return c.redirect(`/rsvp/admin/events/${id}`, 303)
})

// GET /rsvp/admin/events/:id — event detail
adminEventsRouter.get('/rsvp/admin/events/:id', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()

  // Verify event ownership for hosts
  const role = await getAdminRole(c.env.DB, c.var.adminUserId)
  const owns = await verifyEventOwnership(c.env.DB, event.id, c.var.adminUserId, role)
  if (!owns) return c.notFound()

  const stats = await getEventStats(c.env.DB, event.id)
  const csrfToken = c.get('csrfToken') ?? ''
  const capacityStr =
    stats.capacity != null ? `${stats.attending}/${stats.capacity}` : `${stats.attending} attending`
  return c.html(
    adminPage(
      `${escHtml(event.title)} — RSVPex Admin`,
      `
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
      <dt>Starts</dt><dd>${escHtml(String(event.start_at))} (${escHtml(String(event.timezone))})</dd>
      <dt>Visibility</dt><dd>${event.visibility}</dd>
      <dt>Capacity</dt><dd>${capacityStr}</dd>
      <dt>Locale</dt><dd>${event.locale}</dd>
      <dt>Waitlist</dt><dd>${event.enable_waitlist ? 'Enabled' : 'Disabled'}</dd>
    </dl>
    <div class="action-row">
      ${
        event.status === 'draft'
          ? `
        <form method="POST" action="/rsvp/admin/events/${event.id}/publish" style="display:inline">
          ${csrfField(csrfToken)}
          <button type="submit" class="btn btn-primary">Publish Event</button>
        </form>
      `
          : ''
      }
      ${
        event.status !== 'archived'
          ? `
        <form method="POST" action="/rsvp/admin/events/${event.id}/archive" style="display:inline" data-confirm="Archive this event?">
          ${csrfField(csrfToken)}
          <button type="submit">Archive</button>
        </form>
      `
          : ''
      }
    </div>
    ${chartSection(event.id, stats)}
  `,
      csrfToken,
    ),
  )
})

// GET /rsvp/admin/events/:id/edit — edit form
adminEventsRouter.get('/rsvp/admin/events/:id/edit', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()

  // Verify event ownership for hosts
  const role = await getAdminRole(c.env.DB, c.var.adminUserId)
  const owns = await verifyEventOwnership(c.env.DB, event.id, c.var.adminUserId, role)
  if (!owns) return c.notFound()

  const csrfToken = c.get('csrfToken') ?? ''
  return c.html(
    adminPage(
      `Edit ${escHtml(event.title)} — RSVPex Admin`,
      `
    <h1>Edit Event</h1>
    ${event.status === 'published' ? '<div class="warning">This event is published — changes will affect the live form immediately.</div>' : ''}
    ${eventForm(event, csrfToken)}
  `,
      csrfToken,
    ),
  )
})

// POST /rsvp/admin/events/:id/edit — save event edits
adminEventsRouter.post('/rsvp/admin/events/:id/edit', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()

  // Verify event ownership for hosts
  const role = await getAdminRole(c.env.DB, c.var.adminUserId)
  const owns = await verifyEventOwnership(c.env.DB, event.id, c.var.adminUserId, role)
  if (!owns) return c.notFound()

  const csrfToken = c.get('csrfToken') ?? ''
  const body = await c.req.parseBody()
  const parsed = eventSchema.safeParse(body)
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    return c.html(
      adminPage(
        `Edit ${escHtml(event.title)} — RSVPex Admin`,
        `
      <h1>Edit Event</h1>
      <div class="error">${Object.values(errors).flat().join(', ')}</div>
      ${eventForm(event, csrfToken, body as Record<string, string>)}
    `,
        csrfToken,
      ),
      422,
    )
  }
  const d = parsed.data
  const times = normalizeEventTimes(d)
  if ('error' in times) {
    return c.html(
      adminPage(
        `Edit ${escHtml(event.title)} — RSVPex Admin`,
        `
      <h1>Edit Event</h1>
      <div class="error">${escHtml(times.error)}</div>
      ${eventForm(event, csrfToken, body as Record<string, string>)}
    `,
        csrfToken,
      ),
      422,
    )
  }
  const questionsJson = d.questions && d.questions.trim() !== '' ? d.questions : undefined
  await updateEvent(c.env.DB, event.id, {
    title: d.title,
    hostName: d.host_name,
    descriptionHtml: d.description_html,
    timezone: d.timezone,
    startAt: times.start_at,
    endAt: times.end_at,
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
    opensAt: times.opens_at,
    closesAt: times.closes_at,
    notifyViaEmail: d.notify_via_email,
    notifyViaSms: d.notify_via_sms,
    reminderDaysBefore: d.reminder_days_before,
    questions: questionsJson,
  })

  // @req SEC-04 — audit diff built from actual before/after values, not a hand-rolled
  // stub (C-13 in recommendations.md). Events carry no PII, so no redactPii() needed.
  const before: Record<string, unknown> = {
    title: event.title,
    host_name: event.host_name,
    timezone: event.timezone,
    start_at: event.start_at,
    end_at: event.end_at,
    location_text: event.location_text,
    wishlist_url: event.wishlist_url,
    visibility: event.visibility,
    is_kids_event: Boolean(event.is_kids_event),
    allow_children: Boolean(event.allow_children),
    allow_siblings: Boolean(event.allow_siblings),
    allow_parents: Boolean(event.allow_parents),
    allow_status_choice: Boolean(event.allow_status_choice),
    enable_waitlist: Boolean(event.enable_waitlist),
    enable_heuristic_dup_check: Boolean(event.enable_heuristic_dup_check),
    locale: event.locale,
    max_guests_total: event.max_guests_total,
    max_party_size_per_rsvp: event.max_party_size_per_rsvp,
    opens_at: event.opens_at,
    closes_at: event.closes_at,
    notify_via_email: Boolean(event.notify_via_email),
    notify_via_sms: Boolean(event.notify_via_sms),
    reminder_days_before: event.reminder_days_before,
  }
  const after: Record<string, unknown> = {
    title: d.title,
    host_name: d.host_name ?? null,
    timezone: d.timezone,
    start_at: times.start_at,
    end_at: times.end_at ?? null,
    location_text: d.location_text ?? null,
    wishlist_url: d.wishlist_url || null,
    visibility: d.visibility,
    is_kids_event: d.is_kids_event,
    allow_children: d.allow_children,
    allow_siblings: d.allow_siblings,
    allow_parents: d.allow_parents,
    allow_status_choice: d.allow_status_choice,
    enable_waitlist: d.enable_waitlist,
    enable_heuristic_dup_check: d.enable_heuristic_dup_check,
    locale: d.locale,
    max_guests_total: d.max_guests_total ?? null,
    max_party_size_per_rsvp: d.max_party_size_per_rsvp,
    opens_at: times.opens_at ?? null,
    closes_at: times.closes_at ?? null,
    notify_via_email: d.notify_via_email,
    notify_via_sms: d.notify_via_sms,
    reminder_days_before: d.reminder_days_before ?? null,
  }
  fireAuditLog(
    c,
    writeAuditLog(c.env.DB, {
      actorId: c.get('adminUserId'),
      entityType: 'event',
      entityId: event.id,
      action: 'update',
      diff: buildDiff(before, after),
    }),
  )
  return c.redirect(`/rsvp/admin/events/${event.id}?saved=1`, 303)
})

// POST /rsvp/admin/events/:id/publish
adminEventsRouter.post('/rsvp/admin/events/:id/publish', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()

  // Verify event ownership for hosts
  const role = await getAdminRole(c.env.DB, c.var.adminUserId)
  const owns = await verifyEventOwnership(c.env.DB, event.id, c.var.adminUserId, role)
  if (!owns) return c.notFound()

  await publishEvent(c.env.DB, event.id)
  fireAuditLog(
    c,
    writeAuditLog(c.env.DB, {
      actorId: c.get('adminUserId'),
      entityType: 'event',
      entityId: event.id,
      action: 'publish',
      diff: null,
    }),
  )
  return c.redirect(`/rsvp/admin/events/${event.id}?published=1`, 303)
})

// POST /rsvp/admin/events/:id/archive
adminEventsRouter.post('/rsvp/admin/events/:id/archive', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()

  // Verify event ownership for hosts
  const role = await getAdminRole(c.env.DB, c.var.adminUserId)
  const owns = await verifyEventOwnership(c.env.DB, event.id, c.var.adminUserId, role)
  if (!owns) return c.notFound()

  await archiveEvent(c.env.DB, event.id)
  fireAuditLog(
    c,
    writeAuditLog(c.env.DB, {
      actorId: c.get('adminUserId'),
      entityType: 'event',
      entityId: event.id,
      action: 'archive',
      diff: null,
    }),
  )
  return c.redirect(`/rsvp/admin/events`, 303)
})

export default adminEventsRouter

// ── Shared helpers ─────────────────────────────────────────────────────────

function eventForm(
  event: Record<string, unknown> | null,
  csrfToken: string,
  override?: Record<string, string>,
): string {
  // Datetime fields are stored as UTC ISO-8601 (C-5 in recommendations.md) but
  // <input type="datetime-local"> needs a zoneless local wall-clock string —
  // convert back using the event's own timezone when pre-filling from a saved
  // event. `override` (a re-rendered form after a validation error) is already
  // the raw local string the admin typed, so it passes through untouched.
  const DATETIME_FIELDS = new Set(['start_at', 'end_at', 'opens_at', 'closes_at'])
  const v = (field: string, fallback = '') => {
    if (override?.[field] !== undefined) return escHtml(String(override[field]))
    const raw = event?.[field as keyof typeof event]
    if (raw !== undefined && raw !== null) {
      if (DATETIME_FIELDS.has(field)) {
        return escHtml(utcToLocal(String(event?.timezone ?? 'UTC'), String(raw)))
      }
      return escHtml(String(raw))
    }
    return fallback
  }
  // Fields the Zod schema defaults to true when absent from the POST body
  // (checkboxes send nothing when unchecked, so "checked by default" here
  // must mirror eventSchema's z.coerce.boolean().default(...) — see C-2 in
  // recommendations.md: the old form omitted these controls entirely, so
  // saving an edit silently reset them to their new-event defaults).
  const DEFAULT_CHECKED = new Set([
    'allow_children',
    'allow_siblings',
    'allow_parents',
    'allow_status_choice',
    'notify_via_email',
  ])
  const checked = (field: string) => {
    if (override?.[field] !== undefined) return override[field] ? 'checked' : ''
    if (event) return (event as Record<string, unknown>)[field] ? 'checked' : ''
    return DEFAULT_CHECKED.has(field) ? 'checked' : ''
  }
  const questionsValue = (): string => {
    if (override?.questions !== undefined) return escHtml(override.questions)
    if (event?.questions !== undefined) {
      try {
        const parsed = JSON.parse(String(event.questions))
        return escHtml(
          Array.isArray(parsed) && parsed.length > 0 ? JSON.stringify(parsed, null, 2) : '',
        )
      } catch {
        return ''
      }
    }
    return ''
  }
  const action = event
    ? `/rsvp/admin/events/${(event as { id: string }).id}/edit`
    : '/rsvp/admin/events'

  return `<form method="POST" action="${action}">
    ${csrfField(csrfToken)}
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
    <div class="form-row">
      <div>
        <label for="max_party_size_per_rsvp">Max Party Size per RSVP</label>
        <input id="max_party_size_per_rsvp" name="max_party_size_per_rsvp" type="number" min="1" max="100" value="${v('max_party_size_per_rsvp', '10')}">
      </div>
      <div>
        <label for="reminder_days_before">Reminder Email — Days Before Event</label>
        <input id="reminder_days_before" name="reminder_days_before" type="number" min="0" max="365" value="${v('reminder_days_before')}">
      </div>
    </div>
    <div class="form-row">
      <div>
        <label for="opens_at">RSVPs Open At (leave blank for immediately)</label>
        <input id="opens_at" name="opens_at" type="datetime-local" value="${v('opens_at')}">
      </div>
      <div>
        <label for="closes_at">RSVPs Close At (leave blank for never)</label>
        <input id="closes_at" name="closes_at" type="datetime-local" value="${v('closes_at')}">
      </div>
    </div>
    <label for="location_text">Location</label>
    <input id="location_text" name="location_text" maxlength="300" value="${v('location_text')}">
    <label for="wishlist_url">Gift Registry URL</label>
    <input id="wishlist_url" name="wishlist_url" type="url" value="${v('wishlist_url')}">
    <label for="description_html">Description (HTML allowed)</label>
    <textarea id="description_html" name="description_html">${v('description_html')}</textarea>
    <label for="questions">Custom Questions (JSON array, optional)</label>
    <textarea id="questions" name="questions" rows="6" placeholder='[{"id":"q1","type":"short_text","label":"T-shirt size","required":false}]'>${questionsValue()}</textarea>
    <p style="font-size:.85rem;color:#666;margin-top:.25rem">
      Each question needs <code>id</code>, <code>type</code> (short_text, long_text, boolean, single_select, multi_select), <code>label</code>,
      optional <code>required</code>, and <code>options</code> (array of strings, for select types). Leave blank for none.
    </p>
    <div class="form-check">
      <input id="enable_waitlist" name="enable_waitlist" type="checkbox" value="true" ${checked('enable_waitlist')}>
      <label for="enable_waitlist" style="font-weight:normal">Enable waitlist when at capacity</label>
    </div>
    <div class="form-check">
      <input id="is_kids_event" name="is_kids_event" type="checkbox" value="true" ${checked('is_kids_event')}>
      <label for="is_kids_event" style="font-weight:normal">Kids event (show children/siblings/parents fields)</label>
    </div>
    <div class="form-check">
      <input id="allow_children" name="allow_children" type="checkbox" value="true" ${checked('allow_children')}>
      <label for="allow_children" style="font-weight:normal">Allow children field</label>
    </div>
    <div class="form-check">
      <input id="allow_siblings" name="allow_siblings" type="checkbox" value="true" ${checked('allow_siblings')}>
      <label for="allow_siblings" style="font-weight:normal">Allow siblings field</label>
    </div>
    <div class="form-check">
      <input id="allow_parents" name="allow_parents" type="checkbox" value="true" ${checked('allow_parents')}>
      <label for="allow_parents" style="font-weight:normal">Allow additional-parents field</label>
    </div>
    <div class="form-check">
      <input id="allow_status_choice" name="allow_status_choice" type="checkbox" value="true" ${checked('allow_status_choice')}>
      <label for="allow_status_choice" style="font-weight:normal">Let guests choose attending / maybe / not attending</label>
    </div>
    <div class="form-check">
      <input id="enable_heuristic_dup_check" name="enable_heuristic_dup_check" type="checkbox" value="true" ${checked('enable_heuristic_dup_check')}>
      <label for="enable_heuristic_dup_check" style="font-weight:normal">Heuristic duplicate detection (same name + contact within 5 min)</label>
    </div>
    <div class="form-check">
      <input id="notify_via_email" name="notify_via_email" type="checkbox" value="true" ${checked('notify_via_email')}>
      <label for="notify_via_email" style="font-weight:normal">Email notifications</label>
    </div>
    <div class="form-check">
      <input id="notify_via_sms" name="notify_via_sms" type="checkbox" value="true" ${checked('notify_via_sms')}>
      <label for="notify_via_sms" style="font-weight:normal">SMS notifications</label>
    </div>
    <div class="action-row">
      <button type="submit" class="btn btn-primary">${event ? 'Save Changes' : 'Create Event'}</button>
      <a href="${event ? `/rsvp/admin/events/${(event as { id: string }).id}` : '/rsvp/admin/events'}" class="btn">Cancel</a>
    </div>
  </form>`
}

function chartSection(
  eventId: string,
  stats: {
    attending: number
    waitlist: number
    not_attending: number
    maybe: number
    capacity: number | null
  },
): string {
  // JSON-typed <script> islands are inert (never executed by the browser), so
  // they're unaffected by the CSP script-src allowlist — this is how chart data
  // reaches the external bootstrap script without an inline <script> block.
  // See P0-5 in recommendations.md: the previous inline `new Chart(...)` script
  // was silently dropped by the admin CSP, so no charts ever rendered.
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
    <script type="application/json" data-chart-stats>${data}</script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>`
}
