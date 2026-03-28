// app/src/routes/adminData.ts
/**
 * Admin data management routes: CSV export, JSON export, CSV import.
 *
 * NOTE: Uses full-path routing — registered at app.route('/', adminDataRouter).
 *
 * @req ADMIN-08 — CSV export: GET /rsvp/admin/events/:id/export.csv
 * @req ADMIN-09 — JSON export: GET /rsvp/admin/events/:id/export.json?include_tokens=true
 * @req ADMIN-09 — CSV import: POST /rsvp/admin/events/:id/import
 */
import { Hono } from 'hono'
import { getEvent } from '../domain/adminEvents'
import { requireAdmin } from '../middleware/requireAdmin'
import { rsvpsToCsv, rsvpsToJson, parseImportCsv, isSessionFresh } from '../domain/dataManagement'
import type { RsvpExportRow, ImportRow } from '../domain/dataManagement'

const adminDataRouter = new Hono<{ Bindings: Env; Variables: { adminUserId: string } }>()

adminDataRouter.use('/rsvp/admin/events/*', requireAdmin)

// ── CSV Export ─────────────────────────────────────────────────────────────

adminDataRouter.get('/rsvp/admin/events/:id/export.csv', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()

  const rows = await c.env.DB.prepare(
    'SELECT id,name,email,phone,status,adults,parents_count,siblings_count,children_count,party_total,dietary,notes,submitted_at,rsvp_token FROM rsvps WHERE event_id = ? ORDER BY submitted_at ASC',
  )
    .bind(event.id)
    .all<RsvpExportRow>()

  const csv = rsvpsToCsv(rows.results)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `${event.slug}-rsvps-${date}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})

// ── JSON Export ────────────────────────────────────────────────────────────

adminDataRouter.get('/rsvp/admin/events/:id/export.json', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()

  const includeTokens = c.req.query('include_tokens') === 'true'

  if (includeTokens) {
    // Require fresh session (issued within last 15 minutes)
    const sessionId = c.req.raw.headers
      .get('cookie')
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('session_id='))
      ?.slice('session_id='.length)

    if (sessionId) {
      const session = await c.env.DB.prepare('SELECT created_at FROM sessions WHERE id = ? LIMIT 1')
        .bind(sessionId)
        .first<{ created_at: string }>()

      if (!session || !isSessionFresh(session.created_at)) {
        const next = encodeURIComponent(
          `/rsvp/admin/events/${event.id}/export.json?include_tokens=true`,
        )
        return c.json({ error: 'reauth_required', redirect: `/rsvp/admin/login?next=${next}` }, 403)
      }
    } else {
      return c.json({ error: 'reauth_required', redirect: '/rsvp/admin/login' }, 403)
    }
  }

  const rows = await c.env.DB.prepare(
    'SELECT id,name,email,phone,status,adults,parents_count,siblings_count,children_count,party_total,dietary,notes,submitted_at,rsvp_token FROM rsvps WHERE event_id = ? ORDER BY submitted_at ASC',
  )
    .bind(event.id)
    .all<RsvpExportRow>()

  const data = rsvpsToJson(rows.results)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `${event.slug}-rsvps-${date}.json`

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})

// ── CSV Import ─────────────────────────────────────────────────────────────

const MAX_IMPORT_SIZE = 1024 * 1024 // 1 MB
const MAX_IMPORT_ROWS = 1000

adminDataRouter.post('/rsvp/admin/events/:id/import', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()

  // Parse multipart form data
  let csvText: string
  try {
    const formData = await c.req.formData()
    const file = formData.get('csv_file')
    if (!file || typeof file === 'string') {
      return c.json({ error: 'csv_file field required' }, 400)
    }
    if ((file as File).size > MAX_IMPORT_SIZE) {
      return c.json({ error: 'File too large. Maximum size is 1 MB.' }, 400)
    }
    csvText = await (file as File).text()
  } catch {
    return c.json({ error: 'Failed to parse form data' }, 400)
  }

  const parsed = parseImportCsv(csvText)
  if (!parsed.valid) {
    return c.json(
      { error: parsed.headerError ?? 'Invalid CSV', imported: 0, failed: 0, errors: [] },
      400,
    )
  }

  const dataRows = parsed.rows.filter((r): r is { rowNum: number; data: ImportRow } => 'data' in r)
  const errorRows = parsed.rows.filter((r): r is { rowNum: number; error: string } => 'error' in r)

  if (dataRows.length > MAX_IMPORT_ROWS) {
    return c.json(
      {
        error: `Too many rows. Maximum is ${MAX_IMPORT_ROWS} per import.`,
        imported: 0,
        failed: 0,
        errors: [],
      },
      400,
    )
  }

  let imported = 0
  const errors: Array<{ row: number; reason: string }> = errorRows.map((e) => ({
    row: e.rowNum,
    reason: e.error,
  }))

  for (const { rowNum, data } of dataRows) {
    // Duplicate email check
    if (data.email) {
      const existing = await c.env.DB.prepare(
        'SELECT id FROM rsvps WHERE event_id = ? AND lower(email) = lower(?) LIMIT 1',
      )
        .bind(event.id, data.email)
        .first<{ id: string }>()
      if (existing) {
        errors.push({ row: rowNum, reason: `duplicate email: ${data.email}` })
        continue
      }
    }

    const id = crypto.randomUUID()
    const token = crypto.randomUUID()
    const now = new Date().toISOString()

    try {
      await c.env.DB.prepare(
        `
        INSERT INTO rsvps (id, event_id, name, email, phone, status, adults, parents_count, siblings_count, children_count, dietary, notes, answers, rsvp_token, source, submitted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, '{}', ?, 'import', ?, ?, ?)
      `,
      )
        .bind(
          id,
          event.id,
          data.name,
          data.email ?? null,
          data.phone ?? null,
          data.status ?? 'attending',
          data.adults ?? 1,
          data.parents_count ?? 0,
          data.siblings_count ?? 0,
          data.children_count ?? 0,
          data.notes ?? null,
          token,
          now,
          now,
          now,
        )
        .run()
      imported++
    } catch (err) {
      errors.push({
        row: rowNum,
        reason: `DB error: ${err instanceof Error ? err.message : 'unknown'}`,
      })
    }
  }

  return c.json({ imported, failed: errors.length, errors })
})

export default adminDataRouter
