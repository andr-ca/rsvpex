// app/tests/integration/queue-handler.test.ts
/**
 * Integration tests for the queue consumer.
 *
 * @req NOTIF-01 — guest confirmation email + idempotency
 * @req NOTIF-02 — admin new-RSVP alert
 * @req NOTIF-03 — capacity threshold emails
 * @req NOTIF-05 — SMS via Twilio
 */
import { env } from 'cloudflare:test'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { handleQueue, type NotificationMessage } from '../../src/handlers/queue'
import { createEvent } from '../../src/domain/adminEvents'

// ── Seed helpers ─────────────────────────────────────────────────────────────

const baseEventInput = {
  title: 'Queue Test Event',
  timezone: 'UTC',
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

async function seedRsvp(
  db: D1Database,
  eventId: string,
  email: string | null = 'test@example.com',
  phone: string | null = null,
  adults = 1,
) {
  const id = crypto.randomUUID()
  const token = crypto.randomUUID()
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO rsvps (id, event_id, name, email, phone, adults, status, rsvp_token, dietary, answers, children_ages, submitted_at, created_at, updated_at)
       VALUES (?, ?, 'Test Guest', ?, ?, ?, 'attending', ?, '[]', '{}', '[]', ?, ?, ?)`,
    )
    .bind(id, eventId, email, phone, adults, token, now, now, now)
    .run()
  return { id, token }
}

function makeBatch(messages: NotificationMessage[]): MessageBatch<NotificationMessage> {
  const msgObjects = messages.map((body) => ({
    body,
    ack: vi.fn(),
    retry: vi.fn(),
    id: crypto.randomUUID(),
    timestamp: new Date(),
    attempts: 1,
  }))
  return {
    messages: msgObjects,
    queue: 'rsvpex-notifications',
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<NotificationMessage>
}

function mockFetch(status = 200) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ id: 'mock-id' }), { status }))
}

const mockCtx: ExecutionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext

afterEach(() => {
  vi.restoreAllMocks()
})

// ── guest_confirmation ────────────────────────────────────────────────────────

describe('handleQueue — guest_confirmation', () => {
  it('sends email via Resend and records notification_log entry', async () => {
    const fetchSpy = mockFetch()
    const eventId = await createEvent(env.DB, baseEventInput)
    const { id: rsvpId } = await seedRsvp(env.DB, eventId, 'guest@example.com')
    const envWithKey = {
      ...env,
      RESEND_API_KEY: 'test-resend-key',
      ADMIN_FROM_EMAIL: 'admin@test.com',
    }

    const batch = makeBatch([{ type: 'guest_confirmation', rsvpId, eventId }])
    await handleQueue(batch as any, envWithKey as any, mockCtx)

    // Resend API called
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('resend'),
      expect.objectContaining({ method: 'POST' }),
    )
    // ack called
    expect((batch.messages[0] as any).ack).toHaveBeenCalled()
    // notification_log row inserted
    const log = await env.DB.prepare(
      'SELECT * FROM notification_log WHERE rsvp_id = ? AND notification_type = ?',
    )
      .bind(rsvpId, 'guest_confirmation')
      .first()
    expect(log).not.toBeNull()
  })

  it('skips email when RSVP has no email address', async () => {
    const fetchSpy = mockFetch()
    const eventId = await createEvent(env.DB, baseEventInput)
    const { id: rsvpId } = await seedRsvp(env.DB, eventId, null) // no email
    const envWithKey = { ...env, RESEND_API_KEY: 'test-key', ADMIN_FROM_EMAIL: 'admin@test.com' }

    const batch = makeBatch([{ type: 'guest_confirmation', rsvpId, eventId }])
    await handleQueue(batch as any, envWithKey as any, mockCtx)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips email when RESEND_API_KEY is not set', async () => {
    const fetchSpy = mockFetch()
    const eventId = await createEvent(env.DB, baseEventInput)
    const { id: rsvpId } = await seedRsvp(env.DB, eventId, 'guest2@example.com')
    const envNoKey = { ...env, RESEND_API_KEY: undefined, ADMIN_FROM_EMAIL: 'admin@test.com' }

    const batch = makeBatch([{ type: 'guest_confirmation', rsvpId, eventId }])
    await handleQueue(batch as any, envNoKey as any, mockCtx)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('is idempotent — does not send twice on retry', async () => {
    const fetchSpy = mockFetch()
    const eventId = await createEvent(env.DB, baseEventInput)
    const { id: rsvpId } = await seedRsvp(env.DB, eventId, 'idempotent@example.com')
    const envWithKey = { ...env, RESEND_API_KEY: 'test-key', ADMIN_FROM_EMAIL: 'admin@test.com' }

    // First delivery
    const batch1 = makeBatch([{ type: 'guest_confirmation', rsvpId, eventId }])
    await handleQueue(batch1 as any, envWithKey as any, mockCtx)
    // Simulated retry
    const batch2 = makeBatch([{ type: 'guest_confirmation', rsvpId, eventId }])
    await handleQueue(batch2 as any, envWithKey as any, mockCtx)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

// ── admin_alert ───────────────────────────────────────────────────────────────

describe('handleQueue — admin_alert', () => {
  it('sends admin alert email when ADMIN_FROM_EMAIL is set', async () => {
    const fetchSpy = mockFetch()
    const eventId = await createEvent(env.DB, baseEventInput)
    const { id: rsvpId } = await seedRsvp(env.DB, eventId, 'guest3@example.com')
    const envWithKey = { ...env, RESEND_API_KEY: 'test-key', ADMIN_FROM_EMAIL: 'admin@test.com' }

    const batch = makeBatch([{ type: 'admin_alert', rsvpId, eventId }])
    await handleQueue(batch as any, envWithKey as any, mockCtx)

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('resend'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect((batch.messages[0] as any).ack).toHaveBeenCalled()
  })

  it('skips admin alert when ADMIN_FROM_EMAIL is not set', async () => {
    const fetchSpy = mockFetch()
    const eventId = await createEvent(env.DB, baseEventInput)
    const { id: rsvpId } = await seedRsvp(env.DB, eventId, 'guest4@example.com')
    const envNoAdmin = { ...env, RESEND_API_KEY: 'test-key', ADMIN_FROM_EMAIL: undefined }

    const batch = makeBatch([{ type: 'admin_alert', rsvpId, eventId }])
    await handleQueue(batch as any, envNoAdmin as any, mockCtx)

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ── capacity_threshold ────────────────────────────────────────────────────────

describe('handleQueue — capacity_threshold', () => {
  it('marks threshold_80_notified_at and sends email', async () => {
    const fetchSpy = mockFetch()
    const eventId = await createEvent(env.DB, { ...baseEventInput, maxGuestsTotal: 100 })
    const envWithKey = { ...env, RESEND_API_KEY: 'test-key', ADMIN_FROM_EMAIL: 'admin@test.com' }

    const batch = makeBatch([
      { type: 'capacity_threshold', eventId, threshold: 80, currentAttending: 80 },
    ])
    await handleQueue(batch as any, envWithKey as any, mockCtx)

    const event = await env.DB.prepare('SELECT threshold_80_notified_at FROM events WHERE id = ?')
      .bind(eventId)
      .first<{ threshold_80_notified_at: string | null }>()
    expect(event?.threshold_80_notified_at).not.toBeNull()
    expect(fetchSpy).toHaveBeenCalled()
  })

  it('does not re-send 80% threshold when already notified', async () => {
    const fetchSpy = mockFetch()
    const eventId = await createEvent(env.DB, { ...baseEventInput, maxGuestsTotal: 100 })
    // Pre-mark as notified
    await env.DB.prepare(
      "UPDATE events SET threshold_80_notified_at = datetime('now') WHERE id = ?",
    )
      .bind(eventId)
      .run()
    const envWithKey = { ...env, RESEND_API_KEY: 'test-key', ADMIN_FROM_EMAIL: 'admin@test.com' }

    const batch = makeBatch([
      { type: 'capacity_threshold', eventId, threshold: 80, currentAttending: 80 },
    ])
    await handleQueue(batch as any, envWithKey as any, mockCtx)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('marks threshold_100_notified_at for 100% threshold', async () => {
    const fetchSpy = mockFetch()
    const eventId = await createEvent(env.DB, { ...baseEventInput, maxGuestsTotal: 100 })
    const envWithKey = { ...env, RESEND_API_KEY: 'test-key', ADMIN_FROM_EMAIL: 'admin@test.com' }

    const batch = makeBatch([
      { type: 'capacity_threshold', eventId, threshold: 100, currentAttending: 100 },
    ])
    await handleQueue(batch as any, envWithKey as any, mockCtx)

    const event = await env.DB.prepare('SELECT threshold_100_notified_at FROM events WHERE id = ?')
      .bind(eventId)
      .first<{ threshold_100_notified_at: string | null }>()
    expect(event?.threshold_100_notified_at).not.toBeNull()
    fetchSpy.mockRestore()
  })
})

// ── sms_confirmation ──────────────────────────────────────────────────────────

describe('handleQueue — sms_confirmation', () => {
  it('sends SMS via Twilio and records notification_log entry', async () => {
    const fetchSpy = mockFetch()
    const eventId = await createEvent(env.DB, { ...baseEventInput, notifyViaSms: true })
    const { id: rsvpId } = await seedRsvp(env.DB, eventId, null, '+15551234567')
    const envWithTwilio = {
      ...env,
      RESEND_API_KEY: 'test-key',
      ADMIN_FROM_EMAIL: 'admin@test.com',
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+15559999999',
    }

    const batch = makeBatch([{ type: 'sms_confirmation', rsvpId, eventId }])
    await handleQueue(batch as any, envWithTwilio as any, mockCtx)

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('twilio'),
      expect.objectContaining({ method: 'POST' }),
    )
    const log = await env.DB.prepare(
      'SELECT * FROM notification_log WHERE rsvp_id = ? AND notification_type = ?',
    )
      .bind(rsvpId, 'sms_confirmation')
      .first()
    expect(log).not.toBeNull()
  })

  it('skips SMS when RSVP has no phone', async () => {
    const fetchSpy = mockFetch()
    const eventId = await createEvent(env.DB, { ...baseEventInput, notifyViaSms: true })
    const { id: rsvpId } = await seedRsvp(env.DB, eventId, 'sms@example.com', null)
    const envWithTwilio = {
      ...env,
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+15559999999',
    }

    const batch = makeBatch([{ type: 'sms_confirmation', rsvpId, eventId }])
    await handleQueue(batch as any, envWithTwilio as any, mockCtx)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips SMS when Twilio secrets not set', async () => {
    const fetchSpy = mockFetch()
    const eventId = await createEvent(env.DB, { ...baseEventInput, notifyViaSms: true })
    const { id: rsvpId } = await seedRsvp(env.DB, eventId, null, '+15551234567')

    const batch = makeBatch([{ type: 'sms_confirmation', rsvpId, eventId }])
    await handleQueue(batch as any, env as any, mockCtx)

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ── error handling ────────────────────────────────────────────────────────────

describe('handleQueue — error handling', () => {
  it('calls retry on message when API call fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    )
    const eventId = await createEvent(env.DB, baseEventInput)
    const { id: rsvpId } = await seedRsvp(env.DB, eventId, 'error@example.com')
    const envWithKey = { ...env, RESEND_API_KEY: 'test-key', ADMIN_FROM_EMAIL: 'admin@test.com' }

    const batch = makeBatch([{ type: 'guest_confirmation', rsvpId, eventId }])
    await handleQueue(batch as any, envWithKey as any, mockCtx)

    expect((batch.messages[0] as any).retry).toHaveBeenCalled()
    expect((batch.messages[0] as any).ack).not.toHaveBeenCalled()
  })
})
