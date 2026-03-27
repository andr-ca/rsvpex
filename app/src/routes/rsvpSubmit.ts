/**
 * RSVP submission — POST /rsvp/:slug
 *
 * Middleware chain: turnstileVerify() → rsvpRateLimit() → handler
 *
 * @req PUB-03 — kids-mode fields (children_count, children_ages, siblings, parents)
 * @req PUB-04 — standard fields (name, email/phone, adults, status, dietary, notes)
 * @req PUB-05 — dietary max 10 entries
 * @req CAP-01 — capacity enforcement via checkAndInsertRsvp
 * @req CAP-04 — optional heuristic duplicate check
 * @req CAP-05 — children_ages length must match children_count
 * @req GAP-02 — 409 with action:resend_edit_link when duplicate detected
 * @req NOTIF-01 — guest confirmation email queued after successful RSVP
 * @req NOTIF-02 — admin new-RSVP alert queued after successful RSVP
 * @req NOTIF-03 — capacity threshold check queued after successful RSVP
 * @req NOTIF-05 — SMS confirmation queued when event has SMS enabled
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { turnstileVerify } from '../middleware/turnstile'
import { rsvpRateLimit } from '../middleware/rateLimit'
import { checkAndInsertRsvp } from '../domain/capacity'
import { isDuplicate, isHeuristicDuplicate } from '../domain/duplicates'
import { generateToken, generateIpHash } from '../domain/tokens'
import { currentThreshold } from '../domain/notifications'
import type { NotificationMessage } from '../handlers/queue'

// ── Zod schema for RSVP form submission ───────────────────────────────────────

const rsvpBodySchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(254).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  status: z
    .enum(['attending', 'not_attending', 'maybe'])
    .optional()
    .default('attending'),
  adults: z.coerce.number().int().min(0).max(50).optional().default(1),
  parents_count: z.coerce.number().int().min(0).max(50).optional().default(0),
  siblings_count: z.coerce.number().int().min(0).max(50).optional().default(0),
  children_count: z.coerce.number().int().min(0).max(50).optional().default(0),
  children_ages: z.string().max(200).optional().default(''),
  dietary_kind: z.union([z.string(), z.array(z.string())]).optional(),
  dietary_value: z.union([z.string(), z.array(z.string())]).optional(),
  notes: z.string().max(2000).optional().nullable(),
  client_submitted_at: z.string().optional().nullable(),
  t: z.string().optional().nullable(), // access token passthrough
})

type EventRow = {
  id: string
  slug: string
  title: string
  visibility: 'public' | 'unlisted' | 'private'
  access_token: string | null
  access_token_expires_at: string | null
  opens_at: string | null
  closes_at: string | null
  status: 'draft' | 'published' | 'closed' | 'archived'
  is_kids_event: number
  max_guests_total: number | null
  max_party_size_per_rsvp: number
  enable_waitlist: number
  enable_heuristic_dup_check: number
  allow_status_choice: number
  notify_via_email: number
  notify_via_sms: number
  questions: string // JSON array
}

const rsvpSubmitRouter = new Hono<{ Bindings: Env }>()

rsvpSubmitRouter.post(
  '/:slug',
  turnstileVerify(),
  rsvpRateLimit(),
  async (c) => {
    const slug = c.req.param('slug')
    const now = new Date().toISOString()

    // ── Load event ─────────────────────────────────────────────────────────
    const event = await c.env.DB.prepare(
      `SELECT id, slug, title, visibility, access_token, access_token_expires_at,
              opens_at, closes_at, status, is_kids_event, max_guests_total,
              max_party_size_per_rsvp, enable_waitlist, enable_heuristic_dup_check,
              allow_status_choice, notify_via_email, notify_via_sms, questions
         FROM events
        WHERE slug = ?
          AND status = 'published'
        LIMIT 1`,
    )
      .bind(slug)
      .first<EventRow>()

    if (!event) {
      return c.json({ error: 'event_not_found' }, 404)
    }

    // ── Parse and validate body ────────────────────────────────────────────
    const rawBody = await c.req.parseBody()
    const parsed = rsvpBodySchema.safeParse(rawBody)

    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: parsed.error.issues }, 400)
    }

    const body = parsed.data

    // ── Visibility check ───────────────────────────────────────────────────
    if (event.visibility === 'private') {
      const t = body.t
      if (!t || t !== event.access_token) {
        return c.json({ error: 'access_denied' }, 403)
      }
      if (event.access_token_expires_at && event.access_token_expires_at < now) {
        return c.json({ error: 'link_expired' }, 403)
      }
    }

    // ── Time-window check ──────────────────────────────────────────────────
    if (event.opens_at && event.opens_at > now) {
      return c.json({ error: 'rsvp_not_open' }, 409)
    }
    if (event.closes_at && event.closes_at < now) {
      return c.json({ error: 'rsvp_closed' }, 409)
    }

    // ── Contact validation: at least one of email or phone required ────────
    const email = body.email || null
    const phone = body.phone || null
    if (!email && !phone) {
      return c.json({ error: 'validation_failed', issues: [{ message: 'Email or phone is required' }] }, 400)
    }

    // ── CAP-05: children_ages length must match children_count ─────────────
    let childrenAgesJson = '[]'
    if (event.is_kids_event && body.children_count > 0 && body.children_ages) {
      const agesParsed = body.children_ages
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => !isNaN(n) && n >= 0 && n <= 18)

      if (agesParsed.length !== body.children_count) {
        return c.json(
          { error: 'validation_failed', issues: [{ message: 'children_ages count does not match children_count' }] },
          400,
        )
      }
      childrenAgesJson = JSON.stringify(agesParsed)
    }

    // ── PUB-05: dietary max 10 entries ─────────────────────────────────────
    const dietaryKinds = Array.isArray(body.dietary_kind)
      ? body.dietary_kind
      : body.dietary_kind
      ? [body.dietary_kind]
      : []
    const dietaryValues = Array.isArray(body.dietary_value)
      ? body.dietary_value
      : body.dietary_value
      ? [body.dietary_value]
      : []

    if (dietaryKinds.length > 10) {
      return c.json({ error: 'validation_failed', issues: [{ message: 'Maximum 10 dietary entries allowed' }] }, 400)
    }

    const dietary = dietaryKinds
      .map((kind, i) => ({ kind: kind || '', value: dietaryValues[i] || '' }))
      .filter((d) => d.kind)
    const dietaryJson = JSON.stringify(dietary)

    // ── GUEST-04: custom question answers ─────────────────────────────────
    const questionDefs: Array<{
      id: string
      type: 'short_text' | 'long_text' | 'boolean' | 'single_select' | 'multi_select'
      label: string
      required?: boolean
      options?: string[]
    }> = JSON.parse(event.questions || '[]')

    const answers: Record<string, string | string[]> = {}
    const answerErrors: string[] = []

    for (const q of questionDefs) {
      const fieldName = `answer_${q.id}`
      const rawValues = rawBody[fieldName]

      let value: string | string[] | undefined

      if (q.type === 'multi_select') {
        value = Array.isArray(rawValues)
          ? rawValues.map(String)
          : rawValues
          ? [String(rawValues)]
          : []
      } else {
        value = Array.isArray(rawValues) ? rawValues[0] : rawValues ? String(rawValues) : undefined
      }

      // Required validation (D-12)
      if (q.required) {
        const isEmpty =
          value === undefined ||
          value === '' ||
          (Array.isArray(value) && value.length === 0)
        if (isEmpty) {
          answerErrors.push(`"${q.label}" is required`)
        }
      }

      if (value !== undefined) {
        answers[q.id] = value
      }
    }

    if (answerErrors.length > 0) {
      return c.json(
        { error: 'validation_failed', issues: answerErrors.map((message) => ({ message })) },
        400,
      )
    }

    const answersJson = JSON.stringify(answers)

    // ── Party-size cap per RSVP ────────────────────────────────────────────
    const totalParty =
      body.adults + body.parents_count + body.siblings_count + body.children_count

    if (totalParty > event.max_party_size_per_rsvp) {
      return c.json(
        { error: 'validation_failed', issues: [{ message: `Party size exceeds the maximum of ${event.max_party_size_per_rsvp}` }] },
        400,
      )
    }

    // ── Exact duplicate check ──────────────────────────────────────────────
    const dupResult = await isDuplicate(c.env.DB, event.id, email, phone)
    if (dupResult.isDuplicate) {
      return c.json(
        { error: 'already_rsvped', action: 'resend_edit_link', rsvpToken: dupResult.rsvpToken },
        409,
      )
    }

    // ── Heuristic duplicate check (optional, per event) ───────────────────
    if (event.enable_heuristic_dup_check) {
      const heuristic = await isHeuristicDuplicate(c.env.DB, event.id, body.name, email, phone)
      if (heuristic.isDuplicate) {
        return c.json(
          { error: 'already_rsvped', action: 'resend_edit_link', rsvpToken: heuristic.rsvpToken },
          409,
        )
      }
    }

    // ── Determine RSVP status ──────────────────────────────────────────────
    const rsvpStatus: 'attending' | 'not_attending' | 'maybe' = event.allow_status_choice
      ? (body.status as 'attending' | 'not_attending' | 'maybe')
      : 'attending'

    // ── IP hashing ────────────────────────────────────────────────────────
    const rawIp =
      c.req.raw.headers.get('CF-Connecting-IP') ??
      c.req.raw.headers.get('X-Forwarded-For') ??
      null
    const ipHash = rawIp ? await generateIpHash(rawIp) : null
    const userAgent = c.req.raw.headers.get('User-Agent') ?? null

    // ── Atomic capacity check + insert ────────────────────────────────────
    const rsvpId = crypto.randomUUID()
    const rsvpToken = generateToken()

    const result = await checkAndInsertRsvp(c.env.DB, event.id, {
      id: rsvpId,
      eventId: event.id,
      name: body.name,
      email,
      phone,
      adults: body.adults,
      parentsCount: body.parents_count,
      siblingsCount: body.siblings_count,
      childrenCount: body.children_count,
      childrenAges: childrenAgesJson,
      dietary: dietaryJson,
      notes: body.notes ?? null,
      answers: answersJson,
      status: rsvpStatus,
      rsvpToken,
      ipHash,
      userAgent,
      clientSubmittedAt: body.client_submitted_at ?? null,
    })

    // ── Capacity full ──────────────────────────────────────────────────────
    if (!result.success) {
      return c.html(renderCapacityFull(event.title), 409)
    }

    // ── Success: queue notifications via waitUntil ─────────────────────────
    const msgs: NotificationMessage[] = []

    // Guest confirmation email (if event has email notifications enabled and guest has email)
    if (event.notify_via_email && email) {
      msgs.push({ type: 'guest_confirmation', rsvpId, eventId: event.id })
    }

    // Admin alert email
    msgs.push({ type: 'admin_alert', rsvpId, eventId: event.id })

    // SMS confirmation (if event has SMS enabled and guest has phone)
    if (event.notify_via_sms && phone) {
      msgs.push({ type: 'sms_confirmation', rsvpId, eventId: event.id })
    }

    // Capacity threshold check
    if (event.max_guests_total) {
      const stats = await c.env.DB
        .prepare(
          "SELECT COALESCE(SUM(party_total), 0) as attending FROM rsvps WHERE event_id = ? AND status = 'attending'"
        )
        .bind(event.id)
        .first<{ attending: number }>()
      const attending = stats?.attending ?? 0
      const threshold = currentThreshold(attending, event.max_guests_total)
      if (threshold) {
        msgs.push({ type: 'capacity_threshold', eventId: event.id, threshold, currentAttending: attending })
      }
    }

    if (msgs.length > 0) {
      c.executionCtx.waitUntil(
        c.env.NOTIFICATIONS_QUEUE.sendBatch(msgs.map((body) => ({ body })))
      )
    }

    // ── Redirect to thank-you page ────────────────────────────────────────
    return c.redirect(`/rsvp/thank-you?rid=${result.rsvpToken}`, 303)
  },
)

// ── HTML renderer for capacity-full state ─────────────────────────────────────

function renderCapacityFull(title: string): string {
  const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Event Full — RSVPex</title>
  <style>body{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem}</style>
</head>
<body>
  <h1>${escaped}</h1>
  <p>We're sorry — this event has reached its maximum capacity and no waitlist is available.</p>
  <p>Please contact the host directly if you believe this is an error.</p>
</body>
</html>`
}

export default rsvpSubmitRouter
