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
import { getCookie } from 'hono/cookie'
import { getEvent } from '../domain/adminEvents'
import { requireAdmin } from '../middleware/requireAdmin'
import { writeAuditLog } from '../domain/audit'
import { hashToken } from '../domain/adminAuth'
import { rsvpsToCsv, rsvpsToJson, parseImportCsv, isSessionFresh } from '../domain/dataManagement'
import type { RsvpExportRow, ImportRow } from '../domain/dataManagement'

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

  // @req SEC-04 — exports touch every guest's PII; audit them (C-13 in recommendations.md).
  fireAuditLog(
    c,
    writeAuditLog(c.env.DB, {
      actorId: c.get('adminUserId'),
      entityType: 'event',
      entityId: event.id,
      action: 'export',
      diff: { format: 'csv', row_count: rows.results.length },
    }),
  )

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
    const sessionId = getCookie(c, 'session_id')

    if (sessionId) {
      // Sessions are stored as SHA-256(token), not the raw cookie value
      // (S-15 in recommendations.md) — hash before looking up.
      const session = await c.env.DB.prepare('SELECT created_at FROM sessions WHERE id = ? LIMIT 1')
        .bind(await hashToken(sessionId))
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

  fireAuditLog(
    c,
    writeAuditLog(c.env.DB, {
      actorId: c.get('adminUserId'),
      entityType: 'event',
      entityId: event.id,
      action: 'export',
      diff: { format: 'json', row_count: rows.results.length, include_tokens: includeTokens },
    }),
  )

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

  // Prefetch existing emails in ONE query instead of one SELECT per row, and
  // insert via db.batch() in chunks instead of one INSERT per row (C-8 in
  // recommendations.md: up to 1000 rows × 2 sequential D1 round-trips could
  // exceed Workers subrequest limits and made large imports slow/fragile).
  const existingEmailsResult = await c.env.DB.prepare(
    'SELECT lower(email) as email FROM rsvps WHERE event_id = ? AND email IS NOT NULL',
  )
    .bind(event.id)
    .all<{ email: string }>()
  const existingEmails = new Set(existingEmailsResult.results.map((r) => r.email))

  const now = new Date().toISOString()
  const toInsert: Array<{ rowNum: number; data: ImportRow; id: string; token: string }> = []

  for (const { rowNum, data } of dataRows) {
    if (data.email) {
      const emailLower = data.email.toLowerCase()
      if (existingEmails.has(emailLower)) {
        errors.push({ row: rowNum, reason: `duplicate email: ${data.email}` })
        continue
      }
      existingEmails.add(emailLower) // catch duplicates within the same CSV too
    }
    toInsert.push({ rowNum, data, id: crypto.randomUUID(), token: crypto.randomUUID() })
  }

  const buildInsert = (row: { data: ImportRow; id: string; token: string }) =>
    c.env.DB.prepare(
      `INSERT INTO rsvps (id, event_id, name, email, phone, status, adults, parents_count, siblings_count, children_count, dietary, notes, answers, rsvp_token, source, submitted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, '{}', ?, 'import', ?, ?, ?)`,
    ).bind(
      row.id,
      event.id,
      row.data.name,
      row.data.email ?? null,
      row.data.phone ?? null,
      row.data.status ?? 'attending',
      row.data.adults ?? 1,
      row.data.parents_count ?? 0,
      row.data.siblings_count ?? 0,
      row.data.children_count ?? 0,
      row.data.notes ?? null,
      row.token,
      now,
      now,
      now,
    )

  const BATCH_SIZE = 50
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const chunk = toInsert.slice(i, i + BATCH_SIZE)
    try {
      await c.env.DB.batch(chunk.map(buildInsert))
      imported += chunk.length
    } catch {
      // A batch failure doesn't identify which row failed — fall back to
      // per-row inserts for just this chunk so one bad row doesn't sink it.
      for (const row of chunk) {
        try {
          await buildInsert(row).run()
          imported++
        } catch (rowErr) {
          errors.push({
            row: row.rowNum,
            reason: `DB error: ${rowErr instanceof Error ? rowErr.message : 'unknown'}`,
          })
        }
      }
    }
  }

  fireAuditLog(
    c,
    writeAuditLog(c.env.DB, {
      actorId: c.get('adminUserId'),
      entityType: 'event',
      entityId: event.id,
      action: 'import',
      diff: { imported, failed: errors.length },
    }),
  )

  return c.json({ imported, failed: errors.length, errors })
})

export default adminDataRouter
