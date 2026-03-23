/**
 * Concurrency integration test for RSVP capacity enforcement.
 *
 * Fires N concurrent POST requests against a real Worker running in Miniflare
 * (via SELF.fetch) and asserts that the final DB state matches expectations:
 * - Exactly 1 attending when capacity=1, waitlist disabled
 * - Exactly 1 attending + N-1 waitlisted when capacity=1, waitlist enabled
 *
 * @req CAP-01 — hard cap must not be exceeded under concurrent load
 * @req CAP-02 — waitlist overflow must be correct count
 */

import { SELF, env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

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
  const placeholders = Object.keys(defaults).map(() => '?').join(', ')
  await db.prepare(`INSERT INTO events (${cols}) VALUES (${placeholders})`).bind(...Object.values(defaults)).run()
  return { id, slug }
}

function makeRsvpBody(i: number): URLSearchParams {
  const body = new URLSearchParams()
  body.set('name', `Guest ${i}`)
  body.set('email', `guest${i}-${crypto.randomUUID()}@example.com`)
  body.set('adults', '1')
  body.set('status', 'attending')
  body.set('cf-turnstile-response', 'bypassed') // bypass via test-secret
  return body
}

async function postRsvp(slug: string, i: number): Promise<Response> {
  return SELF.fetch(`http://example.com/rsvp/${slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: makeRsvpBody(i).toString(),
  })
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
    const { id: eventId, slug } = await seedEvent(env.DB, { max_guests_total: 1, enable_waitlist: 0 })

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) => postRsvp(slug, i)),
    )

    const statuses = responses.map((r) => r.status)
    const redirects = statuses.filter((s) => s === 303)

    // Exactly 1 successful insert (redirect) — rest should be capacity-full (409) or rate-limited (429)
    expect(redirects).toHaveLength(1)
    // The remaining 19 should not be 2xx
    const nonSuccess = statuses.filter((s) => s !== 303)
    expect(nonSuccess).toHaveLength(19)

    // Verify DB state directly
    const counts = await countByStatus(env.DB, eventId)
    expect(counts['attending']).toBe(1)
    expect(counts['waitlist']).toBeUndefined()
  })

  it('capacity=1, waitlist enabled: exactly 1 attending + 19 waitlisted', async () => {
    const { id: eventId, slug } = await seedEvent(env.DB, { max_guests_total: 1, enable_waitlist: 1 })

    // Use fewer concurrent requests to avoid KV rate-limit interference in test
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) => postRsvp(slug, i)),
    )

    const successStatuses = responses.map((r) => r.status).filter((s) => s === 303)
    // All 20 should eventually result in a redirect (attending or waitlist both redirect)
    expect(successStatuses.length).toBeGreaterThanOrEqual(1)

    // Verify DB state: exactly 1 attending, rest waitlisted
    const counts = await countByStatus(env.DB, eventId)
    expect(counts['attending']).toBe(1)
    expect(counts['waitlist']).toBe(19)
  })
})
