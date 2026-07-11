// tests/integration/admin-invites.test.ts
/**
 * Integration tests for admin invite endpoints.
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/app'
import { hashPassword } from '../../src/domain/adminAuth'

async function seedAdmin(
  db: D1Database,
  overrides?: Partial<{
    email: string
    password: string
    role: string
    is_active: number
  }>,
): Promise<{ id: string; email: string; password: string }> {
  const id = crypto.randomUUID()
  const email = overrides?.email ?? `admin${id.slice(0, 6)}@test.com`
  const password = overrides?.password ?? 'correct-horse-battery-staple'
  const role = overrides?.role ?? 'owner'
  const hash = await hashPassword(password)
  await db
    .prepare(
      `INSERT INTO admin_users (id, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, email, hash, role, overrides?.is_active ?? 1)
    .run()
  return { id, email, password }
}

async function adminLogin(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ email, password })
  const res = await app.fetch(
    new Request('http://localhost/rsvp/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }),
    env,
  )
  const setCookie = res.headers.get('set-cookie')
  const match = setCookie?.match(/session_id=([^;]+)/)
  return match?.[1] ?? ''
}

describe('GET /rsvp/admin/admins/invite', () => {
  it('returns 200 with invite form (Owner only)', async () => {
    const admin = await seedAdmin(env.DB, { role: 'owner' })
    const sessionId = await adminLogin(admin.email, admin.password)
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/admins/invite', {
        headers: { Cookie: `session_id=${sessionId}` },
      }),
      env,
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Invite')
  })

  it('returns 403 for Editor', async () => {
    const admin = await seedAdmin(env.DB, { role: 'editor' })
    const sessionId = await adminLogin(admin.email, admin.password)
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/admins/invite', {
        headers: { Cookie: `session_id=${sessionId}` },
      }),
      env,
    )
    expect(res.status).toBe(403)
  })

  it('redirects to login if not authenticated', async () => {
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/admins/invite'),
      env,
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/login')
  })
})

describe('POST /rsvp/admin/admins/invite', () => {
  it('creates invite and shows link (Owner only)', async () => {
    const admin = await seedAdmin(env.DB, { role: 'owner' })
    const sessionId = await adminLogin(admin.email, admin.password)
    const body = new URLSearchParams({
      email: 'newinvite@example.com',
      role: 'editor',
    })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/admins/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `session_id=${sessionId}`,
        },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('/rsvp/admin/invite/accept')
  })

  it('returns 409 if email already admin', async () => {
    const admin = await seedAdmin(env.DB, { role: 'owner' })
    const sessionId = await adminLogin(admin.email, admin.password)
    const body = new URLSearchParams({
      email: admin.email,
      role: 'editor',
    })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/admins/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `session_id=${sessionId}`,
        },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(409)
  })

  it('returns 403 for Editor', async () => {
    const admin = await seedAdmin(env.DB, { role: 'editor' })
    const sessionId = await adminLogin(admin.email, admin.password)
    const body = new URLSearchParams({
      email: 'newemail@example.com',
      role: 'editor',
    })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/admins/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `session_id=${sessionId}`,
        },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(403)
  })
})

describe('GET /rsvp/admin/invite/accept', () => {
  it('returns 200 with password-set form', async () => {
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/invite/accept?token=fake-token'),
      env,
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Set Up')
  })
})

describe('POST /rsvp/admin/invite/accept', () => {
  it('creates admin account on valid token', async () => {
    // Create an invite and extract token
    const admin = await seedAdmin(env.DB, { role: 'owner' })
    const sessionId = await adminLogin(admin.email, admin.password)
    const inviteBody = new URLSearchParams({
      email: 'acceptme@example.com',
      role: 'editor',
    })
    const inviteRes = await app.fetch(
      new Request('http://localhost/rsvp/admin/admins/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `session_id=${sessionId}`,
        },
        body: inviteBody.toString(),
      }),
      env,
    )
    const inviteHtml = await inviteRes.text()
    const tokenMatch = inviteHtml.match(/token=([a-f0-9-]+)/)
    const token = tokenMatch?.[1]

    if (!token) throw new Error('No token found in invite response')

    // Accept the invite
    const acceptBody = new URLSearchParams({
      token,
      password: 'new-password-123456',
    })
    const acceptRes = await app.fetch(
      new Request('http://localhost/rsvp/admin/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: acceptBody.toString(),
      }),
      env,
    )
    expect(acceptRes.status).toBe(303)
    expect(acceptRes.headers.get('location')).toContain('/login')

    // Verify admin was created with correct role
    const newAdmin = await env.DB.prepare(
      'SELECT id, role FROM admin_users WHERE email = ?',
    )
      .bind('acceptme@example.com')
      .first<{ id: string; role: string }>()
    expect(newAdmin?.role).toBe('editor')
  })

  it('returns 410 if token expired', async () => {
    // Create an invite with expiry in the past
    const expiredAt = new Date(Date.now() - 1000).toISOString()
    const tokenHash = 'fake-hash-' + crypto.randomUUID()
    await env.DB.prepare(
      'INSERT INTO admin_invites (id, email, token_hash, expires_at, role) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(crypto.randomUUID(), 'expired@example.com', tokenHash, expiredAt, 'editor')
      .run()

    const acceptBody = new URLSearchParams({
      token: 'any-token-that-hashes-to-something-else',
      password: 'new-password-123456',
    })
    const acceptRes = await app.fetch(
      new Request('http://localhost/rsvp/admin/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: acceptBody.toString(),
      }),
      env,
    )
    expect(acceptRes.status).toBe(410)
  })

  it('preserves owner role in invite acceptance', async () => {
    // Create owner invite
    const admin = await seedAdmin(env.DB, { role: 'owner' })
    const sessionId = await adminLogin(admin.email, admin.password)
    const inviteBody = new URLSearchParams({
      email: 'owner-invite@example.com',
      role: 'owner',
    })
    const inviteRes = await app.fetch(
      new Request('http://localhost/rsvp/admin/admins/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `session_id=${sessionId}`,
        },
        body: inviteBody.toString(),
      }),
      env,
    )
    const inviteHtml = await inviteRes.text()
    const tokenMatch = inviteHtml.match(/token=([a-f0-9-]+)/)
    const token = tokenMatch?.[1]

    if (!token) throw new Error('No token found in invite response')

    // Accept the invite
    const acceptBody = new URLSearchParams({
      token,
      password: 'owner-password-123456',
    })
    const acceptRes = await app.fetch(
      new Request('http://localhost/rsvp/admin/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: acceptBody.toString(),
      }),
      env,
    )
    expect(acceptRes.status).toBe(303)

    // Verify admin was created with owner role
    const newAdmin = await env.DB.prepare(
      'SELECT role FROM admin_users WHERE email = ?',
    )
      .bind('owner-invite@example.com')
      .first<{ role: string }>()
    expect(newAdmin?.role).toBe('owner')
  })
})
