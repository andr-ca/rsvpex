// app/tests/integration/admin-auth.test.ts
/**
 * @req ADMIN-01 — login, lockout after 5 failed attempts, session cookie
 * @req ADMIN-02 — password reset: 15-min token, second use returns 410
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
    failed_login_attempts: number
    locked_until: string | null
    is_active: number
  }>,
): Promise<{ id: string; email: string; password: string }> {
  const id = crypto.randomUUID()
  const email = overrides?.email ?? `admin${id.slice(0, 6)}@test.com`
  const password = overrides?.password ?? 'correct-horse-battery-staple'
  const hash = await hashPassword(password)
  await db
    .prepare(
      `INSERT INTO admin_users (id, email, password_hash, failed_login_attempts, locked_until, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      email,
      hash,
      overrides?.failed_login_attempts ?? 0,
      overrides?.locked_until ?? null,
      overrides?.is_active ?? 1,
    )
    .run()
  return { id, email, password }
}

describe('GET /rsvp/admin/setup', () => {
  it('returns 200 with setup form', async () => {
    const res = await app.fetch(new Request('http://localhost/rsvp/admin/setup'), env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Admin Setup')
  })
})

describe('POST /rsvp/admin/setup', () => {
  it('creates first admin and redirects to login', async () => {
    const body = new URLSearchParams({
      email: 'first@example.com',
      password: 'correct-horse-battery-staple',
      display_name: 'First Admin',
    })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('returns 409 if admin already exists', async () => {
    await seedAdmin(env.DB, { email: 'existing@example.com' })
    const body = new URLSearchParams({
      email: 'second@example.com',
      password: 'correct-horse-battery-staple',
    })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(409)
  })
})

describe('POST /rsvp/admin/login', () => {
  it('sets session cookie and redirects on valid credentials', async () => {
    const { email, password } = await seedAdmin(env.DB)
    const body = new URLSearchParams({ email, password })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(303)
    const setCookieHeader = res.headers.get('set-cookie')
    expect(setCookieHeader).toContain('session_id=')
    expect(setCookieHeader).toContain('HttpOnly')
    expect(setCookieHeader).toContain('SameSite=Lax')
  })

  it('redirects to login?error=invalid on wrong password', async () => {
    const { email } = await seedAdmin(env.DB)
    const body = new URLSearchParams({ email, password: 'wrong-password' })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=invalid')
  })

  it('returns 423 with retry_after_seconds when account is locked', async () => {
    const future = new Date(Date.now() + 900_000).toISOString()
    const { email, password } = await seedAdmin(env.DB, {
      failed_login_attempts: 5,
      locked_until: future,
    })
    const body = new URLSearchParams({ email, password })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(423)
    const json = (await res.json()) as { error: string; retry_after_seconds: number }
    expect(json.error).toBe('account_locked')
    expect(json.retry_after_seconds).toBeGreaterThan(0)
  })

  it('locks account after 5 consecutive failed attempts', async () => {
    const { email } = await seedAdmin(env.DB)
    for (let i = 0; i < 5; i++) {
      await app.fetch(
        new Request('http://localhost/rsvp/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ email, password: 'wrong' }).toString(),
        }),
        env,
      )
    }
    const body = new URLSearchParams({ email, password: 'wrong' })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(423)
    // PBKDF2 (600k iterations) takes well under 1s per call even in Miniflare
  }, 30000)
})

describe('POST /rsvp/admin/logout', () => {
  it('clears session cookie and redirects to login', async () => {
    const { email, password } = await seedAdmin(env.DB)
    // Login first
    const loginBody = new URLSearchParams({ email, password })
    const loginRes = await app.fetch(
      new Request('http://localhost/rsvp/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: loginBody.toString(),
      }),
      env,
    )
    const cookie = loginRes.headers.get('set-cookie') ?? ''
    const sessionCookie = cookie.split(';')[0]

    const logoutRes = await app.fetch(
      new Request('http://localhost/rsvp/admin/logout', {
        method: 'POST',
        headers: { Cookie: sessionCookie },
      }),
      env,
    )
    expect(logoutRes.status).toBe(303)
    const clearCookie = logoutRes.headers.get('set-cookie') ?? ''
    expect(clearCookie).toContain('Max-Age=0')
  })
})

describe('requireAdmin middleware', () => {
  it('redirects to login when no session cookie', async () => {
    const res = await app.fetch(new Request('http://localhost/rsvp/admin/'), env)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('allows access with valid session', async () => {
    const { email, password } = await seedAdmin(env.DB)
    const loginBody = new URLSearchParams({ email, password })
    const loginRes = await app.fetch(
      new Request('http://localhost/rsvp/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: loginBody.toString(),
      }),
      env,
    )
    const cookie = loginRes.headers.get('set-cookie') ?? ''
    const sessionCookie = cookie.split(';')[0]

    const dashboardRes = await app.fetch(
      new Request('http://localhost/rsvp/admin/', { headers: { Cookie: sessionCookie } }),
      env,
    )
    expect(dashboardRes.status).toBe(200)
  })
})

describe('Password reset flow', () => {
  it('POST /rsvp/admin/password-reset always shows success page', async () => {
    const body = new URLSearchParams({ email: 'nonexistent@example.com' })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Check Your Email')
  })

  it('POST /rsvp/admin/password-reset/confirm with valid token sets new password', async () => {
    const { id } = await seedAdmin(env.DB)
    // Create reset token directly via D1
    const rawToken = crypto.randomUUID()
    const tokenHash = await (async () => {
      const enc = new TextEncoder()
      const buf = await crypto.subtle.digest('SHA-256', enc.encode(rawToken))
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    })()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    await env.DB.prepare(
      'INSERT INTO password_reset_tokens (id, admin_user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    )
      .bind(crypto.randomUUID(), id, tokenHash, expiresAt)
      .run()

    const body = new URLSearchParams({ token: rawToken, password: 'new-secure-password-123' })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
      env,
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('reset=success')
  })

  it('returns 410 on second use of reset token', async () => {
    const { id } = await seedAdmin(env.DB)
    const rawToken = crypto.randomUUID()
    const tokenHash = await (async () => {
      const enc = new TextEncoder()
      const buf = await crypto.subtle.digest('SHA-256', enc.encode(rawToken))
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    })()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const tokenId = crypto.randomUUID()
    await env.DB.prepare(
      'INSERT INTO password_reset_tokens (id, admin_user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    )
      .bind(tokenId, id, tokenHash, expiresAt)
      .run()

    const body = new URLSearchParams({ token: rawToken, password: 'new-secure-password-123' })
    const req = () =>
      new Request('http://localhost/rsvp/admin/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })

    const first = await app.fetch(req(), env)
    expect(first.status).toBe(303)

    const second = await app.fetch(req(), env)
    expect(second.status).toBe(410)
  })
})
