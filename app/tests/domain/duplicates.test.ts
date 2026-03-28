import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import { isDuplicate, isHeuristicDuplicate } from '../../src/domain/duplicates'

async function seedEvent(db: D1Database): Promise<string> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO events (id, slug, title, start_at, status)
       VALUES (?, ?, 'Test', datetime('now', '+1 day'), 'published')`,
    )
    .bind(id, `slug-${id.slice(0, 8)}`)
    .run()
  return id
}

async function seedRsvp(
  db: D1Database,
  eventId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const token = crypto.randomUUID()
  const defaults = {
    id: crypto.randomUUID(),
    event_id: eventId,
    name: 'Test User',
    email: `user-${crypto.randomUUID()}@example.com`,
    phone: null,
    rsvp_token: token,
    status: 'attending',
    source: 'web',
    submitted_at: new Date().toISOString(),
    ...overrides,
  }
  const cols = Object.keys(defaults).join(', ')
  const placeholders = Object.keys(defaults)
    .map(() => '?')
    .join(', ')
  await db
    .prepare(`INSERT INTO rsvps (${cols}) VALUES (${placeholders})`)
    .bind(...Object.values(defaults))
    .run()
  return token
}

describe('isDuplicate', () => {
  it('returns false when no existing RSVP', async () => {
    const eventId = await seedEvent(env.DB)
    const result = await isDuplicate(env.DB, eventId, 'new@example.com', null)
    expect(result.isDuplicate).toBe(false)
  })

  it('detects exact email duplicate (case-insensitive)', async () => {
    const eventId = await seedEvent(env.DB)
    const token = await seedRsvp(env.DB, eventId, { email: 'alice@example.com' })
    const result = await isDuplicate(env.DB, eventId, 'ALICE@EXAMPLE.COM', null)
    expect(result.isDuplicate).toBe(true)
    if (result.isDuplicate) expect(result.rsvpToken).toBe(token)
  })

  it('detects exact phone duplicate', async () => {
    const eventId = await seedEvent(env.DB)
    const token = await seedRsvp(env.DB, eventId, { email: null, phone: '+15550001234' })
    const result = await isDuplicate(env.DB, eventId, null, '+15550001234')
    expect(result.isDuplicate).toBe(true)
    if (result.isDuplicate) expect(result.rsvpToken).toBe(token)
  })

  it('does not cross-contaminate events', async () => {
    const eventA = await seedEvent(env.DB)
    const eventB = await seedEvent(env.DB)
    await seedRsvp(env.DB, eventA, { email: 'shared@example.com' })
    const result = await isDuplicate(env.DB, eventB, 'shared@example.com', null)
    expect(result.isDuplicate).toBe(false)
  })

  it('returns false when both email and phone are null', async () => {
    const eventId = await seedEvent(env.DB)
    const result = await isDuplicate(env.DB, eventId, null, null)
    expect(result.isDuplicate).toBe(false)
  })
})

describe('isHeuristicDuplicate', () => {
  it('returns false when no similar recent RSVP', async () => {
    const eventId = await seedEvent(env.DB)
    const result = await isHeuristicDuplicate(
      env.DB,
      eventId,
      'Alice Smith',
      'alice@example.com',
      null,
    )
    expect(result.isDuplicate).toBe(false)
  })

  it('detects same name + email within default window', async () => {
    const eventId = await seedEvent(env.DB)
    const token = await seedRsvp(env.DB, eventId, {
      name: 'Alice Smith',
      email: 'alice@example.com',
      submitted_at: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
    })
    const result = await isHeuristicDuplicate(
      env.DB,
      eventId,
      'Alice Smith',
      'alice@example.com',
      null,
    )
    expect(result.isDuplicate).toBe(true)
    if (result.isDuplicate) expect(result.rsvpToken).toBe(token)
  })

  it('ignores same name + email outside the window', async () => {
    const eventId = await seedEvent(env.DB)
    await seedRsvp(env.DB, eventId, {
      name: 'Alice Smith',
      email: 'alice@example.com',
      submitted_at: new Date(Date.now() - 10 * 60_000).toISOString(), // 10 min ago
    })
    // Use a 5-minute window → 10 min ago is outside
    const result = await isHeuristicDuplicate(
      env.DB,
      eventId,
      'Alice Smith',
      'alice@example.com',
      null,
      5 * 60_000,
    )
    expect(result.isDuplicate).toBe(false)
  })

  it('is case-insensitive on name', async () => {
    const eventId = await seedEvent(env.DB)
    const token = await seedRsvp(env.DB, eventId, {
      name: 'alice smith',
      email: 'alice@example.com',
      submitted_at: new Date().toISOString(),
    })
    const result = await isHeuristicDuplicate(
      env.DB,
      eventId,
      'ALICE SMITH',
      'alice@example.com',
      null,
    )
    expect(result.isDuplicate).toBe(true)
    if (result.isDuplicate) expect(result.rsvpToken).toBe(token)
  })

  it('returns false when neither email nor phone provided', async () => {
    const eventId = await seedEvent(env.DB)
    const result = await isHeuristicDuplicate(env.DB, eventId, 'Alice Smith', null, null)
    expect(result.isDuplicate).toBe(false)
  })
})
