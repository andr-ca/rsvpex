/**
 * @req PUB-09 — ICS download available from thank-you page
 * @req GAP-01 — ICS includes VTIMEZONE; RFC 5545 valid
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/app'

async function seedEventAndRsvp(db: D1Database): Promise<{ token: string }> {
  const eventId = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO events (id, slug, title, start_at, end_at, status, timezone, location_text)
     VALUES (?, ?, 'Garden Party', '2026-07-15T15:00:00Z', '2026-07-15T18:00:00Z',
             'published', 'America/Toronto', '123 Maple St')`,
    )
    .bind(eventId, `ics-test-${eventId.slice(0, 8)}`)
    .run()

  const rsvpId = crypto.randomUUID()
  const token = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO rsvps (id, event_id, name, email, adults, children_count, dietary, answers, status, rsvp_token)
     VALUES (?, ?, 'Bob Jones', 'bob@example.com', 1, 0, '[]', '{}', 'attending', ?)`,
    )
    .bind(rsvpId, eventId, token)
    .run()

  return { token }
}

describe('GET /rsvp/ics/:rsvpToken', () => {
  it('returns 200 with text/calendar content type', async () => {
    const { token } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(new Request(`http://localhost/rsvp/ics/${token}`), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/calendar')
  })

  it('has Content-Disposition attachment header', async () => {
    const { token } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(new Request(`http://localhost/rsvp/ics/${token}`), env)
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(res.headers.get('content-disposition')).toContain('.ics')
  })

  it('body begins with BEGIN:VCALENDAR', async () => {
    const { token } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(new Request(`http://localhost/rsvp/ics/${token}`), env)
    const text = await res.text()
    expect(text).toMatch(/^BEGIN:VCALENDAR/)
  })

  it('body includes VTIMEZONE', async () => {
    const { token } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(new Request(`http://localhost/rsvp/ics/${token}`), env)
    const text = await res.text()
    expect(text).toContain('BEGIN:VTIMEZONE')
  })

  it('body includes event title as SUMMARY', async () => {
    const { token } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(new Request(`http://localhost/rsvp/ics/${token}`), env)
    const text = await res.text()
    expect(text).toContain('SUMMARY:Garden Party')
  })

  it('returns 404 for unknown token', async () => {
    const res = await app.fetch(new Request(`http://localhost/rsvp/ics/nonexistent-token`), env)
    expect(res.status).toBe(404)
  })
})
