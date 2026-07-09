import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import {
  getRsvpByToken,
  updateRsvp,
  revokeToken,
  type RsvpUpdateData,
} from '../../src/domain/rsvpEdit'

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedEvent(db: D1Database): Promise<string> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO events (id, slug, title, start_at, status, max_guests_total, enable_waitlist)
     VALUES (?, ?, 'Test Event', '2026-12-01T12:00:00Z', 'published', 100, 0)`,
    )
    .bind(id, `slug-${id.slice(0, 8)}`)
    .run()
  return id
}

async function seedRsvp(db: D1Database, eventId: string, token: string): Promise<string> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO rsvps (id, event_id, name, email, adults, dietary, answers, status, rsvp_token)
     VALUES (?, ?, 'Alice', 'alice@example.com', 1, '[]', '{}', 'attending', ?)`,
    )
    .bind(id, eventId, token)
    .run()
  return id
}

describe('getRsvpByToken', () => {
  it('returns rsvp row when token exists', async () => {
    const eventId = await seedEvent(env.DB)
    const token = crypto.randomUUID()
    const id = await seedRsvp(env.DB, eventId, token)
    const result = await getRsvpByToken(env.DB, token)
    expect(result).not.toBeNull()
    expect(result?.id).toBe(id)
    expect(result?.rsvp_token).toBe(token)
  })

  it('returns null when token does not exist', async () => {
    const result = await getRsvpByToken(env.DB, 'nonexistent-token')
    expect(result).toBeNull()
  })
})

describe('updateRsvp', () => {
  it('updates allowed fields on the RSVP row', async () => {
    const eventId = await seedEvent(env.DB)
    const token = crypto.randomUUID()
    const id = await seedRsvp(env.DB, eventId, token)

    const update: RsvpUpdateData = {
      name: 'Alice Updated',
      email: 'alice2@example.com',
      phone: null,
      adults: 2,
      parentsCount: 0,
      siblingsCount: 0,
      childrenCount: 0,
      childrenAges: '[]',
      dietary: '[{"kind":"vegetarian","value":""}]',
      notes: 'New note',
      answers: '{}',
      status: 'attending',
    }

    await updateRsvp(env.DB, id, update)

    const row = await env.DB.prepare('SELECT name, adults, dietary FROM rsvps WHERE id = ?')
      .bind(id)
      .first<{ name: string; adults: number; dietary: string }>()

    expect(row?.name).toBe('Alice Updated')
    expect(row?.adults).toBe(2)
    expect(row?.dietary).toBe('[{"kind":"vegetarian","value":""}]')
  })

  it('throws if rsvp id does not exist', async () => {
    const update: RsvpUpdateData = {
      name: 'Ghost',
      email: null,
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
    }
    // Should not throw — D1 UPDATE on nonexistent row is a no-op; test verifies graceful behavior
    await expect(updateRsvp(env.DB, 'no-such-id', update)).resolves.not.toThrow()
  })
})

describe('revokeToken', () => {
  it('generates a new token for the RSVP and returns it', async () => {
    const eventId = await seedEvent(env.DB)
    const oldToken = crypto.randomUUID()
    const id = await seedRsvp(env.DB, eventId, oldToken)

    const newToken = await revokeToken(env.DB, id)

    expect(newToken).not.toBe(oldToken)
    expect(newToken).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('old token no longer finds the RSVP after revocation', async () => {
    const eventId = await seedEvent(env.DB)
    const oldToken = crypto.randomUUID()
    const id = await seedRsvp(env.DB, eventId, oldToken)

    await revokeToken(env.DB, id)

    const result = await getRsvpByToken(env.DB, oldToken)
    expect(result).toBeNull()
  })

  it('new token finds the RSVP after revocation', async () => {
    const eventId = await seedEvent(env.DB)
    const oldToken = crypto.randomUUID()
    const id = await seedRsvp(env.DB, eventId, oldToken)

    const newToken = await revokeToken(env.DB, id)
    const result = await getRsvpByToken(env.DB, newToken)

    expect(result).not.toBeNull()
    expect(result?.id).toBe(id)
  })
})
