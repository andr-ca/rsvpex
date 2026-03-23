/**
 * ICS calendar download — GET /rsvp/ics/:rsvpToken
 *
 * Authenticated by rsvpToken (no session required).
 * Guests receive this link on the thank-you page and in confirmation emails.
 *
 * @req PUB-09 — ICS download
 * @req GAP-01 — VTIMEZONE included; RFC 5545 compliant
 */
import { Hono } from 'hono'
import { getRsvpByToken } from '../domain/rsvpEdit'
import { generateIcs } from '../domain/ics'

const icsRouter = new Hono<{ Bindings: Env }>()

type EventRow = {
  id: string
  title: string
  start_at: string
  end_at: string | null
  timezone: string
  location_text: string | null
}

icsRouter.get('/ics/:rsvpToken', async (c) => {
  const token = c.req.param('rsvpToken')

  const rsvp = await getRsvpByToken(c.env.DB, token)
  if (!rsvp) {
    return c.json({ error: 'not_found' }, 404)
  }

  const event = await c.env.DB.prepare(
    `SELECT id, title, start_at, end_at, timezone, location_text
       FROM events WHERE id = ? LIMIT 1`,
  )
    .bind(rsvp.event_id)
    .first<EventRow>()

  if (!event) {
    return c.json({ error: 'not_found' }, 404)
  }

  const dietary: Array<{ kind: string; value: string }> = JSON.parse(rsvp.dietary || '[]')

  const icsString = generateIcs({
    rsvpId: rsvp.id,
    eventTitle: event.title,
    eventStartAt: event.start_at,
    eventEndAt: event.end_at,
    eventTimezone: event.timezone,
    locationText: event.location_text,
    guestName: rsvp.name,
    adults: rsvp.adults,
    childrenCount: rsvp.children_count,
    dietary,
  })

  return new Response(icsString, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="event.ics"',
      'Cache-Control': 'no-store',
    },
  })
})

export default icsRouter
