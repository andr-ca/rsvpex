// app/tests/integration/cron-handler.test.ts
/**
 * Integration tests for the scheduled (cron) handler.
 *
 * @req NOTIF-04 — reminder emails via scheduled handler
 * @req SEC-04 — 365-day audit log purge
 */
import { env } from 'cloudflare:test'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleScheduled } from '../../src/handlers/cron'
import { createEvent } from '../../src/domain/adminEvents'

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseEventInput = {
  title: 'Cron Test Event',
  timezone: 'UTC',
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

/** Insert an event with reminder_days_before set so that today triggers a reminder. */
async function seedEventWithReminderToday(db: D1Database, reminderDaysBefore = 7): Promise<string> {
  // start_at = today + reminderDaysBefore days, so reminder fires today
  const startAt = new Date()
  startAt.setDate(startAt.getDate() + reminderDaysBefore)
  const startAtStr = startAt.toISOString().slice(0, 19) + 'Z'

  const id = await createEvent(db, {
    ...baseEventInput,
    startAt: startAtStr,
    reminderDaysBefore,
  })

  // Publish it so it passes the status = 'published' filter
  await db.prepare(`UPDATE events SET status = 'published' WHERE id = ?`).bind(id).run()

  return id
}

async function seedRsvp(
  db: D1Database,
  eventId: string,
  email: string | null = 'guest@example.com',
  status = 'attending',
) {
  const id = crypto.randomUUID()
  const token = crypto.randomUUID()
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO rsvps (id, event_id, name, email, adults, status, rsvp_token, dietary, answers, children_ages, submitted_at, created_at, updated_at)
       VALUES (?, ?, 'Test Guest', ?, 1, ?, ?, '[]', '{}', '[]', ?, ?, ?)`,
    )
    .bind(id, eventId, email, status, token, now, now, now)
    .run()
  return { id, token }
}

async function seedAuditLog(db: D1Database, createdAt: string) {
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_id, entity_type, entity_id, action, created_at)
       VALUES (?, NULL, 'event', 'e-nonexistent', 'create', ?)`,
    )
    .bind(id, createdAt)
    .run()
  return id
}

const mockCtx: ExecutionContext = {
  waitUntil: (p: Promise<unknown>) => {
    void p
  },
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext

const mockController: ScheduledController = {
  scheduledTime: Date.now(),
  cron: '0 6 * * *',
  noRetry: vi.fn(),
} as unknown as ScheduledController

afterEach(() => {
  vi.restoreAllMocks()
})

async function cleanTables() {
  await env.DB.prepare('DELETE FROM rsvps').run()
  await env.DB.prepare('DELETE FROM events').run()
  await env.DB.prepare('DELETE FROM audit_logs').run()
}

// ── Reminder job ─────────────────────────────────────────────────────────────

describe('handleScheduled — reminder job', () => {
  beforeEach(cleanTables)
  it('enqueues reminder messages for eligible RSVPs', async () => {
    const eventId = await seedEventWithReminderToday(env.DB)
    await seedRsvp(env.DB, eventId, 'alice@example.com')
    await seedRsvp(env.DB, eventId, 'bob@example.com')
    // RSVP with no email — should be excluded
    await seedRsvp(env.DB, eventId, null)
    // Not attending — should be excluded
    await seedRsvp(env.DB, eventId, 'noshow@example.com', 'not_attending')

    const sendBatch = vi.fn().mockResolvedValue(undefined)
    const testEnv = { ...env, NOTIFICATIONS_QUEUE: { sendBatch } }

    await handleScheduled(mockController, testEnv as unknown as Env, mockCtx)

    // Allow waitUntil promises to resolve
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(sendBatch).toHaveBeenCalledOnce()
    const calls = sendBatch.mock.calls[0][0] as Array<{ body: { type: string; eventId: string } }>
    expect(calls).toHaveLength(2)
    expect(calls.every((m) => m.body.type === 'reminder')).toBe(true)
    expect(calls.every((m) => m.body.eventId === eventId)).toBe(true)
  })

  it('does not enqueue when no events have reminders today', async () => {
    // Seed event with reminder that is NOT today (too far in future)
    const id = await createEvent(env.DB, {
      ...baseEventInput,
      startAt: '2099-01-01T00:00:00Z',
      reminderDaysBefore: 7,
    })
    await env.DB.prepare(`UPDATE events SET status = 'published' WHERE id = ?`).bind(id).run()

    const sendBatch = vi.fn().mockResolvedValue(undefined)
    const testEnv = { ...env, NOTIFICATIONS_QUEUE: { sendBatch } }

    await handleScheduled(mockController, testEnv as unknown as Env, mockCtx)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(sendBatch).not.toHaveBeenCalled()
  })

  it('does not enqueue when event has notify_via_email = 0', async () => {
    const id = await createEvent(env.DB, {
      ...baseEventInput,
      notifyViaEmail: false,
      startAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 19) + 'Z',
      reminderDaysBefore: 7,
    })
    await env.DB.prepare(`UPDATE events SET status = 'published' WHERE id = ?`).bind(id).run()
    await seedRsvp(env.DB, id, 'guest@example.com')

    const sendBatch = vi.fn().mockResolvedValue(undefined)
    const testEnv = { ...env, NOTIFICATIONS_QUEUE: { sendBatch } }

    await handleScheduled(mockController, testEnv as unknown as Env, mockCtx)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(sendBatch).not.toHaveBeenCalled()
  })
})

// ── Audit purge job ───────────────────────────────────────────────────────────

describe('handleScheduled — audit purge job', () => {
  beforeEach(cleanTables)
  it('deletes audit_log rows older than 365 days', async () => {
    // Insert one old row (>365 days ago) and one recent row
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 366)
    const oldId = await seedAuditLog(env.DB, oldDate.toISOString())

    const recentDate = new Date()
    recentDate.setDate(recentDate.getDate() - 30)
    const recentId = await seedAuditLog(env.DB, recentDate.toISOString())

    const testEnv = {
      ...env,
      NOTIFICATIONS_QUEUE: { sendBatch: vi.fn().mockResolvedValue(undefined) },
    }

    await handleScheduled(mockController, testEnv as unknown as Env, mockCtx)
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Old row should be gone
    const old = await env.DB.prepare('SELECT id FROM audit_logs WHERE id = ?').bind(oldId).first()
    expect(old).toBeNull()

    // Recent row should remain
    const recent = await env.DB.prepare('SELECT id FROM audit_logs WHERE id = ?')
      .bind(recentId)
      .first()
    expect(recent).not.toBeNull()
  })
})
