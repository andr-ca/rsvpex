// app/tests/domain/adminEvents.test.ts
/**
 * @req ADMIN-04 — Event CRUD
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import {
  slugify,
  generateUniqueSlug,
  createEvent,
  getEvent,
  listEvents,
  updateEvent,
  publishEvent,
  archiveEvent,
  getEventStats,
} from '../../src/domain/adminEvents'

const baseInput = {
  title: 'Test Event',
  timezone: 'America/Toronto',
  startAt: '2027-01-01T18:00:00Z',
  visibility: 'public' as const,
  isKidsEvent: false,
  allowChildren: true,
  allowSiblings: true,
  allowParents: true,
  allowStatusChoice: true,
  enableWaitlist: false,
  enableHeuristicDupCheck: false,
  locale: 'en' as const,
  maxPartySizePerRsvp: 10,
  notifyViaEmail: true,
  notifyViaSms: false,
  questions: '[]',
}

describe('slugify', () => {
  it('converts title to lowercase hyphenated slug', () => {
    expect(slugify('Hello World!')).toBe('hello-world')
  })
  it('trims leading/trailing hyphens', () => {
    expect(slugify('  -  Test  -  ')).toBe('test')
  })
  it('collapses multiple special chars to single hyphen', () => {
    expect(slugify('A & B -- C')).toBe('a-b-c')
  })
  it('returns "event" for empty/special-only title', () => {
    expect(slugify('!!!!')).toBe('event')
  })
})

describe('generateUniqueSlug', () => {
  it('returns base slug when no conflict', async () => {
    const slug = await generateUniqueSlug(env.DB, 'my-event')
    expect(slug).toBe('my-event')
  })

  it('appends -2 on first conflict', async () => {
    await createEvent(env.DB, { ...baseInput, slug: 'taken-slug' })
    const slug = await generateUniqueSlug(env.DB, 'taken-slug')
    expect(slug).toBe('taken-slug-2')
  })

  it('appends -3 on second conflict', async () => {
    await createEvent(env.DB, { ...baseInput, slug: 'conflict-slug' })
    await createEvent(env.DB, { ...baseInput, slug: 'conflict-slug-2' })
    const slug = await generateUniqueSlug(env.DB, 'conflict-slug')
    expect(slug).toBe('conflict-slug-3')
  })
})

describe('createEvent', () => {
  it('creates event and returns an id', async () => {
    const id = await createEvent(env.DB, baseInput)
    expect(id).toBeTruthy()
    const event = await getEvent(env.DB, id)
    expect(event).not.toBeNull()
    expect(event!.title).toBe('Test Event')
    expect(event!.status).toBe('draft')
  })

  it('auto-generates slug from title', async () => {
    const id = await createEvent(env.DB, { ...baseInput, title: 'My Birthday Party' })
    const event = await getEvent(env.DB, id)
    expect(event!.slug).toBe('my-birthday-party')
  })

  it('uses provided slug (slugified) over title', async () => {
    const id = await createEvent(env.DB, { ...baseInput, slug: 'custom-slug' })
    const event = await getEvent(env.DB, id)
    expect(event!.slug).toBe('custom-slug')
  })
})

describe('listEvents', () => {
  it('returns events ordered by start_at descending', async () => {
    const id1 = await createEvent(env.DB, { ...baseInput, startAt: '2027-01-01T00:00:00Z' })
    const id2 = await createEvent(env.DB, { ...baseInput, startAt: '2027-06-01T00:00:00Z' })
    const events = await listEvents(env.DB)
    const ids = events.map((e) => e.id)
    expect(ids.indexOf(id2)).toBeLessThan(ids.indexOf(id1))
  })
})

describe('updateEvent', () => {
  it('updates only provided fields', async () => {
    const id = await createEvent(env.DB, baseInput)
    await updateEvent(env.DB, id, { title: 'Updated Title' })
    const event = await getEvent(env.DB, id)
    expect(event!.title).toBe('Updated Title')
    expect(event!.timezone).toBe('America/Toronto') // unchanged
  })
})

describe('publishEvent / archiveEvent', () => {
  it('publishes event', async () => {
    const id = await createEvent(env.DB, baseInput)
    await publishEvent(env.DB, id)
    const event = await getEvent(env.DB, id)
    expect(event!.status).toBe('published')
  })

  it('archives event', async () => {
    const id = await createEvent(env.DB, baseInput)
    await archiveEvent(env.DB, id)
    const event = await getEvent(env.DB, id)
    expect(event!.status).toBe('archived')
    expect(event!.archived_at).toBeTruthy()
  })
})

describe('getEventStats', () => {
  it('returns zero counts for event with no RSVPs', async () => {
    const id = await createEvent(env.DB, baseInput)
    const stats = await getEventStats(env.DB, id)
    expect(stats.attending).toBe(0)
    expect(stats.total).toBe(0)
    expect(stats.capacity).toBeNull()
  })

  it('counts attending RSVPs by party_total', async () => {
    const id = await createEvent(env.DB, { ...baseInput, maxGuestsTotal: 50 })
    await env.DB.prepare(
      `INSERT INTO rsvps (id, event_id, name, adults, status, rsvp_token, dietary, answers, children_ages)
       VALUES (?, ?, 'Alice', 2, 'attending', ?, '[]', '{}', '[]')`,
    )
      .bind(crypto.randomUUID(), id, crypto.randomUUID())
      .run()
    const stats = await getEventStats(env.DB, id)
    expect(stats.attending).toBe(2)
    expect(stats.capacity).toBe(50)
  })
})
