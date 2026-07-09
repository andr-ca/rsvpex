// app/tests/domain/adminRsvps.test.ts
/**
 * @req ADMIN-05 — RSVP list with filters and pagination
 * @req ADMIN-10 — Waitlist promotion with transactional capacity recheck
 * @req GAP-04 — Admin edit capacity guard
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import { createEvent } from '../../src/domain/adminEvents'
import {
  listRsvps,
  getRsvp,
  updateRsvpWithCapacityGuard,
  promoteFromWaitlist,
  deleteRsvp,
} from '../../src/domain/adminRsvps'

const baseEvent = {
  title: 'RSVP Test Event',
  timezone: 'America/Toronto',
  startAt: '2027-01-01T18:00:00Z',
  visibility: 'public' as const,
  isKidsEvent: false,
  allowChildren: true,
  allowSiblings: true,
  allowParents: true,
  allowStatusChoice: true,
  enableWaitlist: true,
  enableHeuristicDupCheck: false,
  locale: 'en' as const,
  maxPartySizePerRsvp: 10,
  notifyViaEmail: true,
  notifyViaSms: false,
  questions: '[]',
}

async function seedRsvp(
  db: D1Database,
  eventId: string,
  overrides?: Partial<{
    name: string
    email: string
    status: string
    adults: number
  }>,
) {
  const id = crypto.randomUUID()
  const name = overrides?.name ?? `Guest-${id.slice(0, 6)}`
  const status = overrides?.status ?? 'attending'
  const adults = overrides?.adults ?? 1
  const email = overrides?.email ?? null
  await db
    .prepare(
      `INSERT INTO rsvps (id, event_id, name, email, adults, status, rsvp_token, dietary, answers, children_ages)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '{}', '[]')`,
    )
    .bind(id, eventId, name, email, adults, status, crypto.randomUUID())
    .run()
  return id
}

describe('listRsvps', () => {
  it('returns all RSVPs for an event', async () => {
    const eventId = await createEvent(env.DB, baseEvent)
    await seedRsvp(env.DB, eventId)
    await seedRsvp(env.DB, eventId)
    const result = await listRsvps(env.DB, eventId, { page: 1, perPage: 50 })
    expect(result.total).toBeGreaterThanOrEqual(2)
    expect(result.rsvps.length).toBeGreaterThanOrEqual(2)
  })

  it('filters by status', async () => {
    const eventId = await createEvent(env.DB, baseEvent)
    await seedRsvp(env.DB, eventId, { status: 'attending' })
    await seedRsvp(env.DB, eventId, { status: 'waitlist' })
    const result = await listRsvps(env.DB, eventId, { status: 'waitlist', page: 1, perPage: 50 })
    expect(result.rsvps.every((r) => r.status === 'waitlist')).toBe(true)
  })

  it('filters by name search (case-insensitive LIKE)', async () => {
    const eventId = await createEvent(env.DB, baseEvent)
    await seedRsvp(env.DB, eventId, { name: 'Alice Smith' })
    await seedRsvp(env.DB, eventId, { name: 'Bob Jones' })
    const result = await listRsvps(env.DB, eventId, { nameSearch: 'alice', page: 1, perPage: 50 })
    expect(result.rsvps.length).toBeGreaterThanOrEqual(1)
    expect(result.rsvps[0].name).toBe('Alice Smith')
  })

  it('paginates correctly', async () => {
    const eventId = await createEvent(env.DB, baseEvent)
    for (let i = 0; i < 5; i++) await seedRsvp(env.DB, eventId)
    const page1 = await listRsvps(env.DB, eventId, { page: 1, perPage: 3 })
    const page2 = await listRsvps(env.DB, eventId, { page: 2, perPage: 3 })
    expect(page1.rsvps.length).toBe(3)
    expect(page2.rsvps.length).toBeGreaterThanOrEqual(1)
    expect(page1.totalPages).toBeGreaterThanOrEqual(2)
  })
})

describe('updateRsvpWithCapacityGuard', () => {
  it('updates RSVP fields without capacity check for name-only change', async () => {
    const eventId = await createEvent(env.DB, baseEvent)
    const rsvpId = await seedRsvp(env.DB, eventId, { adults: 1 })
    const result = await updateRsvpWithCapacityGuard(env.DB, rsvpId, { name: 'Updated Name' })
    expect(result.success).toBe(true)
    const rsvp = await getRsvp(env.DB, rsvpId)
    expect(rsvp!.name).toBe('Updated Name')
  })

  it('blocks admin edit when it would exceed capacity', async () => {
    const eventId = await createEvent(env.DB, { ...baseEvent, maxGuestsTotal: 3 })
    // Seed 2 other attending RSVPs (party_total = 2)
    await seedRsvp(env.DB, eventId, { adults: 2, status: 'attending' })
    // Our RSVP: 1 attending
    const rsvpId = await seedRsvp(env.DB, eventId, { adults: 1, status: 'attending' })
    // Try to increase party size to 3 — would make total 5 > 3
    const result = await updateRsvpWithCapacityGuard(env.DB, rsvpId, { adults: 3 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('capacity_exceeded')
      expect(result.capacity).toBe(3)
    }
  })

  it('allows admin edit that stays within capacity', async () => {
    const eventId = await createEvent(env.DB, { ...baseEvent, maxGuestsTotal: 5 })
    const rsvpId = await seedRsvp(env.DB, eventId, { adults: 1, status: 'attending' })
    const result = await updateRsvpWithCapacityGuard(env.DB, rsvpId, { adults: 2 })
    expect(result.success).toBe(true)
  })
})

describe('promoteFromWaitlist', () => {
  it('promotes a waitlisted guest when capacity is available', async () => {
    const eventId = await createEvent(env.DB, { ...baseEvent, maxGuestsTotal: 5 })
    await seedRsvp(env.DB, eventId, { adults: 2, status: 'attending' })
    const waitlistId = await seedRsvp(env.DB, eventId, { adults: 2, status: 'waitlist' })
    const result = await promoteFromWaitlist(env.DB, waitlistId)
    expect(result.success).toBe(true)
    const rsvp = await getRsvp(env.DB, waitlistId)
    expect(rsvp!.status).toBe('attending')
  })

  it('blocks promotion when capacity is full', async () => {
    const eventId = await createEvent(env.DB, { ...baseEvent, maxGuestsTotal: 2 })
    await seedRsvp(env.DB, eventId, { adults: 2, status: 'attending' })
    const waitlistId = await seedRsvp(env.DB, eventId, { adults: 1, status: 'waitlist' })
    const result = await promoteFromWaitlist(env.DB, waitlistId)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toBe('no_capacity')
  })

  it('returns not_waitlisted for non-waitlist RSVP', async () => {
    const eventId = await createEvent(env.DB, baseEvent)
    const rsvpId = await seedRsvp(env.DB, eventId, { status: 'attending' })
    const result = await promoteFromWaitlist(env.DB, rsvpId)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toBe('not_waitlisted')
  })

  it('promotes when no capacity cap is set', async () => {
    const eventId = await createEvent(env.DB, { ...baseEvent, maxGuestsTotal: undefined })
    const waitlistId = await seedRsvp(env.DB, eventId, { adults: 99, status: 'waitlist' })
    const result = await promoteFromWaitlist(env.DB, waitlistId)
    expect(result.success).toBe(true)
  })
})

describe('deleteRsvp', () => {
  it('deletes an RSVP', async () => {
    const eventId = await createEvent(env.DB, baseEvent)
    const rsvpId = await seedRsvp(env.DB, eventId)
    await deleteRsvp(env.DB, rsvpId)
    const rsvp = await getRsvp(env.DB, rsvpId)
    expect(rsvp).toBeNull()
  })
})
