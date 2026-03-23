import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import { checkAndInsertRsvp, type RsvpInsertData } from '../../src/domain/capacity'

// Helper: insert a seed event into D1
async function seedEvent(db: D1Database, overrides: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID()
  const defaults = {
    id,
    slug: `test-event-${id.slice(0, 8)}`,
    title: 'Test Event',
    start_at: new Date(Date.now() + 86400000).toISOString(),
    status: 'published',
    max_guests_total: 2,
    enable_waitlist: 0,
    ...overrides,
  }
  const cols = Object.keys(defaults).join(', ')
  const placeholders = Object.keys(defaults).map(() => '?').join(', ')
  await db
    .prepare(`INSERT INTO events (${cols}) VALUES (${placeholders})`)
    .bind(...Object.values(defaults))
    .run()
  return id
}

// Helper: build minimal RsvpInsertData
function makeRsvpData(eventId: string, overrides: Partial<RsvpInsertData> = {}): RsvpInsertData {
  return {
    id: crypto.randomUUID(),
    eventId,
    name: 'Alice Smith',
    email: `alice-${crypto.randomUUID()}@example.com`,
    phone: null,
    adults: 1,
    parentsCount: 0,
    siblingsCount: 0,
    childrenCount: 0,
    childrenAges: '[]',
    dietary: '[]',
    notes: null,
    answers: '{}',
    status: 'attending',
    rsvpToken: crypto.randomUUID(),
    ipHash: null,
    userAgent: null,
    clientSubmittedAt: null,
    ...overrides,
  }
}

describe('checkAndInsertRsvp', () => {
  it('inserts attending RSVP when under cap', async () => {
    const eventId = await seedEvent(env.DB, { max_guests_total: 5 })
    const data = makeRsvpData(eventId)
    const result = await checkAndInsertRsvp(env.DB, eventId, data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.status).toBe('attending')
      expect(result.rsvpId).toBe(data.id)
      expect(result.rsvpToken).toBe(data.rsvpToken)
    }
  })

  it('inserts attending RSVP when no cap is set (max_guests_total IS NULL)', async () => {
    const eventId = await seedEvent(env.DB, { max_guests_total: null })
    const data = makeRsvpData(eventId)
    const result = await checkAndInsertRsvp(env.DB, eventId, data)
    expect(result.success).toBe(true)
    if (result.success) expect(result.status).toBe('attending')
  })

  it('returns full when at capacity and enable_waitlist=false', async () => {
    const eventId = await seedEvent(env.DB, { max_guests_total: 1, enable_waitlist: 0 })
    // Fill the cap
    await checkAndInsertRsvp(env.DB, eventId, makeRsvpData(eventId))
    // Second attempt should be rejected
    const result = await checkAndInsertRsvp(env.DB, eventId, makeRsvpData(eventId))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.status).toBe('full')
  })

  it('inserts as waitlist when at capacity and enable_waitlist=true', async () => {
    const eventId = await seedEvent(env.DB, { max_guests_total: 1, enable_waitlist: 1 })
    // Fill the cap
    await checkAndInsertRsvp(env.DB, eventId, makeRsvpData(eventId))
    // Second attempt should be waitlisted
    const result = await checkAndInsertRsvp(env.DB, eventId, makeRsvpData(eventId))
    expect(result.success).toBe(true)
    if (result.success) expect(result.status).toBe('waitlist')
  })

  it('accounts for party_size when checking capacity', async () => {
    // Cap is 3, first RSVP has 3 adults — second should be full
    const eventId = await seedEvent(env.DB, { max_guests_total: 3, enable_waitlist: 0 })
    await checkAndInsertRsvp(env.DB, eventId, makeRsvpData(eventId, { adults: 3 }))
    const result = await checkAndInsertRsvp(env.DB, eventId, makeRsvpData(eventId))
    expect(result.success).toBe(false)
  })

  it('inserts not_attending RSVP bypassing capacity check', async () => {
    // Event is already "full"
    const eventId = await seedEvent(env.DB, { max_guests_total: 1, enable_waitlist: 0 })
    await checkAndInsertRsvp(env.DB, eventId, makeRsvpData(eventId))
    // A "not_attending" response should still be accepted
    const result = await checkAndInsertRsvp(
      env.DB, eventId,
      makeRsvpData(eventId, { status: 'not_attending', email: 'other@example.com' })
    )
    expect(result.success).toBe(true)
    if (result.success) expect(result.status).toBe('not_attending')
  })

  it('throws when event not found', async () => {
    await expect(
      checkAndInsertRsvp(env.DB, crypto.randomUUID(), makeRsvpData('nonexistent'))
    ).rejects.toThrow('Event not found')
  })

  it('concurrency: exactly 1 attending out of 5 parallel POSTs (cap=1, no waitlist)', async () => {
    const eventId = await seedEvent(env.DB, { max_guests_total: 1, enable_waitlist: 0 })
    const results = await Promise.all(
      Array.from({ length: 5 }, () => checkAndInsertRsvp(env.DB, eventId, makeRsvpData(eventId)))
    )
    const attending = results.filter(r => r.success && r.status === 'attending')
    const full = results.filter(r => !r.success && r.status === 'full')
    expect(attending).toHaveLength(1)
    expect(full).toHaveLength(4)
  })

  it('concurrency: exactly 1 attending + rest waitlisted (cap=1, waitlist enabled)', async () => {
    const eventId = await seedEvent(env.DB, { max_guests_total: 1, enable_waitlist: 1 })
    const results = await Promise.all(
      Array.from({ length: 5 }, () => checkAndInsertRsvp(env.DB, eventId, makeRsvpData(eventId)))
    )
    const attending = results.filter(r => r.success && r.status === 'attending')
    const waitlist = results.filter(r => r.success && r.status === 'waitlist')
    expect(attending).toHaveLength(1)
    expect(waitlist).toHaveLength(4)
  })
})
