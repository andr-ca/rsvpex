/**
 * Integration tests for the admin dashboard tiles, specifically the
 * ownership-scoped stat queries for the 'host' role.
 *
 * Regression coverage: getDashboardStats() in adminDashboard.ts previously
 * called `.bind(role === 'host' ? [now, adminUserId] : [now])` — passing a
 * single array literal to D1's variadic `.bind(...values)`. That binds one
 * array as a single parameter instead of two positional parameters, which
 * D1 rejects. The surrounding try/catch swallowed the error and returned
 * all-zero stats with dbOk: false — a silent failure no prior test caught.
 *
 * @req ADMIN-03 — Dashboard tiles reflect ownership-scoped event counts
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/app'
import { createSession, hashPassword } from '../../src/domain/adminAuth'

async function createAdminUser(
  email: string,
  password: string,
  role: 'owner' | 'editor' | 'host',
): Promise<{ id: string; cookie: string }> {
  const id = crypto.randomUUID()
  const hash = await hashPassword(password)
  await env.DB.prepare(
    `INSERT INTO admin_users (id, email, password_hash, role) VALUES (?, ?, ?, ?)`,
  )
    .bind(id, email.toLowerCase(), hash, role)
    .run()

  const sessionId = await createSession(env.DB, id, 7)
  return { id, cookie: `session_id=${sessionId}` }
}

async function createPublishedEvent(createdBy: string, title: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO events (id, slug, title, start_at, timezone, status, created_by)
     VALUES (?, ?, ?, ?, ?, 'published', ?)`,
  )
    .bind(
      crypto.randomUUID(),
      title.toLowerCase().replace(/\s+/g, '-') + '-' + crypto.randomUUID().slice(0, 8),
      title,
      '2027-06-01T18:00:00Z',
      'America/Toronto',
      createdBy,
    )
    .run()
}

describe('GET /rsvp/admin/ dashboard — host ownership scoping', () => {
  it("shows only the host's own event counts, not a global count, and does not error", async () => {
    const hostA = await createAdminUser('dashhosta@example.com', 'HostA123!Pass', 'host')
    const hostB = await createAdminUser('dashhostb@example.com', 'HostB123!Pass', 'host')

    await createPublishedEvent(hostA.id, 'Host A Dashboard Event 1')
    await createPublishedEvent(hostA.id, 'Host A Dashboard Event 2')
    await createPublishedEvent(hostB.id, 'Host B Dashboard Event')

    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/', { headers: { Cookie: hostA.cookie } }),
      env,
    )
    expect(res.status).toBe(200)
    const html = await res.text()

    // dbOk must be true — a bind() error would render the ✗ status tile.
    // (The stylesheet always defines both .tile-status-ok/-error rules, so
    // check the actual tile div's class, not just substring presence.)
    expect(html).toContain('class="tile tile-status-ok"')
    expect(html).not.toContain('class="tile tile-status-error"')

    // Host A should see exactly their own 2 events, not the global 3.
    expect(html).toContain('Host A Dashboard Event 1')
    expect(html).toContain('Host A Dashboard Event 2')
    expect(html).not.toContain('Host B Dashboard Event')
  })

  it('owner sees the global event count across all hosts', async () => {
    const owner = await createAdminUser('dashowner@example.com', 'Owner123!Pass', 'owner')
    const hostC = await createAdminUser('dashhostc@example.com', 'HostC123!Pass', 'host')

    await createPublishedEvent(hostC.id, 'Owner Visible Event')

    const res = await app.fetch(
      new Request('http://localhost/rsvp/admin/', { headers: { Cookie: owner.cookie } }),
      env,
    )
    expect(res.status).toBe(200)
    const html = await res.text()

    expect(html).toContain('class="tile tile-status-ok"')
    expect(html).toContain('Owner Visible Event')
  })
})
