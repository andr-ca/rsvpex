// app/tests/integration/admin-data.test.ts
/**
 * @req ADMIN-08 — CSV export: GET /rsvp/admin/events/:id/export.csv
 * @req ADMIN-09 — JSON export: GET /rsvp/admin/events/:id/export.json?include_tokens=true
 * @req ADMIN-09 — CSV import: POST /rsvp/admin/events/:id/import
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/app'
import { hashPassword, createSession } from '../../src/domain/adminAuth'
import { createEvent } from '../../src/domain/adminEvents'

const baseEvent = {
  title: 'Data Mgmt Test', timezone: 'UTC', startAt: '2027-01-01T18:00:00Z',
  visibility: 'public' as const, isKidsEvent: false, allowChildren: true,
  allowSiblings: true, allowParents: true, allowStatusChoice: true,
  enableWaitlist: false, enableHeuristicDupCheck: false, locale: 'en' as const,
  maxPartySizePerRsvp: 10, notifyViaEmail: true, notifyViaSms: false, questions: '[]',
}

async function seedAdminSession(db: D1Database, fresh = true): Promise<{ cookie: string; sessionId: string }> {
  const id = crypto.randomUUID()
  const hash = await hashPassword('pass1234')
  await db.prepare(`INSERT INTO admin_users (id, email, password_hash) VALUES (?, ?, ?)`)
    .bind(id, `admin${id.slice(0, 6)}@test.com`, hash).run()
  const sessionId = await createSession(db, id, 7)
  if (!fresh) {
    // Make session appear old (20 minutes ago) to fail the 15-minute freshness gate
    const oldTime = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    await db.prepare('UPDATE sessions SET created_at = ? WHERE id = ?').bind(oldTime, sessionId).run()
  }
  return { cookie: `session_id=${sessionId}`, sessionId }
}

async function seedEvent(db: D1Database): Promise<string> {
  return createEvent(db, baseEvent)
}

async function seedRsvp(db: D1Database, eventId: string, name: string, email: string) {
  const id = crypto.randomUUID()
  await db.prepare(
    `INSERT INTO rsvps (id, event_id, name, email, adults, status, rsvp_token, dietary, answers, children_ages)
     VALUES (?, ?, ?, ?, 2, 'attending', ?, '[]', '{}', '[]')`
  ).bind(id, eventId, name, email, crypto.randomUUID()).run()
  return id
}

// ── CSV Export ──────────────────────────────────────────────────────────────

describe('GET /rsvp/admin/events/:id/export.csv', () => {
  it('returns 302 without auth', async () => {
    const eventId = await seedEvent(env.DB)
    const res = await app.fetch(
      new Request(`http://localhost/rsvp/admin/events/${eventId}/export.csv`),
      env
    )
    expect(res.status).toBe(302)
  })

  it('returns CSV with correct headers and rows when authenticated', async () => {
    const eventId = await seedEvent(env.DB)
    await seedRsvp(env.DB, eventId, 'Alice Smith', 'alice@example.com')
    const { cookie } = await seedAdminSession(env.DB)

    const res = await app.fetch(
      new Request(`http://localhost/rsvp/admin/events/${eventId}/export.csv`, {
        headers: { Cookie: cookie },
      }),
      env
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename=".+\.csv"/)

    const text = await res.text()
    const lines = text.trim().split('\n')
    // Header row
    expect(lines[0]).toContain('name')
    expect(lines[0]).toContain('email')
    expect(lines[0]).toContain('status')
    // Data row
    expect(text).toContain('Alice Smith')
    expect(text).toContain('alice@example.com')
  })
})

// ── JSON Export ────────────────────────────────────────────────────────────

describe('GET /rsvp/admin/events/:id/export.json', () => {
  it('returns JSON without tokens by default (no include_tokens param)', async () => {
    const eventId = await seedEvent(env.DB)
    await seedRsvp(env.DB, eventId, 'Bob Jones', 'bob@example.com')
    const { cookie } = await seedAdminSession(env.DB)

    const res = await app.fetch(
      new Request(`http://localhost/rsvp/admin/events/${eventId}/export.json`, {
        headers: { Cookie: cookie },
      }),
      env
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')

    const body = await res.json() as Array<Record<string, unknown>>
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toHaveProperty('name')
    expect(body[0]).toHaveProperty('email')
  })

  it('returns 403 with reauth_required when session is stale and include_tokens=true', async () => {
    const eventId = await seedEvent(env.DB)
    const { cookie } = await seedAdminSession(env.DB, false) // stale session

    const res = await app.fetch(
      new Request(`http://localhost/rsvp/admin/events/${eventId}/export.json?include_tokens=true`, {
        headers: { Cookie: cookie },
      }),
      env
    )
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string; redirect: string }
    expect(body.error).toBe('reauth_required')
    expect(body.redirect).toContain('/rsvp/admin/login')
  })

  it('returns JSON with rsvp_token when session is fresh and include_tokens=true', async () => {
    const eventId = await seedEvent(env.DB)
    await seedRsvp(env.DB, eventId, 'Carol White', 'carol@example.com')
    const { cookie } = await seedAdminSession(env.DB, true) // fresh session

    const res = await app.fetch(
      new Request(`http://localhost/rsvp/admin/events/${eventId}/export.json?include_tokens=true`, {
        headers: { Cookie: cookie },
      }),
      env
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Array<Record<string, unknown>>
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toHaveProperty('rsvp_token')
    expect(typeof body[0].rsvp_token).toBe('string')
  })
})

// ── CSV Import ─────────────────────────────────────────────────────────────

describe('POST /rsvp/admin/events/:id/import', () => {
  it('imports valid CSV rows and returns counts', async () => {
    const eventId = await seedEvent(env.DB)
    const { cookie } = await seedAdminSession(env.DB)

    const csvContent = 'name,email,status,adults\nDave Brown,dave@example.com,attending,2\nEve Davis,eve@example.com,attending,1'
    const formData = new FormData()
    formData.append('csv_file', new File([csvContent], 'import.csv', { type: 'text/csv' }))

    const res = await app.fetch(
      new Request(`http://localhost/rsvp/admin/events/${eventId}/import`, {
        method: 'POST',
        headers: { Cookie: cookie },
        body: formData,
      }),
      env
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { imported: number; failed: number; errors: unknown[] }
    expect(body.imported).toBe(2)
    expect(body.failed).toBe(0)
    expect(body.errors).toHaveLength(0)
  })

  it('returns duplicate email error when importing existing email', async () => {
    const eventId = await seedEvent(env.DB)
    await seedRsvp(env.DB, eventId, 'Existing Guest', 'dupe@example.com')
    const { cookie } = await seedAdminSession(env.DB)

    const csvContent = 'name,email,status\nDuplicate Person,dupe@example.com,attending'
    const formData = new FormData()
    formData.append('csv_file', new File([csvContent], 'import.csv', { type: 'text/csv' }))

    const res = await app.fetch(
      new Request(`http://localhost/rsvp/admin/events/${eventId}/import`, {
        method: 'POST',
        headers: { Cookie: cookie },
        body: formData,
      }),
      env
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { imported: number; failed: number; errors: Array<{ row: number; reason: string }> }
    expect(body.imported).toBe(0)
    expect(body.failed).toBe(1)
    expect(body.errors[0].reason).toContain('duplicate email')
  })

  it('returns 400 when required "name" column is missing', async () => {
    const eventId = await seedEvent(env.DB)
    const { cookie } = await seedAdminSession(env.DB)

    const csvContent = 'email,status\nfoo@example.com,attending'
    const formData = new FormData()
    formData.append('csv_file', new File([csvContent], 'import.csv', { type: 'text/csv' }))

    const res = await app.fetch(
      new Request(`http://localhost/rsvp/admin/events/${eventId}/import`, {
        method: 'POST',
        headers: { Cookie: cookie },
        body: formData,
      }),
      env
    )
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('name')
  })
})
