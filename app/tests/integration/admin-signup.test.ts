/**
 * Integration tests for host signup and ownership scoping
 * @req HOST-REGISTRATION — Public signup without invite codes
 * @req EVENT-OWNERSHIP-SCOPING — Hosts see only their events
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/app'
import { createSession, hashPassword } from '../../src/domain/adminAuth'

/**
 * Helper to sign up a new host account
 */
async function signupHost(email: string, password: string, displayName?: string): Promise<Response> {
  const body = new URLSearchParams({
    email,
    password,
    ...(displayName ? { displayName } : {}),
  })

  return app.fetch(
    new Request('http://localhost/rsvp/admin/signup', {
      method: 'POST',
      body,
    }),
    env,
  )
}

/**
 * Helper to create an admin user with a specific role and return session cookie
 */
async function createAdminUser(
  email: string,
  password: string,
  role: 'owner' | 'editor' | 'host',
): Promise<string> {
  const id = crypto.randomUUID()
  const hash = await hashPassword(password)
  await env.DB.prepare(
    `INSERT INTO admin_users (id, email, password_hash, role) VALUES (?, ?, ?, ?)`,
  )
    .bind(id, email.toLowerCase(), hash, role)
    .run()

  const sessionId = await createSession(env.DB, id, 7)
  return `session_id=${sessionId}`
}

/**
 * Helper to create an event as a specific admin user
 */
async function createEventForAdmin(sessionCookie: string, title: string): Promise<string> {
  const body = new URLSearchParams({
    title,
    start_at: '2027-06-01T18:00',
    timezone: 'America/Toronto',
    visibility: 'public',
    locale: 'en',
    max_party_size_per_rsvp: '10',
  })

  const res = await app.fetch(
    new Request('http://localhost/rsvp/admin/events', {
      method: 'POST',
      body,
      headers: { Cookie: sessionCookie },
    }),
    env,
  )

  // Extract event ID from redirect Location header
  const location = res.headers.get('Location') ?? ''
  const match = location.match(/\/rsvp\/admin\/events\/([^/?]+)/)
  return match?.[1] ?? ''
}

describe('POST /rsvp/admin/signup', () => {
  it('creates a new host account with valid email and 12+ char password', async () => {
    const res = await signupHost('newhost@example.com', 'ValidPassword123!')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('/rsvp/admin/login')

    // Verify account created in DB
    const user = await env.DB.prepare(
      'SELECT role FROM admin_users WHERE email = ? LIMIT 1',
    )
      .bind('newhost@example.com')
      .first<{ role: string }>()

    expect(user?.role).toBe('host')
  })

  it('stores email in lowercase (case-insensitive)', async () => {
    const email = 'NewHost@EXAMPLE.COM'
    const res = await signupHost(email, 'ValidPassword123!')
    expect(res.status).toBe(302)

    const user = await env.DB.prepare(
      'SELECT email FROM admin_users WHERE email = ? LIMIT 1',
    )
      .bind('newhost@example.com')
      .first<{ email: string }>()

    expect(user?.email).toBe('newhost@example.com')
  })

  it('returns 409 when email already exists', async () => {
    const email = 'duplicate@example.com'
    await signupHost(email, 'ValidPassword123!')

    // Try to sign up with same email again
    const res = await signupHost(email, 'AnotherPassword123!')
    expect(res.status).toBe(409)

    const html = await res.text()
    expect(html).toContain('Email Already in Use')
  })

  it('returns 400 when password is less than 12 characters', async () => {
    const res = await signupHost('short@example.com', 'short')
    expect(res.status).toBe(400)

    const html = await res.text()
    expect(html).toContain('12 characters')
  })

  it('accepts displayName (optional field)', async () => {
    const res = await signupHost('named@example.com', 'ValidPassword123!', 'Display Name')
    expect(res.status).toBe(302)

    const user = await env.DB.prepare(
      'SELECT display_name FROM admin_users WHERE email = ? LIMIT 1',
    )
      .bind('named@example.com')
      .first<{ display_name: string | null }>()

    expect(user?.display_name).toBe('Display Name')
  })
})

describe('Ownership scoping across routes', () => {
  it('host A cannot see host B events in list', async () => {
    const hostACookie = await createAdminUser('hostA@example.com', 'HostA123!Pass', 'host')
    const hostBCookie = await createAdminUser('hostB@example.com', 'HostB123!Pass', 'host')

    const hostAEventId = await createEventForAdmin(hostACookie, 'Host A Event')

    // Host B tries to list events
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/events', {
        headers: { Cookie: hostBCookie },
      }),
      env,
    )

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).not.toContain(hostAEventId)
    expect(html).not.toContain('Host A Event')
  })

  it('host A cannot access host B event detail (returns 404)', async () => {
    const hostACookie = await createAdminUser('hostA2@example.com', 'HostA123!Pass', 'host')
    const hostBCookie = await createAdminUser('hostB2@example.com', 'HostB123!Pass', 'host')

    const hostAEventId = await createEventForAdmin(hostACookie, 'Host A Event 2')

    // Host B tries to access Host A's event detail
    const res = await app.fetch(
      new Request(`http://localhost/rsvp/admin/events/${hostAEventId}`, {
        headers: { Cookie: hostBCookie },
      }),
      env,
    )

    expect(res.status).toBe(404)
  })

  it('owner can see all events including legacy NULL-owner events', async () => {
    const ownerCookie = await createAdminUser('owner@example.com', 'Owner123!Pass', 'owner')
    const hostCookie = await createAdminUser('host3@example.com', 'Host123!Pass', 'host')

    // Create a host event
    const hostEventId = await createEventForAdmin(hostCookie, 'Host Created Event')

    // Create a legacy event with NULL created_by
    const legacyEventId = crypto.randomUUID()
    await env.DB.prepare(
      `INSERT INTO events (id, slug, title, start_at, timezone, created_by)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    )
      .bind(legacyEventId, 'legacy-event', 'Legacy Event', '2027-06-01T18:00:00Z', 'America/Toronto')
      .run()

    // Owner lists events
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/events', {
        headers: { Cookie: ownerCookie },
      }),
      env,
    )

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Host Created Event') // Host's event
    expect(html).toContain('Legacy Event') // Legacy event
  })

  it('host cannot see legacy NULL-owner events', async () => {
    const hostCookie = await createAdminUser('host4@example.com', 'Host123!Pass', 'host')

    // Create a legacy event with NULL created_by
    const legacyEventId = crypto.randomUUID()
    await env.DB.prepare(
      `INSERT INTO events (id, slug, title, start_at, timezone, created_by)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    )
      .bind(legacyEventId, 'legacy-event-2', 'Legacy Event 2', '2027-06-01T18:00:00Z', 'America/Toronto')
      .run()

    // Host lists events
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/events', {
        headers: { Cookie: hostCookie },
      }),
      env,
    )

    expect(res.status).toBe(200)
    const html = await res.text()
    // Host should see nothing since they have no events
    expect(html).not.toContain('Legacy Event 2')
  })

  it('new event created by host has created_by set to their id', async () => {
    const hostCookie = await createAdminUser('hostWithEvent@example.com', 'Host123!Pass', 'host')

    // Get admin ID by looking at the session
    const hostUser = await env.DB.prepare(
      'SELECT id FROM admin_users WHERE email = ? LIMIT 1',
    )
      .bind('hostWithEvent@example.com')
      .first<{ id: string }>()

    const hostId = hostUser?.id ?? ''

    const eventId = await createEventForAdmin(hostCookie, 'Host Owned Event')

    // Check that event has created_by set to host's ID
    const event = await env.DB.prepare(
      'SELECT created_by FROM events WHERE id = ? LIMIT 1',
    )
      .bind(eventId)
      .first<{ created_by: string | null }>()

    expect(event?.created_by).toBe(hostId)
  })

  it('host can edit their own event', async () => {
    const hostCookie = await createAdminUser('hostEdit@example.com', 'Host123!Pass', 'host')
    const eventId = await createEventForAdmin(hostCookie, 'Event to Edit')

    // Get CSRF token
    const dashRes = await app.fetch(
      new Request('http://localhost/rsvp/admin/', {
        headers: { Cookie: hostCookie },
      }),
      env,
    )

    const csrfMatch = dashRes.headers.get('Set-Cookie')?.match(/csrf_token=([^;]+)/)
    const csrfToken = csrfMatch?.[1] ?? ''

    // Edit event
    const body = new URLSearchParams({
      title: 'Edited Event Title',
      start_at: '2027-06-01T18:00',
      timezone: 'America/Toronto',
      visibility: 'public',
      locale: 'en',
      max_party_size_per_rsvp: '10',
    })

    const res = await app.fetch(
      new Request(`http://localhost/rsvp/admin/events/${eventId}/edit`, {
        method: 'POST',
        body,
        headers: {
          Cookie: `${hostCookie}; csrf_token=${csrfToken}`,
          'X-CSRF-Token': csrfToken,
        },
      }),
      env,
    )

    // Should redirect to event detail
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toContain(`/rsvp/admin/events/${eventId}`)
  })
})
