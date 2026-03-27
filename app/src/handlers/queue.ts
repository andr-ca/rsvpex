// app/src/handlers/queue.ts
/**
 * Queue consumer — processes notification messages from rsvpex-notifications queue.
 *
 * Message types: guest_confirmation, admin_alert, capacity_threshold, sms_confirmation, reminder
 *
 * @req NOTIF-01 — guest confirmation email
 * @req NOTIF-02 — admin new-RSVP alert email
 * @req NOTIF-03 — capacity threshold emails (80% / 100%)
 * @req NOTIF-04 — reminder emails
 * @req NOTIF-05 — SMS via Twilio per-event toggle
 */
import {
  buildGuestConfirmationEmail,
  buildAdminAlertEmail,
  buildCapacityThresholdEmail,
  buildSmsMessage,
  idempotencyAlreadySent,
  markNotificationSent,
  shouldNotifyThreshold,
  type RsvpRow,
  type EventRow,
  type EmailPayload,
} from '../domain/notifications'

export type NotificationMessage =
  | { type: 'guest_confirmation'; rsvpId: string; eventId: string }
  | { type: 'admin_alert'; rsvpId: string; eventId: string }
  | { type: 'capacity_threshold'; eventId: string; threshold: 80 | 100; currentAttending: number }
  | { type: 'sms_confirmation'; rsvpId: string; eventId: string }
  | { type: 'reminder'; rsvpId: string; eventId: string }

const BASE_URL = 'https://rsvpex.app'

export async function handleQueue(
  batch: MessageBatch<NotificationMessage>,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processMessage(msg.body, env)
      msg.ack()
    } catch (err) {
      console.error('Queue message failed:', JSON.stringify(msg.body), String(err))
      msg.retry()
    }
  }
}

async function processMessage(body: NotificationMessage, env: Env): Promise<void> {
  switch (body.type) {
    case 'guest_confirmation':
      await handleGuestConfirmation(body.rsvpId, body.eventId, env)
      break
    case 'admin_alert':
      await handleAdminAlert(body.rsvpId, body.eventId, env)
      break
    case 'capacity_threshold':
      await handleCapacityThreshold(body.eventId, body.threshold, body.currentAttending, env)
      break
    case 'sms_confirmation':
      await handleSmsConfirmation(body.rsvpId, body.eventId, env)
      break
    case 'reminder':
      await handleReminder(body.rsvpId, body.eventId, env)
      break
    default:
      console.warn('Unknown notification type:', (body as any).type)
  }
}

// ── D1 fetch helpers ─────────────────────────────────────────────────────────

async function fetchRsvp(db: D1Database, rsvpId: string): Promise<RsvpRow | null> {
  return db
    .prepare('SELECT id, name, email, phone, status, adults, party_total, dietary, notes, rsvp_token FROM rsvps WHERE id = ? LIMIT 1')
    .bind(rsvpId)
    .first<RsvpRow>()
}

async function fetchEvent(db: D1Database, eventId: string): Promise<EventRow | null> {
  return db
    .prepare('SELECT id, title, slug, start_at, timezone, host_name, max_guests_total, threshold_80_notified_at, threshold_100_notified_at FROM events WHERE id = ? LIMIT 1')
    .bind(eventId)
    .first<EventRow>()
}

// ── Message handlers ─────────────────────────────────────────────────────────

async function handleGuestConfirmation(rsvpId: string, eventId: string, env: Env): Promise<void> {
  if (await idempotencyAlreadySent(env.DB, rsvpId, 'guest_confirmation')) return

  const rsvp = await fetchRsvp(env.DB, rsvpId)
  if (!rsvp?.email) return // no email, skip

  const event = await fetchEvent(env.DB, eventId)
  if (!event) return

  const payload = buildGuestConfirmationEmail(rsvp, event, BASE_URL)
  await sendEmail(payload, env)
  await markNotificationSent(env.DB, rsvpId, 'guest_confirmation')
}

async function handleAdminAlert(rsvpId: string, eventId: string, env: Env): Promise<void> {
  const adminEmail = env.ADMIN_FROM_EMAIL
  if (!adminEmail) return

  const rsvp = await fetchRsvp(env.DB, rsvpId)
  if (!rsvp) return

  const event = await fetchEvent(env.DB, eventId)
  if (!event) return

  const payload = buildAdminAlertEmail(rsvp, event, adminEmail)
  await sendEmail(payload, env)
}

async function handleCapacityThreshold(
  eventId: string,
  threshold: 80 | 100,
  _currentAttending: number,
  env: Env
): Promise<void> {
  const adminEmail = env.ADMIN_FROM_EMAIL
  if (!adminEmail) return

  const event = await fetchEvent(env.DB, eventId)
  if (!event) return

  if (!shouldNotifyThreshold(event, threshold)) return // already notified

  const payload = buildCapacityThresholdEmail(event, threshold, adminEmail)
  await sendEmail(payload, env)

  // Mark threshold as notified
  const column = threshold === 80 ? 'threshold_80_notified_at' : 'threshold_100_notified_at'
  await env.DB
    .prepare(`UPDATE events SET ${column} = datetime('now') WHERE id = ?`)
    .bind(eventId)
    .run()
}

async function handleSmsConfirmation(rsvpId: string, eventId: string, env: Env): Promise<void> {
  if (await idempotencyAlreadySent(env.DB, rsvpId, 'sms_confirmation')) return

  const rsvp = await fetchRsvp(env.DB, rsvpId)
  if (!rsvp?.phone) return // no phone, skip

  const event = await fetchEvent(env.DB, eventId)
  if (!event) return

  const message = buildSmsMessage(rsvp, event, BASE_URL)
  await sendSms(rsvp.phone, message, env)
  await markNotificationSent(env.DB, rsvpId, 'sms_confirmation')
}

async function handleReminder(rsvpId: string, eventId: string, env: Env): Promise<void> {
  if (await idempotencyAlreadySent(env.DB, rsvpId, 'reminder')) return

  const rsvp = await fetchRsvp(env.DB, rsvpId)
  if (!rsvp?.email) return // no email, skip

  const event = await fetchEvent(env.DB, eventId)
  if (!event) return

  const editLink = `${BASE_URL}/rsvp/${event.slug}?rid=${rsvp.rsvp_token}`
  const dateStr = event.start_at ? new Date(event.start_at).toUTCString() : 'soon'
  const html = `
<p>Hi ${escHtml(rsvp.name)},</p>
<p>This is a reminder that <strong>${escHtml(event.title)}</strong> is coming up on ${dateStr}.</p>
<p>Party size: ${rsvp.party_total}</p>
<p><a href="${editLink}">View or edit your RSVP</a></p>
<p>See you there!</p>
`.trim()
  const text = `Hi ${rsvp.name}, reminder: ${event.title} is on ${dateStr}. Edit your RSVP: ${editLink}`
  const payload: EmailPayload = {
    to: rsvp.email,
    subject: `Reminder: ${event.title}`,
    html,
    text,
  }
  await sendEmail(payload, env)
  await markNotificationSent(env.DB, rsvpId, 'reminder')
}

// ── External API helpers ─────────────────────────────────────────────────────

async function sendEmail(payload: EmailPayload, env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send')
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.ADMIN_FROM_EMAIL ?? 'noreply@rsvpex.app',
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Resend API error ${res.status}: ${text}`)
  }
}

async function sendSms(to: string, message: string, env: Env): Promise<void> {
  const sid = env.TWILIO_ACCOUNT_SID
  const token = env.TWILIO_AUTH_TOKEN
  const from = env.TWILIO_FROM_NUMBER
  if (!sid || !token || !from) {
    console.warn('Twilio secrets not set — skipping SMS send')
    return
  }
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: message }).toString(),
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twilio API error ${res.status}: ${text}`)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
