/**
 * Concurrency integration test for RSVP capacity enforcement.
 *
 * Fires N concurrent POST requests against the Hono app handler (imported
 * directly so it shares the same Miniflare D1 storage as `env.DB`) and
 * asserts that the final DB state matches expectations:
 * - Exactly 1 attending when capacity=1, waitlist disabled
 * - Exactly 1 attending + N-1 waitlisted when capacity=1, waitlist enabled
 *
 * @req CAP-01 — hard cap must not be exceeded under concurrent load
 * @req CAP-02 — waitlist overflow must be correct count
 */

import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/app'

async function seedEvent(
  db: D1Database,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; slug: string }> {
  const id = crypto.randomUUID()
  const slug = `concurrency-test-${id.slice(0, 8)}`
  const defaults = {
    id,
    slug,
    title: 'Concurrency Test Event',
    start_at: new Date(Date.now() + 86400000).toISOString(),
    status: 'published',
    max_guests_total: 1,
    enable_waitlist: 0,
    allow_status_choice: 1,
    max_party_size_per_rsvp: 10,
    ...overrides,
  }
  const cols = Object.keys(defaults).join(', ')
  const placeholders = Object.keys(defaults)
    .map(() => '?')
    .join(', ')
  await db
    .prepare(`INSERT INTO events (${cols}) VALUES (${placeholders})`)
    .bind(...Object.values(defaults))
    .run()
  return { id, slug }
}

function makeRsvpBody(i: number): string {
  const body = new URLSearchParams()
  body.set('name', `Guest ${i}`)
  body.set('email', `guest${i}-${crypto.randomUUID()}@example.com`)
  body.set('adults', '1')
  body.set('status', 'attending')
  // cf-turnstile-response not needed — TURNSTILE_SECRET_KEY='test-secret' bypasses it
  return body.toString()
}

async function postRsvp(slug: string, i: number): Promise<Response> {
  // Use unique IPs so each request gets its own rate-limit bucket (limit is 5/min/IP)
  const ip = `203.0.113.${i + 1}`
  const request = new Request(`http://example.com/rsvp/${slug}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'CF-Connecting-IP': ip,
    },
    body: makeRsvpBody(i),
  })
  // Import app directly so it runs in the same isolate as env.DB (shared D1 storage)
  return app.fetch(request, env)
}

async function countByStatus(db: D1Database, eventId: string): Promise<Record<string, number>> {
  const rows = await db
    .prepare(`SELECT status, COUNT(*) as cnt FROM rsvps WHERE event_id = ? GROUP BY status`)
    .bind(eventId)
    .all<{ status: string; cnt: number }>()
  return Object.fromEntries(rows.results.map((r) => [r.status, r.cnt]))
}

describe('Capacity concurrency — 20 parallel POSTs', () => {
  it('capacity=1, no waitlist: exactly 1 attending, 19 rejected (capacity full)', async () => {
    const { id: eventId, slug } = await seedEvent(env.DB, {
      max_guests_total: 1,
      enable_waitlist: 0,
    })

    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => postRsvp(slug, i)))

    const statuses = responses.map((r) => r.status)
    const redirects = statuses.filter((s) => s === 303)

    // Exactly 1 successful insert (redirect to thank-you) — rest capacity-full (409)
    expect(redirects).toHaveLength(1)
    const nonSuccess = statuses.filter((s) => s !== 303)
    expect(nonSuccess).toHaveLength(19)

    // Verify DB state directly
    const counts = await countByStatus(env.DB, eventId)
    expect(counts['attending']).toBe(1)
    expect(counts['waitlist']).toBeUndefined()
  })

  it('capacity=1, waitlist enabled: exactly 1 attending + 19 waitlisted', async () => {
    const { id: eventId, slug } = await seedEvent(env.DB, {
      max_guests_total: 1,
      enable_waitlist: 1,
    })

    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => postRsvp(slug, i)))

    const successStatuses = responses.map((r) => r.status).filter((s) => s === 303)
    // All 20 should result in a redirect (attending or waitlist both redirect)
    expect(successStatuses.length).toBe(20)

    // Verify DB state: exactly 1 attending, rest waitlisted
    const counts = await countByStatus(env.DB, eventId)
    expect(counts['attending']).toBe(1)
    expect(counts['waitlist']).toBe(19)
  })
})
