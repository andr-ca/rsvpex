// app/tests/domain/notifications.test.ts
/**
 * @req NOTIF-01 — guest confirmation email
 * @req NOTIF-02 — admin alert email
 * @req NOTIF-03 — capacity threshold emails
 * @req NOTIF-05 — SMS via Twilio
 */
import { describe, it, expect } from 'vitest'
import {
  buildGuestConfirmationEmail,
  buildAdminAlertEmail,
  buildCapacityThresholdEmail,
  buildSmsMessage,
  idempotencyAlreadySent,
  shouldNotifyThreshold,
  currentThreshold,
} from '../../src/domain/notifications'

const baseRsvp = {
  id: 'rsvp-1',
  name: 'Alice Smith',
  email: 'alice@example.com',
  phone: null,
  status: 'attending',
  adults: 2,
  party_total: 2,
  dietary: '[]',
  notes: null,
  rsvp_token: 'tok-abc',
}

const baseEvent = {
  id: 'evt-1',
  title: 'Summer Party',
  slug: 'summer-party',
  start_at: '2027-07-01T18:00:00Z',
  timezone: 'UTC',
  host_name: 'Jane Host',
  max_guests_total: 100,
  threshold_80_notified_at: null,
  threshold_100_notified_at: null,
}

describe('buildGuestConfirmationEmail', () => {
  it('includes guest name, event title, and edit link', () => {
    const result = buildGuestConfirmationEmail(
      baseRsvp as any,
      baseEvent as any,
      'https://example.com',
    )
    expect(result.subject).toContain('Summer Party')
    expect(result.html).toContain('Alice Smith')
    expect(result.html).toContain('tok-abc')
    expect(result.to).toBe('alice@example.com')
  })

  it('includes party size in email body', () => {
    const result = buildGuestConfirmationEmail(
      baseRsvp as any,
      baseEvent as any,
      'https://example.com',
    )
    expect(result.html).toContain('2')
  })
})

describe('buildAdminAlertEmail', () => {
  it('includes RSVP details for admin', () => {
    const result = buildAdminAlertEmail(baseRsvp as any, baseEvent as any, 'admin@example.com')
    expect(result.subject).toContain('Summer Party')
    expect(result.html).toContain('Alice Smith')
    expect(result.to).toBe('admin@example.com')
  })
})

describe('buildCapacityThresholdEmail', () => {
  it('builds 80% threshold email', () => {
    const result = buildCapacityThresholdEmail(baseEvent as any, 80, 'admin@example.com')
    expect(result.subject).toContain('80%')
    expect(result.html).toContain('Summer Party')
    expect(result.to).toBe('admin@example.com')
  })

  it('builds 100% threshold email', () => {
    const result = buildCapacityThresholdEmail(baseEvent as any, 100, 'admin@example.com')
    expect(result.subject).toContain('100%')
  })
})

describe('buildSmsMessage', () => {
  it('builds SMS with event title and edit link', () => {
    const result = buildSmsMessage(baseRsvp as any, baseEvent as any, 'https://example.com')
    expect(result).toContain('Summer Party')
    expect(result).toContain('tok-abc')
    expect(result.length).toBeLessThanOrEqual(320)
  })
})

describe('idempotencyAlreadySent', () => {
  it('returns false when notification_log has no matching row', async () => {
    const db = {
      prepare: () => ({ bind: () => ({ first: async () => null }) }),
    }
    const result = await idempotencyAlreadySent(db as any, 'rsvp-1', 'guest_confirmation')
    expect(result).toBe(false)
  })

  it('returns true when notification_log has a matching row', async () => {
    const db = {
      prepare: () => ({ bind: () => ({ first: async () => ({ id: 'log-1' }) }) }),
    }
    const result = await idempotencyAlreadySent(db as any, 'rsvp-1', 'guest_confirmation')
    expect(result).toBe(true)
  })
})

describe('shouldNotifyThreshold', () => {
  it('returns true for 80% when not yet notified', () => {
    const event = { ...baseEvent, threshold_80_notified_at: null, threshold_100_notified_at: null }
    expect(shouldNotifyThreshold(event as any, 80)).toBe(true)
  })

  it('returns false for 80% when already notified', () => {
    const event = { ...baseEvent, threshold_80_notified_at: '2027-01-01T00:00:00Z' }
    expect(shouldNotifyThreshold(event as any, 80)).toBe(false)
  })

  it('returns false for 100% when already notified', () => {
    const event = { ...baseEvent, threshold_100_notified_at: '2027-01-01T00:00:00Z' }
    expect(shouldNotifyThreshold(event as any, 100)).toBe(false)
  })

  it('returns false when max_guests_total is null (no cap)', () => {
    const event = { ...baseEvent, max_guests_total: null }
    expect(shouldNotifyThreshold(event as any, 80)).toBe(false)
  })
})

describe('currentThreshold', () => {
  it('returns 80 when attendance is between 80% and 99%', () => {
    expect(currentThreshold(80, 100)).toBe(80)
    expect(currentThreshold(85, 100)).toBe(80)
  })

  it('returns 100 when attendance is at or above 100%', () => {
    expect(currentThreshold(100, 100)).toBe(100)
    expect(currentThreshold(110, 100)).toBe(100)
  })

  it('returns null when below 80%', () => {
    expect(currentThreshold(79, 100)).toBeNull()
    expect(currentThreshold(0, 100)).toBeNull()
  })

  it('returns null when maxGuests is null', () => {
    expect(currentThreshold(50, null)).toBeNull()
  })
})
