/**
 * @req PUB-09 — thank-you page shows RSVP summary, wishlist button, ICS link
 * @req GUEST-02 — gift registry button shown when wishlist_url is set
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/app'

async function seedEventAndRsvp(
  db: D1Database,
  opts: { wishlistUrl?: string } = {},
): Promise<{ slug: string; token: string; rsvpId: string }> {
  const eventId = crypto.randomUUID()
  const slug = `ty-test-${eventId.slice(0, 8)}`
  await db
    .prepare(
      `INSERT INTO events (id, slug, title, start_at, end_at, status, timezone, wishlist_url, questions)
     VALUES (?, ?, 'Garden Party', '2026-07-15T15:00:00Z', '2026-07-15T18:00:00Z',
             'published', 'America/Toronto', ?, '[]')`,
    )
    .bind(eventId, slug, opts.wishlistUrl ?? null)
    .run()

  const rsvpId = crypto.randomUUID()
  const token = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO rsvps (id, event_id, name, email, adults, children_count, dietary, answers, status, rsvp_token)
     VALUES (?, ?, 'Alice Smith', 'alice@example.com', 2, 1, '[{"kind":"vegetarian","value":""}]', '{}', 'attending', ?)`,
    )
    .bind(rsvpId, eventId, token)
    .run()

  return { slug, token, rsvpId }
}

describe('GET /rsvp/thank-you', () => {
  it('returns 200 with guest name in body', async () => {
    const { token } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(new Request(`http://localhost/rsvp/thank-you?rid=${token}`), env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Alice Smith')
  })

  it('shows event title in the page', async () => {
    const { token } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(new Request(`http://localhost/rsvp/thank-you?rid=${token}`), env)
    const html = await res.text()
    expect(html).toContain('Garden Party')
  })

  it('shows party size (adults + children)', async () => {
    const { token } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(new Request(`http://localhost/rsvp/thank-you?rid=${token}`), env)
    const html = await res.text()
    // 2 adults, 1 child
    expect(html).toMatch(/2.*adult|adult.*2/i)
  })

  it('shows dietary entries', async () => {
    const { token } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(new Request(`http://localhost/rsvp/thank-you?rid=${token}`), env)
    const html = await res.text()
    expect(html).toContain('vegetarian')
  })

  it('shows gift registry button when wishlist_url is set', async () => {
    const { token } = await seedEventAndRsvp(env.DB, {
      wishlistUrl: 'https://registry.example.com/alice',
    })
    const res = await app.fetch(new Request(`http://localhost/rsvp/thank-you?rid=${token}`), env)
    const html = await res.text()
    expect(html).toContain('https://registry.example.com/alice')
  })

  it('does not show gift registry button when wishlist_url is null', async () => {
    const { token } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(new Request(`http://localhost/rsvp/thank-you?rid=${token}`), env)
    const html = await res.text()
    // No registry link present
    expect(html).not.toContain('View Gift Registry')
  })

  it('shows Download Calendar and Edit RSVP buttons', async () => {
    const { token } = await seedEventAndRsvp(env.DB)
    const res = await app.fetch(new Request(`http://localhost/rsvp/thank-you?rid=${token}`), env)
    const html = await res.text()
    expect(html).toContain('Download Calendar')
    expect(html).toContain('Edit RSVP')
  })

  it('returns 404 for unknown token', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/rsvp/thank-you?rid=nonexistent-token`),
      env,
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 when rid is missing', async () => {
    const res = await app.fetch(new Request(`http://localhost/rsvp/thank-you`), env)
    expect(res.status).toBe(400)
  })
})
