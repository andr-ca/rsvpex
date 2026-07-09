// app/src/domain/cron.ts
/**
 * Pure domain functions for scheduled (cron) jobs.
 * No CF bindings — functions accept D1Database and return plain values.
 *
 * @req NOTIF-04 — reminder emails N days before event
 * @req SEC-04 — 365-day audit log purge
 */

export type ReminderRsvpRow = {
  id: string
  event_id: string
  email: string | null
}

export type ReminderMessage = {
  type: 'reminder'
  rsvpId: string
  eventId: string
}

/**
 * Build reminder notification messages for all eligible RSVPs for an event.
 * Eligible: status = 'attending', has email.
 * Note: notify_via_email is on the events table and is checked in queryEventsWithRemindersToday.
 *
 * @req NOTIF-04
 */
export function buildReminderMessages(
  eventId: string,
  rsvps: ReminderRsvpRow[],
): ReminderMessage[] {
  return rsvps.filter((r) => r.email).map((r) => ({ type: 'reminder', rsvpId: r.id, eventId }))
}

/**
 * Query events whose reminder date is today (start_at - reminder_days_before = today).
 * Also checks notify_via_email = 1 on the event — only events with email notifications enabled.
 * Returns a list of { eventId, eventTitle } objects.
 *
 * @req NOTIF-04
 */
export async function queryEventsWithRemindersToday(
  db: D1Database,
): Promise<Array<{ id: string; title: string }>> {
  const result = await db
    .prepare(
      `SELECT id, title
         FROM events
        WHERE status = 'published'
          AND notify_via_email = 1
          AND reminder_days_before IS NOT NULL
          AND date(start_at, '-' || reminder_days_before || ' days') = date('now')`,
    )
    .all<{ id: string; title: string }>()
  return result.results ?? []
}

/**
 * Query all attending RSVPs for an event eligible for reminder email.
 *
 * @req NOTIF-04
 */
export async function queryAttendingRsvpsForEvent(
  db: D1Database,
  eventId: string,
): Promise<ReminderRsvpRow[]> {
  const result = await db
    .prepare(
      `SELECT id, event_id, email
         FROM rsvps
        WHERE event_id = ?
          AND status = 'attending'`,
    )
    .bind(eventId)
    .all<ReminderRsvpRow>()
  return result.results ?? []
}

/**
 * Purge audit_log rows older than 365 days.
 * Returns the number of rows deleted.
 *
 * @req SEC-04
 */
export async function purgeOldAuditLogs(db: D1Database): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM audit_logs WHERE created_at < datetime('now', '-365 days')`)
    .run()
  return result.meta?.changes ?? 0
}

/**
 * Purge expired sessions. Session rows aren't self-cleaning — expired ones
 * would otherwise sit in D1 forever, growing the table and the surface
 * area of any future leak (S-6 in recommendations.md).
 * Returns the number of rows deleted.
 */
export async function purgeExpiredSessions(db: D1Database): Promise<number> {
  // sessions.expires_at is written as a JS `Date.toISOString()` string
  // ("...T...Z"), not SQLite's `datetime('now')` format ("... ..." with a
  // space) — comparing against the latter would silently never match due to
  // lexicographic ordering differing between the two formats. Compare
  // against a JS-formatted "now" instead, matching how getSession() does it.
  const now = new Date().toISOString()
  const result = await db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).bind(now).run()
  return result.meta?.changes ?? 0
}

/**
 * Purge password reset tokens that are expired or already used. Same
 * rationale as purgeExpiredSessions (S-6 in recommendations.md): a used or
 * expired token is worthless for its intended purpose but still worth
 * clearing out of storage.
 * Returns the number of rows deleted.
 */
export async function purgeExpiredResetTokens(db: D1Database): Promise<number> {
  // Same JS-vs-SQLite datetime format mismatch as purgeExpiredSessions above.
  const now = new Date().toISOString()
  const result = await db
    .prepare(`DELETE FROM password_reset_tokens WHERE expires_at < ? OR used_at IS NOT NULL`)
    .bind(now)
    .run()
  return result.meta?.changes ?? 0
}
