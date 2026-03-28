// app/tests/integration/csrf.test.ts
/**
 * @req SEC-03 — CSRF protection on all mutating admin endpoints
 */
import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import app from '../../src/app'
import { hashPassword, createSession } from '../../src/domain/adminAuth'

const TEST_PASSWORD = 'correct-horse-battery-staple'

async function seedAdminAndLogin(db: D1Database): Promise<{ sessionCookie: string; adminId: string }> {
  const id = crypto.randomUUID()
  const hash = await hashPassword(TEST_PASSWORD)
  await db.prepare(
    `INSERT INTO admin_users (id, email, password_hash, failed_login_attempts, is_active)
     VALUES (?, ?, ?, 0, 1)`
  ).bind(id, `csrf-${id.slice(0, 6)}@test.com`, hash).run()
  const sessionId = await createSession(db, id, 7)
  return { sessionCookie: `session_id=${sessionId}`, adminId: id }
}

/** Fetch a CSRF token by doing a GET to an admin page and extracting the Set-Cookie. */
async function getCsrfToken(sessionCookie: string, path = '/rsvp/admin/'): Promise<string> {
  const res = await app.fetch(
    new Request(`http://localhost${path}`, {
      headers: { Cookie: sessionCookie },
    }),
    env,
  )
  const setCookieHeader = res.headers.get('Set-Cookie') ?? ''
  // Set-Cookie may contain multiple cookies separated by commas in some runtimes,
  // or Hono may append multiple. Look for csrf_token= in the raw header.
  const match = setCookieHeader.match(/csrf_token=([^;]+)/)
  return match?.[1] ?? ''
}

describe('CSRF protection on admin routes', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM rsvps; DELETE FROM events; DELETE FROM admin_users; DELETE FROM sessions; DELETE FROM audit_logs;')
  })

  it('GET admin page sets csrf_token cookie', async () => {
    const { sessionCookie } = await seedAdminAndLogin(env.DB)
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/', {
        headers: { Cookie: sessionCookie },
      }),
      env,
    )
    expect(res.status).toBe(200)
    const setCookieHeader = res.headers.get('Set-Cookie') ?? ''
    expect(setCookieHeader).toContain('csrf_token=')
  })

  it('POST admin route without CSRF token returns 403', async () => {
    const { sessionCookie } = await seedAdminAndLogin(env.DB)
    const body = new URLSearchParams({
      title: 'Test Event',
      timezone: 'UTC',
      start_at: '2099-01-01T00:00:00Z',
    })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: sessionCookie,
        },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(403)
    const json = await res.json() as { error: string }
    expect(json.error).toBe('csrf_token_missing')
  })

  it('POST admin route with valid CSRF token succeeds', async () => {
    const { sessionCookie } = await seedAdminAndLogin(env.DB)
    const csrfToken = await getCsrfToken(sessionCookie)
    expect(csrfToken).not.toBe('')

    const body = new URLSearchParams({
      title: 'Test Event',
      timezone: 'UTC',
      start_at: '2099-01-01T00:00:00Z',
    })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `${sessionCookie}; csrf_token=${csrfToken}`,
          'X-CSRF-Token': csrfToken,
        },
        body: body.toString(),
      }),
      env,
    )
    // Should NOT be 403 (CSRF passes; may redirect or 200 depending on route)
    expect(res.status).not.toBe(403)
  })

  it('POST admin route with mismatched CSRF token returns 403', async () => {
    const { sessionCookie } = await seedAdminAndLogin(env.DB)
    const body = new URLSearchParams({
      title: 'Test Event',
      timezone: 'UTC',
      start_at: '2099-01-01T00:00:00Z',
    })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `${sessionCookie}; csrf_token=valid-cookie-token`,
          'X-CSRF-Token': 'different-header-token',
        },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(403)
    const json = await res.json() as { error: string }
    expect(json.error).toBe('csrf_token_mismatch')
  })

  it('POST with Origin header mismatch returns 403', async () => {
    const { sessionCookie } = await seedAdminAndLogin(env.DB)
    const csrfToken = crypto.randomUUID()
    const body = new URLSearchParams({ title: 'X', timezone: 'UTC', start_at: '2099-01-01T00:00:00Z' })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `${sessionCookie}; csrf_token=${csrfToken}`,
          'X-CSRF-Token': csrfToken,
          Origin: 'https://evil.example.com',
        },
        body: body.toString(),
      }),
      { ...env, DEPLOYMENT_DOMAIN: 'https://rsvpex.example.com' } as typeof env,
    )
    expect(res.status).toBe(403)
    const json = await res.json() as { error: string }
    expect(json.error).toBe('origin_mismatch')
  })

  it('pre-auth endpoints are exempt from CSRF (login POST works without token)', async () => {
    const id = crypto.randomUUID()
    const hash = await hashPassword(TEST_PASSWORD)
    await env.DB.prepare(
      `INSERT INTO admin_users (id, email, password_hash, failed_login_attempts, is_active)
       VALUES (?, ?, ?, 0, 1)`
    ).bind(id, 'csrf-exempt@test.com', hash).run()

    const body = new URLSearchParams({
      email: 'csrf-exempt@test.com',
      password: TEST_PASSWORD,
    })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
      env,
    )
    // Should redirect to admin dashboard, NOT 403
    expect(res.status).not.toBe(403)
  })

  it('public RSVP POST is exempt from CSRF', async () => {
    await env.DB.prepare(
      `INSERT INTO events (id, title, slug, status, visibility, timezone, start_at, max_guests_total, max_party_size_per_rsvp, locale)
       VALUES (?, 'CSRF Test', 'csrf-pub', 'published', 'public', 'UTC', '2099-01-01T00:00:00Z', 100, 10, 'en')`
    ).bind(crypto.randomUUID()).run()

    const body = new URLSearchParams({
      name: 'Test Guest',
      email: 'guest@test.com',
      adults: '1',
    })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/csrf-pub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
      env,
    )
    // Should NOT be 403 (Turnstile is test-bypassed, no CSRF required)
    expect(res.status).not.toBe(403)
  })
})
