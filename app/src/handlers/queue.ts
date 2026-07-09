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

// Fallback only for local dev / tests where DEPLOYMENT_DOMAIN isn't configured.
// Production deploys must set DEPLOYMENT_DOMAIN — see wrangler.jsonc.
const FALLBACK_BASE_URL = 'http://localhost:8787'

export async function handleQueue(
  batch: MessageBatch<NotificationMessage>,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  const baseUrl = env.DEPLOYMENT_DOMAIN ?? FALLBACK_BASE_URL
  for (const msg of batch.messages) {
    try {
      await processMessage(msg.body, env, baseUrl)
      msg.ack()
    } catch (err) {
      const attempt = msg.attempts ?? 1
      console.error('Queue message failed:', JSON.stringify(msg.body), String(err))
      // Exponential backoff, capped at 1 hour — see C-9 in recommendations.md.
      msg.retry({ delaySeconds: Math.min(2 ** attempt * 30, 3600) })
    }
  }
}

async function processMessage(body: NotificationMessage, env: Env, baseUrl: string): Promise<void> {
  switch (body.type) {
    case 'guest_confirmation':
      await handleGuestConfirmation(body.rsvpId, body.eventId, env, baseUrl)
      break
    case 'admin_alert':
      await handleAdminAlert(body.rsvpId, body.eventId, env)
      break
    case 'capacity_threshold':
      await handleCapacityThreshold(body.eventId, body.threshold, env)
      break
    case 'sms_confirmation':
      await handleSmsConfirmation(body.rsvpId, body.eventId, env, baseUrl)
      break
    case 'reminder':
      await handleReminder(body.rsvpId, body.eventId, env, baseUrl)
      break
    default:
      console.warn('Unknown notification type:', (body as { type: string }).type)
  }
}

// ── D1 fetch helpers ─────────────────────────────────────────────────────────

async function fetchRsvp(db: D1Database, rsvpId: string): Promise<RsvpRow | null> {
  return db
    .prepare(
      'SELECT id, name, email, phone, status, adults, party_total, dietary, notes, rsvp_token FROM rsvps WHERE id = ? LIMIT 1',
    )
    .bind(rsvpId)
    .first<RsvpRow>()
}

async function fetchEvent(db: D1Database, eventId: string): Promise<EventRow | null> {
  return db
    .prepare(
      'SELECT id, title, slug, start_at, timezone, host_name, max_guests_total, threshold_80_notified_at, threshold_100_notified_at FROM events WHERE id = ? LIMIT 1',
    )
    .bind(eventId)
    .first<EventRow>()
}

// ── Message handlers ─────────────────────────────────────────────────────────

async function handleGuestConfirmation(
  rsvpId: string,
  eventId: string,
  env: Env,
  baseUrl: string,
): Promise<void> {
  if (await idempotencyAlreadySent(env.DB, rsvpId, 'guest_confirmation')) return

  const rsvp = await fetchRsvp(env.DB, rsvpId)
  if (!rsvp?.email) return // no email, skip

  const event = await fetchEvent(env.DB, eventId)
  if (!event) return

  const payload = buildGuestConfirmationEmail(rsvp, event, baseUrl)
  await sendEmail(payload, env)
  await markNotificationSent(env.DB, rsvpId, 'guest_confirmation')
}

async function handleAdminAlert(rsvpId: string, eventId: string, env: Env): Promise<void> {
  // Idempotency guard (C-7 in recommendations.md): without this, a queue retry
  // after a later message in the same batch fails resends the admin alert.
  if (await idempotencyAlreadySent(env.DB, rsvpId, 'admin_alert')) return

  const adminEmail = env.ADMIN_FROM_EMAIL
  if (!adminEmail) return

  const rsvp = await fetchRsvp(env.DB, rsvpId)
  if (!rsvp) return

  const event = await fetchEvent(env.DB, eventId)
  if (!event) return

  const payload = buildAdminAlertEmail(rsvp, event, adminEmail)
  await sendEmail(payload, env)
  await markNotificationSent(env.DB, rsvpId, 'admin_alert')
}

async function handleCapacityThreshold(
  eventId: string,
  threshold: 80 | 100,
  env: Env,
): Promise<void> {
  const adminEmail = env.ADMIN_FROM_EMAIL
  if (!adminEmail) return

  const event = await fetchEvent(env.DB, eventId)
  if (!event) return

  if (!shouldNotifyThreshold(event, threshold)) return // already notified

  // Atomic claim BEFORE sending (C-7): two concurrent deliveries for the same
  // threshold both passing the read-check above would otherwise both send the
  // email. The conditional UPDATE means only one delivery can claim the row;
  // the loser returns without sending. Trade-off: if sendEmail throws after a
  // successful claim, this specific threshold email is not retried (the claim
  // already marks it notified) — acceptable for a non-critical admin heads-up
  // where "at most once" is preferable to duplicate alerts.
  const column = threshold === 80 ? 'threshold_80_notified_at' : 'threshold_100_notified_at'
  const claim = await env.DB.prepare(
    `UPDATE events SET ${column} = datetime('now') WHERE id = ? AND ${column} IS NULL`,
  )
    .bind(eventId)
    .run()
  if (claim.meta.changes === 0) return // another delivery already claimed it

  const payload = buildCapacityThresholdEmail(event, threshold, adminEmail)
  await sendEmail(payload, env)
}

async function handleSmsConfirmation(
  rsvpId: string,
  eventId: string,
  env: Env,
  baseUrl: string,
): Promise<void> {
  if (await idempotencyAlreadySent(env.DB, rsvpId, 'sms_confirmation')) return

  const rsvp = await fetchRsvp(env.DB, rsvpId)
  if (!rsvp?.phone) return // no phone, skip

  const event = await fetchEvent(env.DB, eventId)
  if (!event) return

  const message = buildSmsMessage(rsvp, event, baseUrl)
  await sendSms(rsvp.phone, message, env)
  await markNotificationSent(env.DB, rsvpId, 'sms_confirmation')
}

async function handleReminder(
  rsvpId: string,
  eventId: string,
  env: Env,
  baseUrl: string,
): Promise<void> {
  // Dedupe key includes today's date (C-11): without it, notification_log's
  // UNIQUE(rsvp_id, notification_type) means an RSVP could never receive a
  // second reminder even if the event were postponed and re-scheduled.
  const todayKey = `reminder:${new Date().toISOString().slice(0, 10)}`
  if (await idempotencyAlreadySent(env.DB, rsvpId, todayKey)) return

  const rsvp = await fetchRsvp(env.DB, rsvpId)
  if (!rsvp?.email) return // no email, skip

  const event = await fetchEvent(env.DB, eventId)
  if (!event) return

  const editLink = `${baseUrl}/rsvp/${event.slug}?rid=${rsvp.rsvp_token}`
  // start_at is stored as true UTC (C-5 in recommendations.md); format in the
  // event's own timezone so the guest sees the time the host actually meant,
  // not a UTC instant with no offset context (toUTCString() previously).
  const dateStr = event.start_at
    ? new Date(event.start_at).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: event.timezone,
      })
    : 'soon'
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
  await markNotificationSent(env.DB, rsvpId, todayKey)
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
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: message }).toString(),
  })
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
