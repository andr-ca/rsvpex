/**
 * Scheduled (cron) handler — fires daily at 0 6 * * *.
 *
 * Jobs:
 * 1. Reminder emails: query events with reminders due today → enqueue per-RSVP reminder messages
 * 2. Audit log purge: delete audit_logs rows older than 365 days
 *
 * @req NOTIF-04 — reminder emails N days before event
 * @req SEC-04 — 365-day audit log purge
 */
import {
  queryEventsWithRemindersToday,
  queryAttendingRsvpsForEvent,
  buildReminderMessages,
  purgeOldAuditLogs,
} from '../domain/cron'
import type { NotificationMessage } from './queue'

export async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  ctx.waitUntil(
    Promise.all([
      runReminderJob(env),
      runAuditPurgeJob(env),
    ])
  )
}

async function runReminderJob(env: Env): Promise<void> {
  const events = await queryEventsWithRemindersToday(env.DB)
  if (events.length === 0) return

  for (const event of events) {
    const rsvps = await queryAttendingRsvpsForEvent(env.DB, event.id)
    const msgs = buildReminderMessages(event.id, rsvps)
    if (msgs.length === 0) continue

    // sendBatch accepts up to 100 messages — chunk if needed
    const BATCH_SIZE = 100
    for (let i = 0; i < msgs.length; i += BATCH_SIZE) {
      const chunk = msgs.slice(i, i + BATCH_SIZE) as NotificationMessage[]
      await env.NOTIFICATIONS_QUEUE.sendBatch(chunk.map((body) => ({ body })))
    }
  }
}

async function runAuditPurgeJob(env: Env): Promise<void> {
  const deleted = await purgeOldAuditLogs(env.DB)
  if (deleted > 0) {
    console.log(`Purged ${deleted} audit_log rows older than 365 days`)
  }
}
