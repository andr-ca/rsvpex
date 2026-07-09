/**
 * Pure domain functions for notification delivery.
 * No CF bindings — all functions accept plain objects.
 *
 * @req NOTIF-01 — guest confirmation email
 * @req NOTIF-02 — admin new-RSVP alert email
 * @req NOTIF-03 — capacity threshold emails (80% / 100%)
 * @req NOTIF-05 — SMS via Twilio per-event toggle
 */

export type EmailPayload = {
  to: string
  subject: string
  html: string
  text: string
}

export type RsvpRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  status: string
  adults: number
  party_total: number
  dietary: string
  notes: string | null
  rsvp_token: string
}

export type EventRow = {
  id: string
  title: string
  slug: string
  start_at: string
  timezone: string
  host_name: string | null
  max_guests_total: number | null
  threshold_80_notified_at: string | null
  threshold_100_notified_at: string | null
}

/**
 * Build guest confirmation email payload.
 * @req NOTIF-01
 */
export function buildGuestConfirmationEmail(
  rsvp: RsvpRow,
  event: EventRow,
  baseUrl: string,
): EmailPayload {
  const editLink = `${baseUrl}/rsvp/${event.slug}?rid=${rsvp.rsvp_token}`
  const subject = `You're registered for ${event.title}`
  const html = `
<p>Hi ${escHtml(rsvp.name)},</p>
<p>You're confirmed for <strong>${escHtml(event.title)}</strong>.</p>
<p>Party size: ${rsvp.party_total}</p>
<p>Status: ${rsvp.status}</p>
<p><a href="${editLink}">Edit your RSVP</a></p>
<p>See you there!</p>
`.trim()
  const text = `Hi ${rsvp.name},\nYou're confirmed for ${event.title}.\nParty size: ${rsvp.party_total}\nEdit your RSVP: ${editLink}`
  return { to: rsvp.email!, subject, html, text }
}

/**
 * Build admin new-RSVP alert email.
 * @req NOTIF-02
 */
export function buildAdminAlertEmail(
  rsvp: RsvpRow,
  event: EventRow,
  adminEmail: string,
): EmailPayload {
  const subject = `New RSVP for ${event.title}: ${rsvp.name}`
  const html = `
<p>New RSVP submitted for <strong>${escHtml(event.title)}</strong>:</p>
<ul>
  <li>Name: ${escHtml(rsvp.name)}</li>
  <li>Email: ${escHtml(rsvp.email ?? '(none)')}</li>
  <li>Status: ${rsvp.status}</li>
  <li>Party size: ${rsvp.party_total}</li>
</ul>
`.trim()
  const text = `New RSVP for ${event.title}: ${rsvp.name} (${rsvp.email ?? '(none)'}), party: ${rsvp.party_total}`
  return { to: adminEmail, subject, html, text }
}

/**
 * Build capacity threshold alert email for admin.
 * @req NOTIF-03
 */
export function buildCapacityThresholdEmail(
  event: EventRow,
  threshold: 80 | 100,
  adminEmail: string,
): EmailPayload {
  const subject = `${event.title} is at ${threshold}% capacity`
  const html = `<p><strong>${escHtml(event.title)}</strong> has reached ${threshold}% capacity.</p>`
  const text = `${event.title} has reached ${threshold}% capacity.`
  return { to: adminEmail, subject, html, text }
}

/**
 * Build SMS confirmation message (≤320 chars).
 * @req NOTIF-05
 */
export function buildSmsMessage(rsvp: RsvpRow, event: EventRow, baseUrl: string): string {
  const editLink = `${baseUrl}/rsvp/${event.slug}?rid=${rsvp.rsvp_token}`
  const msg = `Confirmed for ${event.title}. Party: ${rsvp.party_total}. Edit: ${editLink}`
  return msg.slice(0, 320)
}

/**
 * Check if a notification has already been sent for this RSVP + type.
 * Uses notification_log UNIQUE(rsvp_id, notification_type).
 * @req NOTIF-01 idempotency guard
 */
export async function idempotencyAlreadySent(
  db: D1Database,
  rsvpId: string,
  notificationType: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM notification_log WHERE rsvp_id = ? AND notification_type = ? LIMIT 1')
    .bind(rsvpId, notificationType)
    .first<{ id: string }>()
  return row !== null
}

/**
 * Mark a notification as sent in notification_log (INSERT OR IGNORE for idempotency).
 * @req NOTIF-01
 */
export async function markNotificationSent(
  db: D1Database,
  rsvpId: string,
  notificationType: string,
): Promise<void> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      'INSERT OR IGNORE INTO notification_log (id, rsvp_id, notification_type) VALUES (?, ?, ?)',
    )
    .bind(id, rsvpId, notificationType)
    .run()
}

/**
 * Check whether an event threshold has NOT been notified yet.
 * Returns true if the threshold should trigger a notification.
 * @req NOTIF-03
 */
export function shouldNotifyThreshold(event: EventRow, threshold: 80 | 100): boolean {
  if (event.max_guests_total === null) return false
  if (threshold === 80) return event.threshold_80_notified_at === null
  if (threshold === 100) return event.threshold_100_notified_at === null
  return false
}

/**
 * Calculate what threshold the current attendance has crossed.
 * Returns 100, 80, or null (if below 80%).
 * @req NOTIF-03
 */
export function currentThreshold(attending: number, maxGuests: number | null): 100 | 80 | null {
  if (maxGuests === null || maxGuests === 0) return null
  const pct = (attending / maxGuests) * 100
  if (pct >= 100) return 100
  if (pct >= 80) return 80
  return null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
