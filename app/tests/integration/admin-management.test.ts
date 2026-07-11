// tests/integration/admin-management.test.ts
/**
 * Integration tests for admin management endpoints (deactivation, promotion, demotion).
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/app'
import { hashPassword, getSession } from '../../src/domain/adminAuth'

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

/** POST to an admin mutating route with the session cookie + matching CSRF cookie/header. */
async function postAsAdmin(url: string, sessionId: string): Promise<Response> {
  const sessionCookie = `session_id=${sessionId}`
  const csrfToken = await getCsrfToken(sessionCookie)
  return app.fetch(
    new Request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `${sessionCookie}; csrf_token=${csrfToken}`,
        'X-CSRF-Token': csrfToken,
      },
      body: '',
    }),
    env,
  )
}

describe('GET /rsvp/admin/admins', () => {
  it('lists all admins (Owner only)', async () => {
    const owner = await seedAdmin(env.DB, { role: 'owner' })
    const editor = await seedAdmin(env.DB, { role: 'editor' })
    const sessionId = await adminLogin(owner.email, owner.password)

    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/admins', {
        headers: { Cookie: `session_id=${sessionId}` },
      }),
      env,
    )
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain(owner.email)
    expect(html).toContain(editor.email)
  })

  it('returns 403 for Editor', async () => {
    const editor = await seedAdmin(env.DB, { role: 'editor' })
    const sessionId = await adminLogin(editor.email, editor.password)

    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/admins', {
        headers: { Cookie: `session_id=${sessionId}` },
      }),
      env,
    )
    expect(res.status).toBe(403)
  })

  it('redirects to login if not authenticated', async () => {
    const res = await app.fetch(new Request('http://localhost/rsvp/admin/admins'), env)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/login')
  })
})

describe('POST /rsvp/admin/admins/:id/deactivate', () => {
  it('deactivates an admin (Owner only)', async () => {
    const owner = await seedAdmin(env.DB, { role: 'owner' })
    const target = await seedAdmin(env.DB, { role: 'editor' })
    const sessionId = await adminLogin(owner.email, owner.password)

    const res = await postAsAdmin(
      `http://localhost/rsvp/admin/admins/${target.id}/deactivate`,
      sessionId,
    )
    expect(res.status).toBe(303)

    // Verify deactivated
    const deactivated = await env.DB.prepare('SELECT is_active FROM admin_users WHERE id = ?')
      .bind(target.id)
      .first<{ is_active: number }>()
    expect(deactivated?.is_active).toBe(0)
  })

  it('blocks deactivating self', async () => {
    const owner = await seedAdmin(env.DB, { role: 'owner' })
    const sessionId = await adminLogin(owner.email, owner.password)

    const res = await postAsAdmin(
      `http://localhost/rsvp/admin/admins/${owner.id}/deactivate`,
      sessionId,
    )
    expect(res.status).toBe(400)
  })

  it('blocks deactivating last active Owner', async () => {
    const onlyOwner = await seedAdmin(env.DB, { role: 'owner' })
    const otherOwner = await seedAdmin(env.DB, { role: 'owner' })
    const sessionId = await adminLogin(onlyOwner.email, onlyOwner.password)

    // Deactivate other owner first, then try to deactivate the only remaining one
    await env.DB.prepare('UPDATE admin_users SET is_active = 0 WHERE id = ?')
      .bind(otherOwner.id)
      .run()

    const res = await postAsAdmin(
      `http://localhost/rsvp/admin/admins/${onlyOwner.id}/deactivate`,
      sessionId,
    )
    expect(res.status).toBe(400)
  })

  it('invalidates sessions on deactivation', async () => {
    const owner = await seedAdmin(env.DB, { role: 'owner' })
    const target = await seedAdmin(env.DB, { role: 'editor' })
    const targetSessionId = await adminLogin(target.email, target.password)
    const ownerSessionId = await adminLogin(owner.email, owner.password)

    // Verify session exists
    let sessionExists = await getSession(env.DB, targetSessionId)
    expect(sessionExists).toBeTruthy()

    // Deactivate the target
    const res = await postAsAdmin(
      `http://localhost/rsvp/admin/admins/${target.id}/deactivate`,
      ownerSessionId,
    )
    expect(res.status).toBe(303)

    // Verify session is deleted
    sessionExists = await getSession(env.DB, targetSessionId)
    expect(sessionExists).toBeNull()
  })
})

describe('POST /rsvp/admin/admins/:id/reactivate', () => {
  it('reactivates a deactivated admin', async () => {
    const owner = await seedAdmin(env.DB, { role: 'owner' })
    const target = await seedAdmin(env.DB, { role: 'editor', is_active: 0 })
    const sessionId = await adminLogin(owner.email, owner.password)

    const res = await postAsAdmin(
      `http://localhost/rsvp/admin/admins/${target.id}/reactivate`,
      sessionId,
    )
    expect(res.status).toBe(303)

    // Verify reactivated
    const reactivated = await env.DB.prepare('SELECT is_active FROM admin_users WHERE id = ?')
      .bind(target.id)
      .first<{ is_active: number }>()
    expect(reactivated?.is_active).toBe(1)
  })
})

describe('POST /rsvp/admin/admins/:id/promote', () => {
  it('promotes editor to owner', async () => {
    const owner = await seedAdmin(env.DB, { role: 'owner' })
    const editor = await seedAdmin(env.DB, { role: 'editor' })
    const sessionId = await adminLogin(owner.email, owner.password)

    const res = await postAsAdmin(
      `http://localhost/rsvp/admin/admins/${editor.id}/promote`,
      sessionId,
    )
    expect(res.status).toBe(303)

    // Verify promoted
    const promoted = await env.DB.prepare('SELECT role FROM admin_users WHERE id = ?')
      .bind(editor.id)
      .first<{ role: string }>()
    expect(promoted?.role).toBe('owner')
  })

  it('blocks promoting self', async () => {
    const owner = await seedAdmin(env.DB, { role: 'owner' })
    const sessionId = await adminLogin(owner.email, owner.password)

    const res = await postAsAdmin(
      `http://localhost/rsvp/admin/admins/${owner.id}/promote`,
      sessionId,
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /rsvp/admin/admins/:id/demote', () => {
  it('demotes owner to editor', async () => {
    const owner1 = await seedAdmin(env.DB, { role: 'owner' })
    const owner2 = await seedAdmin(env.DB, { role: 'owner' })
    const sessionId = await adminLogin(owner1.email, owner1.password)

    const res = await postAsAdmin(
      `http://localhost/rsvp/admin/admins/${owner2.id}/demote`,
      sessionId,
    )
    expect(res.status).toBe(303)

    // Verify demoted
    const demoted = await env.DB.prepare('SELECT role FROM admin_users WHERE id = ?')
      .bind(owner2.id)
      .first<{ role: string }>()
    expect(demoted?.role).toBe('editor')
  })

  it('blocks demoting self', async () => {
    const owner = await seedAdmin(env.DB, { role: 'owner' })
    const sessionId = await adminLogin(owner.email, owner.password)

    const res = await postAsAdmin(
      `http://localhost/rsvp/admin/admins/${owner.id}/demote`,
      sessionId,
    )
    expect(res.status).toBe(400)
  })

  it('blocks demoting last active Owner', async () => {
    const onlyOwner = await seedAdmin(env.DB, { role: 'owner' })
    const otherOwner = await seedAdmin(env.DB, { role: 'owner' })
    const sessionId = await adminLogin(onlyOwner.email, onlyOwner.password)

    // Deactivate other owner first
    await env.DB.prepare('UPDATE admin_users SET is_active = 0 WHERE id = ?')
      .bind(otherOwner.id)
      .run()

    const res = await postAsAdmin(
      `http://localhost/rsvp/admin/admins/${onlyOwner.id}/demote`,
      sessionId,
    )
    expect(res.status).toBe(400)
  })

  it('invalidates sessions on demotion', async () => {
    const owner1 = await seedAdmin(env.DB, { role: 'owner' })
    const owner2 = await seedAdmin(env.DB, { role: 'owner' })
    const owner2SessionId = await adminLogin(owner2.email, owner2.password)
    const owner1SessionId = await adminLogin(owner1.email, owner1.password)

    // Verify session exists
    let sessionExists = await getSession(env.DB, owner2SessionId)
    expect(sessionExists).toBeTruthy()

    // Demote the owner2
    const res = await postAsAdmin(
      `http://localhost/rsvp/admin/admins/${owner2.id}/demote`,
      owner1SessionId,
    )
    expect(res.status).toBe(303)

    // Verify session is deleted
    sessionExists = await getSession(env.DB, owner2SessionId)
    expect(sessionExists).toBeNull()
  })
})
