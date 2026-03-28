// app/tests/integration/admin-events.test.ts
/**
 * @req ADMIN-04 — Event CRUD integration
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/app'
import { hashPassword, createSession } from '../../src/domain/adminAuth'

// Seed admin + create a valid session cookie
async function seedAdminSession(db: D1Database): Promise<string> {
  const id = crypto.randomUUID()
  const hash = await hashPassword('pass1234')
  await db.prepare(
    `INSERT INTO admin_users (id, email, password_hash) VALUES (?, ?, ?)`
  ).bind(id, `admin${id.slice(0,6)}@test.com`, hash).run()
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

async function makeAuthedRequest(url: string, options: RequestInit, db: D1Database) {
  const cookie = await seedAdminSession(db)
  const method = (options.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> ?? {}), Cookie: cookie }

  // For mutating requests, include CSRF token
  if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) {
    const csrfToken = await getCsrfToken(cookie)
    headers.Cookie = `${cookie}; csrf_token=${csrfToken}`
    headers['X-CSRF-Token'] = csrfToken
  }

  return app.fetch(new Request(url, { ...options, headers }), env)
}

describe('GET /rsvp/admin/events', () => {
  it('returns 302 without auth', async () => {
    const res = await app.fetch(new Request('http://localhost/rsvp/admin/events'), env)
    expect(res.status).toBe(302)
  })

  it('returns 200 with auth', async () => {
    const res = await makeAuthedRequest('http://localhost/rsvp/admin/events', {}, env.DB)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Events')
  })
})

describe('POST /rsvp/admin/events — create event', () => {
  it('creates event and redirects to detail', async () => {
    const body = new URLSearchParams({
      title: 'Integration Test Event',
      start_at: '2027-06-01T18:00',
      timezone: 'America/Toronto',
      visibility: 'public',
      locale: 'en',
      max_party_size_per_rsvp: '10',
    })
    const res = await makeAuthedRequest('http://localhost/rsvp/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }, env.DB)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toMatch(/\/rsvp\/admin\/events\/[a-z0-9-]+$/)
  })

  it('returns 422 for missing title', async () => {
    const body = new URLSearchParams({ start_at: '2027-06-01T18:00' })
    const res = await makeAuthedRequest('http://localhost/rsvp/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }, env.DB)
    expect(res.status).toBe(422)
  })
})

describe('GET /rsvp/admin/events/:id — event detail', () => {
  it('returns 200 with event info', async () => {
    // Create event first
    const cookie = await seedAdminSession(env.DB)
    const csrfToken = await getCsrfToken(cookie)
    const createBody = new URLSearchParams({
      title: 'Detail Test Event', start_at: '2027-07-01T18:00',
      timezone: 'UTC', visibility: 'public', locale: 'en', max_party_size_per_rsvp: '10',
    })
    const createRes = await app.fetch(new Request('http://localhost/rsvp/admin/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `${cookie}; csrf_token=${csrfToken}`,
        'X-CSRF-Token': csrfToken,
      },
      body: createBody.toString(),
    }), env)
    const location = createRes.headers.get('location')!
    const getRes = await app.fetch(new Request(`http://localhost${location}`), env)
    expect(getRes.status).toBe(302) // redirects to login because new session needed
    // Try with fresh session
    const cookie2 = await seedAdminSession(env.DB)
    const getRes2 = await app.fetch(new Request(`http://localhost${location}`, {
      headers: { Cookie: cookie2 },
    }), env)
    expect(getRes2.status).toBe(200)
    const html = await getRes2.text()
    expect(html).toContain('Detail Test Event')
  })
})

describe('POST /rsvp/admin/events/:id/publish', () => {
  it('publishes a draft event', async () => {
    const { createEvent, getEvent } = await import('../../src/domain/adminEvents')
    const id = await createEvent(env.DB, {
      title: 'Publish Test', timezone: 'UTC', startAt: '2027-08-01T18:00:00Z',
      visibility: 'public', isKidsEvent: false, allowChildren: true, allowSiblings: true,
      allowParents: true, allowStatusChoice: true, enableWaitlist: false,
      enableHeuristicDupCheck: false, locale: 'en', maxPartySizePerRsvp: 10,
      notifyViaEmail: true, notifyViaSms: false, questions: '[]',
    })
    const res = await makeAuthedRequest(`http://localhost/rsvp/admin/events/${id}/publish`, {
      method: 'POST',
    }, env.DB)
    expect(res.status).toBe(303)
    const event = await getEvent(env.DB, id)
    expect(event!.status).toBe('published')
  })
})
