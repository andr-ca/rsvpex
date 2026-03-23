/**
 * Thank-you page — GET /rsvp/thank-you?rid=<rsvpToken>
 *
 * Looks up the RSVP by token, fetches the event, renders the full
 * confirmation summary with ICS download and edit links.
 *
 * @req PUB-09 — summary, wishlist button, ICS download
 * @req GUEST-01 — dietary entries shown
 * @req GUEST-02 — gift registry button when wishlist_url set
 * @req GUEST-03 — party composition shown
 */
import { Hono } from 'hono'
import { getRsvpByToken } from '../domain/rsvpEdit'

const thankYouRouter = new Hono<{ Bindings: Env }>()

type EventRow = {
  title: string
  start_at: string
  end_at: string | null
  location_text: string | null
  wishlist_url: string | null
  timezone: string
  questions: string
}

thankYouRouter.get('/thank-you', async (c) => {
  const rid = c.req.query('rid')
  if (!rid) return c.html(renderError('Missing RSVP reference.'), 400)

  const rsvp = await getRsvpByToken(c.env.DB, rid)
  if (!rsvp)
    return c.html(
      renderError('RSVP not found. The link may have expired or been revoked.'),
      404,
    )

  const event = await c.env.DB.prepare(
    `SELECT title, start_at, end_at, location_text, wishlist_url, timezone, questions
       FROM events WHERE id = ? LIMIT 1`,
  )
    .bind(rsvp.event_id)
    .first<EventRow>()

  if (!event) return c.html(renderError('Event not found.'), 404)

  return c.html(renderThankYou(rsvp, event))
})

// ── Renderers ─────────────────────────────────────────────────────────────────

type RsvpRow = Awaited<ReturnType<typeof getRsvpByToken>>

function renderThankYou(rsvp: NonNullable<RsvpRow>, event: EventRow): string {
  const dietary: Array<{ kind: string; value: string }> = JSON.parse(rsvp.dietary || '[]')
  const answers: Record<string, unknown> = JSON.parse(rsvp.answers || '{}')
  const questions: Array<{ id: string; label: string; type: string }> = JSON.parse(
    event.questions || '[]',
  )

  const eventDate = new Date(event.start_at).toLocaleDateString('en', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const eventTime = new Date(event.start_at).toLocaleTimeString('en', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const dietaryHtml =
    dietary.length > 0
      ? dietary
          .map(
            (d) =>
              `<li>${escHtml(d.kind)}${d.value ? `: ${escHtml(d.value)}` : ''}</li>`,
          )
          .join('')
      : '<li>None specified</li>'

  const customAnswersHtml =
    questions.length > 0
      ? questions
          .map((q) => {
            const ans = answers[q.id]
            const displayVal = Array.isArray(ans) ? ans.join(', ') : String(ans ?? '—')
            return `<tr><td>${escHtml(q.label)}</td><td>${escHtml(displayVal)}</td></tr>`
          })
          .join('')
      : ''

  return page(
    'Thank You — RSVPex',
    `
    <div class="confirmation-badge">✓ RSVP Confirmed</div>

    <h1>${escHtml(event.title)}</h1>
    <p class="event-meta">${escHtml(eventDate)} at ${escHtml(eventTime)}${event.location_text ? ` · ${escHtml(event.location_text)}` : ''}</p>

    <section class="summary">
      <h2>Your RSVP</h2>
      <table>
        <tr><td>Name</td><td>${escHtml(rsvp.name)}</td></tr>
        ${rsvp.email ? `<tr><td>Email</td><td>${escHtml(rsvp.email)}</td></tr>` : ''}
        ${rsvp.phone ? `<tr><td>Phone</td><td>${escHtml(rsvp.phone)}</td></tr>` : ''}
        <tr><td>Adults</td><td>${rsvp.adults}</td></tr>
        ${rsvp.children_count > 0 ? `<tr><td>Children</td><td>${rsvp.children_count}</td></tr>` : ''}
        ${rsvp.parents_count > 0 ? `<tr><td>Parents / guardians</td><td>${rsvp.parents_count}</td></tr>` : ''}
        ${rsvp.siblings_count > 0 ? `<tr><td>Siblings</td><td>${rsvp.siblings_count}</td></tr>` : ''}
        ${customAnswersHtml}
      </table>

      <h3>Dietary Requirements</h3>
      <ul>${dietaryHtml}</ul>

      ${rsvp.notes ? `<h3>Notes</h3><p>${escHtml(rsvp.notes)}</p>` : ''}
    </section>

    ${
      event.wishlist_url
        ? `
    <div class="action-block">
      <a href="${escHtml(event.wishlist_url)}" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">View Gift Registry</a>
    </div>
    `
        : ''
    }

    <div class="action-row">
      <a href="/rsvp/ics/${escHtml(rsvp.rsvp_token)}" class="btn">Download Calendar</a>
      <a href="?rid=${escHtml(rsvp.rsvp_token)}" class="btn btn-outline">Edit RSVP</a>
    </div>
  `,
  )
}

function renderError(msg: string): string {
  return page('Error — RSVPex', `<h1>Something went wrong</h1><p>${escHtml(msg)}</p>`)
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
    .confirmation-badge { display: inline-block; background: #dcfce7; color: #166534; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem; }
    .event-meta { color: #555; margin-bottom: 1.5rem; }
    .summary { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem; }
    .summary h2 { margin-top: 0; }
    .summary table { width: 100%; border-collapse: collapse; }
    .summary td { padding: 0.35rem 0; vertical-align: top; }
    .summary td:first-child { font-weight: 600; width: 40%; }
    .action-block { margin-bottom: 1rem; }
    .action-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .btn { display: inline-block; padding: 0.65rem 1.5rem; font-size: 1rem; border-radius: 6px; text-decoration: none; font-weight: 500; cursor: pointer; background: #2563eb; color: #fff; border: none; }
    .btn:hover { background: #1d4ed8; }
    .btn-secondary { background: #f3f4f6; color: #111; border: 1px solid #d1d5db; }
    .btn-secondary:hover { background: #e5e7eb; }
    .btn-outline { background: transparent; color: #2563eb; border: 2px solid #2563eb; }
    .btn-outline:hover { background: #eff6ff; }
  </style>
</head>
<body>
${body}
</body>
</html>`
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export default thankYouRouter
