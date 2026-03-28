/**
 * RSVP edit submission — PATCH /rsvp/:id
 *
 * Requires `rid` (rsvpToken) in the request body.
 * Validates token matches the RSVP being updated.
 * Redirects to thank-you page on success.
 *
 * @req PUB-10 — PATCH requires rid token; 401 without it
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { getRsvpByToken, updateRsvp } from '../domain/rsvpEdit'

const rsvpPatchRouter = new Hono<{ Bindings: Env }>()

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
  dietary_kind: z.union([z.string(), z.array(z.string())]).optional(),
  dietary_value: z.union([z.string(), z.array(z.string())]).optional(),
  notes: z.string().max(2000).optional().nullable(),
})

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

  // ── Dietary ───────────────────────────────────────────────────────────────
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
  const dietary = dietaryKinds
    .map((kind, i) => ({ kind: kind || '', value: dietaryValues[i] || '' }))
    .filter((d) => d.kind)

  // ── Children ages ─────────────────────────────────────────────────────────
  let childrenAgesJson = '[]'
  if (body.children_count > 0 && body.children_ages) {
    const ages = body.children_ages
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => !isNaN(n))
    childrenAgesJson = JSON.stringify(ages)
  }

  // ── Custom question answers ───────────────────────────────────────────────
  const event = await c.env.DB.prepare('SELECT questions FROM events WHERE id = ? LIMIT 1')
    .bind(rsvp.event_id)
    .first<{ questions: string }>()
  const questionDefs: Array<{ id: string; type: string; label: string; required?: boolean }> =
    JSON.parse(event?.questions || '[]')

  const answers: Record<string, string | string[]> = {}
  for (const q of questionDefs) {
    const fieldName = `answer_${q.id}`
    const raw = rawBody[fieldName]
    if (q.type === 'multi_select') {
      answers[q.id] = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : []
    } else {
      const v = Array.isArray(raw) ? raw[0] : raw ? String(raw) : undefined
      if (v !== undefined) answers[q.id] = v
    }
  }

  await updateRsvp(c.env.DB, rsvpId, {
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

  return c.redirect(`/rsvp/thank-you?rid=${body.rid}`, 303)
})

export default rsvpPatchRouter
