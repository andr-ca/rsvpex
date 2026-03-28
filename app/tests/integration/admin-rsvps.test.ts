// app/tests/integration/admin-rsvps.test.ts
/**
 * @req ADMIN-05 — RSVP list with filters
 * @req ADMIN-10 — Waitlist promotion
 * @req GAP-04 — Admin edit capacity guard
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/app'
import { hashPassword, createSession } from '../../src/domain/adminAuth'
import { createEvent } from '../../src/domain/adminEvents'

const baseEvent = {
  title: 'RSVP Mgmt Test', timezone: 'UTC', startAt: '2027-01-01T18:00:00Z',
  visibility: 'public' as const, isKidsEvent: false, allowChildren: true,
  allowSiblings: true, allowParents: true, allowStatusChoice: true,
  enableWaitlist: true, enableHeuristicDupCheck: false, locale: 'en' as const,
  maxPartySizePerRsvp: 10, notifyViaEmail: true, notifyViaSms: false, questions: '[]',
}

async function seedAdminSession(db: D1Database): Promise<string> {
  const id = crypto.randomUUID()
  const hash = await hashPassword('pass')
  await db.prepare(`INSERT INTO admin_users (id, email, password_hash) VALUES (?, ?, ?)`)
    .bind(id, `admin${id.slice(0,6)}@test.com`, hash).run()
  const sessionId = await createSession(db, id, 7)
  return `session_id=${sessionId}`
}

/** Fetch a CSRF token by doing a GET to an admin page and extracting the csrf_token cookie. */
async function getCsrfToken(sessionCookie: string): Promise<string> {
  const res = await app.fetch(
    new Request('http://localhost/rsvp/admin/', {
      headers: { Cookie: sessionCookie },
    }),
    env,
  )
  const setCookieHeader = res.headers.get('Set-Cookie') ?? ''
  const match = setCookieHeader.match(/csrf_token=([^;]+)/)
  return match?.[1] ?? ''
}

async function seedRsvp(db: D1Database, eventId: string, status = 'attending', adults = 1) {
  const id = crypto.randomUUID()
  await db.prepare(
    `INSERT INTO rsvps (id, event_id, name, adults, status, rsvp_token, dietary, answers, children_ages)
     VALUES (?, ?, ?, ?, ?, ?, '[]', '{}', '[]')`
  ).bind(id, eventId, `Guest-${id.slice(0,6)}`, adults, status, crypto.randomUUID()).run()
  return id
}

describe('GET /rsvp/admin/events/:id/rsvps', () => {
  it('returns RSVP list with 302 if no auth', async () => {
    const eventId = await createEvent(env.DB, baseEvent)
    const res = await app.fetch(new Request(`http://localhost/rsvp/admin/events/${eventId}/rsvps`), env)
    expect(res.status).toBe(302)
  })

  it('returns RSVP list with auth', async () => {
    const eventId = await createEvent(env.DB, baseEvent)
    await seedRsvp(env.DB, eventId)
    const cookie = await seedAdminSession(env.DB)
    const res = await app.fetch(new Request(`http://localhost/rsvp/admin/events/${eventId}/rsvps`, {
      headers: { Cookie: cookie },
    }), env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('RSVPs')
  })

  it('filters by status param', async () => {
    const eventId = await createEvent(env.DB, baseEvent)
    await seedRsvp(env.DB, eventId, 'attending')
    await seedRsvp(env.DB, eventId, 'waitlist')
    const cookie = await seedAdminSession(env.DB)
    const res = await app.fetch(new Request(`http://localhost/rsvp/admin/events/${eventId}/rsvps?status=waitlist`, {
      headers: { Cookie: cookie },
    }), env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('waitlist')
  })
})

describe('POST /rsvp/admin/events/:id/rsvps/:rsvpId/promote', () => {
  it('promotes waitlist guest when capacity available', async () => {
    const eventId = await createEvent(env.DB, { ...baseEvent, maxGuestsTotal: 5 })
    const rsvpId = await seedRsvp(env.DB, eventId, 'waitlist', 1)
    const cookie = await seedAdminSession(env.DB)
    const csrfToken = await getCsrfToken(cookie)
    const res = await app.fetch(new Request(`http://localhost/rsvp/admin/events/${eventId}/rsvps/${rsvpId}/promote`, {
      method: 'POST',
      headers: {
        Cookie: `${cookie}; csrf_token=${csrfToken}`,
        'X-CSRF-Token': csrfToken,
      },
    }), env)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('flash=promoted')
  })

  it('returns no_capacity flash when full', async () => {
    const eventId = await createEvent(env.DB, { ...baseEvent, maxGuestsTotal: 2 })
    await seedRsvp(env.DB, eventId, 'attending', 2)  // fills capacity
    const rsvpId = await seedRsvp(env.DB, eventId, 'waitlist', 1)
    const cookie = await seedAdminSession(env.DB)
    const csrfToken = await getCsrfToken(cookie)
    const res = await app.fetch(new Request(`http://localhost/rsvp/admin/events/${eventId}/rsvps/${rsvpId}/promote`, {
      method: 'POST',
      headers: {
        Cookie: `${cookie}; csrf_token=${csrfToken}`,
        'X-CSRF-Token': csrfToken,
      },
    }), env)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('flash=no_capacity')
  })
})

describe('POST /rsvp/admin/events/:id/rsvps/:rsvpId/edit — capacity guard', () => {
  it('blocks edit that exceeds capacity', async () => {
    const eventId = await createEvent(env.DB, { ...baseEvent, maxGuestsTotal: 3 })
    await seedRsvp(env.DB, eventId, 'attending', 2)  // 2 attending
    const rsvpId = await seedRsvp(env.DB, eventId, 'attending', 1)  // 1 attending = 3 total
    const cookie = await seedAdminSession(env.DB)
    const csrfToken = await getCsrfToken(cookie)
    const editBody = new URLSearchParams({
      name: 'Test', adults: '3', parents_count: '0', siblings_count: '0',
      children_count: '0', status: 'attending',
    })
    const res = await app.fetch(new Request(`http://localhost/rsvp/admin/events/${eventId}/rsvps/${rsvpId}/edit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `${cookie}; csrf_token=${csrfToken}`,
        'X-CSRF-Token': csrfToken,
      },
      body: editBody.toString(),
    }), env)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('capacity_error')
  })
})
