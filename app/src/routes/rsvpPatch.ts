/**
 * RSVP edit submission — PATCH /rsvp/:id
 *
 * Requires `rid` (rsvpToken) in the request body.
 * Validates token matches the RSVP being updated.
 * Redirects to thank-you page on success.
 *
 * Runs the same validation and atomic capacity guard as the public submit
 * path and the admin edit path (C-1 in recommendations.md): the previous
 * implementation called updateRsvp() directly, which bypassed capacity,
 * max_party_size_per_rsvp, the dietary ≤10 cap, children-age bounds, and
 * closes_at entirely — a guest could flip 'maybe' to 'attending' or raise
 * their party size past the event cap with no check at all.
 *
 * @req PUB-10 — PATCH requires rid token; 401 without it
 * @req CAP-01 — capacity enforcement applies to edits too
 * @req CAP-05 — children_ages length must match children_count
 * @req PUB-05 — dietary max 10 entries
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { getRsvpByToken } from '../domain/rsvpEdit'
import { updateRsvpWithCapacityGuard } from '../domain/adminRsvps'
import { parseQuestionDefs, questionFieldName } from '../domain/questions'

const rsvpPatchRouter = new Hono<{ Bindings: Env }>()

// NOTE: dietary_kind[]/dietary_value[] keep the `[]` suffix — see rsvpSubmit.ts for why.
const patchBodySchema = z.object({
  rid: z.string().min(1),
  name: z.string().min(1).max(200),
  email: z.string().email().max(254).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  status: z.enum(['attending', 'not_attending', 'maybe']).optional().default('attending'),
  adults: z.coerce.number().int().min(0).max(50).optional().default(1),
  parents_count: z.coerce.number().int().min(0).max(50).optional().default(0),
  siblings_count: z.coerce.number().int().min(0).max(50).optional().default(0),
  children_count: z.coerce.number().int().min(0).max(50).optional().default(0),
  children_ages: z.string().max(200).optional().default(''),
  'dietary_kind[]': z.union([z.string(), z.array(z.string())]).optional(),
  'dietary_value[]': z.union([z.string(), z.array(z.string())]).optional(),
  notes: z.string().max(2000).optional().nullable(),
})

type EventRow = {
  id: string
  max_party_size_per_rsvp: number
  closes_at: string | null
  is_kids_event: number
  questions: string
}

rsvpPatchRouter.patch('/:id', async (c) => {
  const rsvpId = c.req.param('id')
  const rawBody = await c.req.parseBody()

  // ── Early auth check: rid must be present ─────────────────────────────────
  if (!rawBody['rid']) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const parsed = patchBodySchema.safeParse(rawBody)

  if (!parsed.success) {
    return c.json({ error: 'validation_failed', issues: parsed.error.issues }, 400)
  }

  const body = parsed.data

  // ── Token validation ───────────────────────────────────────────────────────
  const rsvp = await getRsvpByToken(c.env.DB, body.rid)
  if (!rsvp || rsvp.id !== rsvpId) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const event = await c.env.DB.prepare(
    `SELECT id, max_party_size_per_rsvp, closes_at, is_kids_event, questions
       FROM events WHERE id = ? LIMIT 1`,
  )
    .bind(rsvp.event_id)
    .first<EventRow>()
  if (!event) {
    return c.json({ error: 'event_not_found' }, 404)
  }

  // ── Time-window check: guests shouldn't be able to edit after RSVPs close ──
  const now = new Date().toISOString()
  if (event.closes_at && event.closes_at < now) {
    return c.json({ error: 'rsvp_closed' }, 409)
  }

  // ── Dietary ───────────────────────────────────────────────────────────────
  const dietaryKindRaw = body['dietary_kind[]']
  const dietaryValueRaw = body['dietary_value[]']
  const dietaryKinds = Array.isArray(dietaryKindRaw)
    ? dietaryKindRaw
    : dietaryKindRaw
      ? [dietaryKindRaw]
      : []
  const dietaryValues = Array.isArray(dietaryValueRaw)
    ? dietaryValueRaw
    : dietaryValueRaw
      ? [dietaryValueRaw]
      : []

  if (dietaryKinds.length > 10) {
    return c.json(
      { error: 'validation_failed', issues: [{ message: 'Maximum 10 dietary entries allowed' }] },
      400,
    )
  }

  const dietary = dietaryKinds
    .map((kind, i) => ({ kind: kind || '', value: dietaryValues[i] || '' }))
    .filter((d) => d.kind)

  // ── Children ages ─────────────────────────────────────────────────────────
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
        {
          error: 'validation_failed',
          issues: [{ message: 'children_ages count does not match children_count' }],
        },
        400,
      )
    }
    childrenAgesJson = JSON.stringify(agesParsed)
  }

  // ── Party-size cap per RSVP ────────────────────────────────────────────
  const totalParty = body.adults + body.parents_count + body.siblings_count + body.children_count
  if (totalParty > event.max_party_size_per_rsvp) {
    return c.json(
      {
        error: 'validation_failed',
        issues: [{ message: `Party size exceeds the maximum of ${event.max_party_size_per_rsvp}` }],
      },
      400,
    )
  }

  // ── Custom question answers ───────────────────────────────────────────────
  const questionDefs = parseQuestionDefs(event.questions)

  const answers: Record<string, string | string[]> = {}
  for (const q of questionDefs) {
    const fieldName = questionFieldName(q)
    const raw = rawBody[fieldName]
    if (q.type === 'multi_select') {
      answers[q.id] = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : []
    } else {
      const v = Array.isArray(raw) ? raw[0] : raw ? String(raw) : undefined
      if (v !== undefined) answers[q.id] = v
    }
  }

  // ── Atomic update + capacity guard (same function admin edits use) ─────────
  let result: Awaited<ReturnType<typeof updateRsvpWithCapacityGuard>>
  try {
    result = await updateRsvpWithCapacityGuard(c.env.DB, rsvpId, {
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      adults: body.adults,
      parentsCount: body.parents_count,
      siblingsCount: body.siblings_count,
      childrenCount: body.children_count,
      childrenAges: childrenAgesJson,
      dietary: JSON.stringify(dietary),
      notes: body.notes ?? null,
      answers: JSON.stringify(answers),
      status: body.status,
    })
  } catch (err) {
    // Editing to an email/phone that collides with another RSVP for this event
    // hits the partial unique index (C-4 in recommendations.md) — surface it as
    // a normal validation error instead of a 500.
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('UNIQUE constraint failed')) {
      return c.json(
        {
          error: 'validation_failed',
          issues: [{ message: 'Another RSVP for this event already uses that email or phone.' }],
        },
        409,
      )
    }
    throw err
  }

  if (!result.success) {
    return c.json(
      { error: 'capacity_exceeded', current: result.current, capacity: result.capacity },
      409,
    )
  }

  return c.redirect(`/rsvp/thank-you?rid=${body.rid}`, 303)
})

export default rsvpPatchRouter
