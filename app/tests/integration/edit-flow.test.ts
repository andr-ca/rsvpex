/**
 * @req PUB-10 — edit flow via rid token; PATCH endpoint; 401 without token
 * @req GUEST-05 — revoked token returns clear error
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/app'

async function seedEventAndRsvp(
  db: D1Database,
): Promise<{ slug: string; rsvpId: string; token: string }> {
  const eventId = crypto.randomUUID()
  const slug = `edit-test-${eventId.slice(0, 8)}`
  await db
    .prepare(
      `INSERT INTO events (id, slug, title, start_at, status, max_guests_total, enable_waitlist,
                        allow_status_choice, max_party_size_per_rsvp, questions, timezone)
     VALUES (?, ?, 'Edit Test Event', '2026-12-01T12:00:00Z', 'published', 100, 0, 1, 10, '[]', 'UTC')`,
    )
    .bind(eventId, slug)
    .run()

  const rsvpId = crypto.randomUUID()
  const token = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO rsvps (id, event_id, name, email, adults, dietary, answers, status, rsvp_token)
     VALUES (?, ?, 'Charlie Brown', 'charlie@example.com', 2, '[]', '{}', 'attending', ?)`,
    )
    .bind(rsvpId, eventId, token)
    .run()

  return { slug, rsvpId, token }
}

describe('GET /rsvp/:slug?rid=<token> — edit mode', () => {
  it('returns 200 with prefilled name', async () => {
    const { slug, token } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(
      new Request(`http://localhost/rsvp/${slug}?rid=${token}`),
      env,
    )
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Charlie Brown')
  })

  it('shows "Editing your RSVP" banner', async () => {
    const { slug, token } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(
      new Request(`http://localhost/rsvp/${slug}?rid=${token}`),
      env,
    )
    const html = await res.text()
    expect(html).toContain('Editing your RSVP')
  })

  it('returns clear error page for revoked/invalid token', async () => {
    const { slug } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(
      new Request(`http://localhost/rsvp/${slug}?rid=invalid-token`),
      env,
    )
    expect(res.status).toBe(403)
    const html = await res.text()
    expect(html).toContain('no longer valid')
  })
})

describe('PATCH /rsvp/:id', () => {
  it('updates RSVP fields and redirects to thank-you', async () => {
    const { rsvpId, token } = await seedEventAndRsvp(env.DB)
    const body = new URLSearchParams({
      rid: token,
      name: 'Charlie Updated',
      email: 'charlie@example.com',
      adults: '3',
      status: 'attending',
    })
    const res = await app.fetch(
      new Request(`http://localhost/rsvp/${rsvpId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/rsvp/thank-you')

    // Verify DB updated
    const row = await env.DB.prepare('SELECT name, adults FROM rsvps WHERE id = ?')
      .bind(rsvpId)
      .first<{ name: string; adults: number }>()
    expect(row?.name).toBe('Charlie Updated')
    expect(row?.adults).toBe(3)
  })

  it('returns 401 when rid token is missing', async () => {
    const { rsvpId } = await seedEventAndRsvp(env.DB)
    const body = new URLSearchParams({
      name: 'No Token',
      email: 'x@example.com',
      adults: '1',
      status: 'attending',
    })
    const res = await app.fetch(
      new Request(`http://localhost/rsvp/${rsvpId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it('returns 401 when rid token does not match the rsvp', async () => {
    const { rsvpId } = await seedEventAndRsvp(env.DB)
    const body = new URLSearchParams({
      rid: 'wrong-token',
      name: 'Hacker',
      email: 'x@example.com',
      adults: '1',
      status: 'attending',
    })
    const res = await app.fetch(
      new Request(`http://localhost/rsvp/${rsvpId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(401)
  })
})
