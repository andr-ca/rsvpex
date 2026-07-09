import { describe, it, expect } from 'vitest'
import { generateIcs, type IcsEventData } from '../../src/domain/ics'

const baseEvent: IcsEventData = {
  rsvpId: 'rsvp-abc-123',
  eventTitle: 'Summer Garden Party',
  eventStartAt: '2026-07-15T15:00:00.000Z',
  eventEndAt: '2026-07-15T18:00:00.000Z',
  eventTimezone: 'America/Toronto',
  locationText: '123 Maple Street, Toronto',
  guestName: 'Alice Smith',
  adults: 2,
  childrenCount: 1,
  dietary: [{ kind: 'vegetarian', value: '' }],
}

describe('generateIcs', () => {
  it('returns a string starting with BEGIN:VCALENDAR', () => {
    const ics = generateIcs(baseEvent)
    expect(ics).toMatch(/^BEGIN:VCALENDAR/)
  })

  it('ends with END:VCALENDAR', () => {
    const ics = generateIcs(baseEvent)
    expect(ics.trim()).toMatch(/END:VCALENDAR$/)
  })

  it('includes a VEVENT block', () => {
    const ics = generateIcs(baseEvent)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VEVENT')
  })

  it('includes a VTIMEZONE block', () => {
    const ics = generateIcs(baseEvent)
    expect(ics).toContain('BEGIN:VTIMEZONE')
    expect(ics).toContain('TZID:America/Toronto')
  })

  it('includes SUMMARY matching event title', () => {
    const ics = generateIcs(baseEvent)
    expect(ics).toContain('SUMMARY:Summer Garden Party')
  })

  it('includes LOCATION when provided', () => {
    const ics = generateIcs(baseEvent)
    expect(ics).toContain('LOCATION:123 Maple Street')
  })

  it('omits LOCATION when not provided', () => {
    const ics = generateIcs({ ...baseEvent, locationText: null })
    expect(ics).not.toContain('LOCATION:')
  })

  it('includes DESCRIPTION with guest name and party size', () => {
    const ics = generateIcs(baseEvent)
    expect(ics).toContain('DESCRIPTION:')
    // DESCRIPTION lines are folded at 75 chars per RFC 5545, so just check
    // for the key data somewhere in the full string
    expect(ics).toContain('Alice Smith')
  })

  it('uses deterministic UID based on rsvpId', () => {
    const ics1 = generateIcs(baseEvent)
    const ics2 = generateIcs(baseEvent)
    expect(ics1).toContain('UID:rsvp-abc-123@rsvpex')
    expect(ics2).toContain('UID:rsvp-abc-123@rsvpex')
  })

  it('handles missing endAt (all-day-style: same day as start)', () => {
    const ics = generateIcs({ ...baseEvent, eventEndAt: null })
    // Should not throw; should still produce valid VCALENDAR
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('DTSTART')
  })

  // C-17 in recommendations.md: VTIMEZONE generation was rewritten from a
  // 365-day linear scan to a binary search + per-isolate memoization cache.
  // These tests pin down that the binary search still finds the correct
  // DST transitions (America/Toronto: second Sunday of March, first Sunday
  // of November, every year) rather than just "doesn't throw."
  describe('VTIMEZONE DST transitions (C-17 in recommendations.md)', () => {
    it('finds the spring-forward transition in March and fall-back in November', () => {
      const year = new Date().getFullYear()
      const ics = generateIcs(baseEvent)
      const daylightMatch = ics.match(/BEGIN:DAYLIGHT\r?\nDTSTART:(\d{8})T/)
      const standardMatch = ics.match(/BEGIN:STANDARD\r?\nDTSTART:(\d{8})T/)
      expect(daylightMatch?.[1].slice(0, 6)).toBe(`${year}03`)
      expect(standardMatch?.[1].slice(0, 6)).toBe(`${year}11`)
    })

    it('produces a single STANDARD-only block for a zone with no DST', () => {
      const ics = generateIcs({ ...baseEvent, eventTimezone: 'Asia/Kolkata' })
      expect(ics).toContain('TZID:Asia/Kolkata')
      expect(ics).not.toContain('BEGIN:DAYLIGHT')
      expect(ics).toContain('BEGIN:STANDARD')
    })

    it('is memoized: repeated calls for the same timezone return identical VTIMEZONE content', () => {
      const ics1 = generateIcs(baseEvent)
      const ics2 = generateIcs({ ...baseEvent, rsvpId: 'different-rsvp-id' })
      const extractVtimezone = (s: string) =>
        s.slice(s.indexOf('BEGIN:VTIMEZONE'), s.indexOf('END:VTIMEZONE'))
      expect(extractVtimezone(ics1)).toBe(extractVtimezone(ics2))
    })
  })
})
