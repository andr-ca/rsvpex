// app/tests/domain/timezone.test.ts
/**
 * @req ADMIN-04 — admin-entered event times are normalized to UTC correctly
 */
import { describe, it, expect } from 'vitest'
import { localToUtc, utcToLocal } from '../../src/domain/timezone'

describe('localToUtc', () => {
  it('treats a UTC timezone as a pass-through', () => {
    expect(localToUtc('UTC', '2026-07-08T18:00')).toBe('2026-07-08T18:00:00.000Z')
  })

  it('applies the standard-time (EST, UTC-5) offset in winter', () => {
    expect(localToUtc('America/Toronto', '2026-01-15T18:00')).toBe('2026-01-15T23:00:00.000Z')
  })

  it('applies the daylight-time (EDT, UTC-4) offset in summer', () => {
    expect(localToUtc('America/Toronto', '2026-07-08T18:00')).toBe('2026-07-08T22:00:00.000Z')
  })

  it('picks the correct offset on either side of a DST transition (2026-03-08)', () => {
    // Second Sunday of March 2026 (2026-03-08) is when America/Toronto springs
    // forward from EST (-5) to EDT (-4).
    expect(localToUtc('America/Toronto', '2026-03-07T18:00')).toBe('2026-03-07T23:00:00.000Z')
    expect(localToUtc('America/Toronto', '2026-03-08T18:00')).toBe('2026-03-08T22:00:00.000Z')
  })

  it('accepts a zoneless string with explicit seconds', () => {
    expect(localToUtc('UTC', '2026-07-08T18:00:30')).toBe('2026-07-08T18:00:30.000Z')
  })

  it('throws on a malformed datetime string', () => {
    expect(() => localToUtc('UTC', 'not-a-date')).toThrow()
  })

  it('throws on an unrecognized IANA timezone', () => {
    expect(() => localToUtc('Not/A_Timezone', '2026-07-08T18:00')).toThrow()
  })
})

describe('utcToLocal', () => {
  it('is the inverse of localToUtc across a DST boundary', () => {
    for (const local of ['2026-01-15T18:00', '2026-07-08T18:00', '2026-03-08T18:00']) {
      const utc = localToUtc('America/Toronto', local)
      expect(utcToLocal('America/Toronto', utc)).toBe(local)
    }
  })

  it('formats a UTC instant as UTC wall-clock time for the UTC zone', () => {
    expect(utcToLocal('UTC', '2026-07-08T18:00:00.000Z')).toBe('2026-07-08T18:00')
  })
})
