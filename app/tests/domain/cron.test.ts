// app/tests/domain/cron.test.ts
/**
 * @req NOTIF-04 — reminder emails via scheduled handler
 * @req SEC-04 — audit log purge
 */
import { describe, it, expect } from 'vitest'
import {
  buildReminderMessages,
  purgeOldAuditLogs,
} from '../../src/domain/cron'

// ── buildReminderMessages ─────────────────────────────────────────────────────

describe('buildReminderMessages', () => {
  it('returns one reminder per attending RSVP with email', () => {
    const rsvps = [
      { id: 'r1', event_id: 'e1', email: 'a@b.com' },
      { id: 'r2', event_id: 'e1', email: 'c@d.com' },
      { id: 'r3', event_id: 'e1', email: null }, // no email
    ]
    const msgs = buildReminderMessages('e1', rsvps as any)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toMatchObject({ type: 'reminder', rsvpId: 'r1', eventId: 'e1' })
    expect(msgs[1]).toMatchObject({ type: 'reminder', rsvpId: 'r2', eventId: 'e1' })
  })

  it('returns empty array when no eligible RSVPs', () => {
    const msgs = buildReminderMessages('e1', [])
    expect(msgs).toHaveLength(0)
  })
})

// ── purgeOldAuditLogs ─────────────────────────────────────────────────────────

describe('purgeOldAuditLogs', () => {
  it('deletes rows older than 365 days', async () => {
    const queries: string[] = []
    const mockDb = {
      prepare: (sql: string) => {
        queries.push(sql)
        return { run: async () => ({ meta: { changes: 5 } }) }
      },
    }
    const deleted = await purgeOldAuditLogs(mockDb as any)
    expect(deleted).toBe(5)
    expect(queries[0]).toContain('-365 days')
  })
})
