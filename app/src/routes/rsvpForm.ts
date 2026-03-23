/**
 * Public RSVP form — GET /rsvp/:slug
 *
 * Handles all pre-render visibility and time-window checks before
 * rendering the HTML form. All server-rendered; no client-side framework.
 *
 * @req PUB-01 — event lookup by slug
 * @req PUB-02 — render form with all standard fields
 * @req PUB-06 — private events require valid ?t= access token
 * @req PUB-07 — time-window enforcement (opens_at / closes_at)
 * @req PUB-08 — kids-event mode toggles child-specific fields
 * @req GAP-06 — expired access token returns 403 with clear message
 */

import { Hono } from 'hono'
import { getRsvpByToken } from '../domain/rsvpEdit'

const rsvpFormRouter = new Hono<{ Bindings: Env }>()

type EventRow = {
  id: string
  title: string
  host_name: string | null
  description_html: string | null
  slug: string
  visibility: 'public' | 'unlisted' | 'private'
  access_token: string | null
  access_token_expires_at: string | null
  opens_at: string | null
  closes_at: string | null
  status: 'draft' | 'published' | 'closed' | 'archived'
  is_kids_event: number
  allow_children: number
  allow_siblings: number
  allow_parents: number
  allow_status_choice: number
  max_party_size_per_rsvp: number
  locale: string
  start_at: string
  location_text: string | null
}

type RsvpEditRow = {
  id: string
  event_id: string
  name: string
  email: string | null
  phone: string | null
  adults: number
  parents_count: number
  siblings_count: number
  children_count: number
  dietary: string
  notes: string | null
  answers: string
  status: string
  rsvp_token: string
}

rsvpFormRouter.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  const accessToken = c.req.query('t') ?? null

  const event = await c.env.DB.prepare(
    `SELECT id, title, host_name, description_html, slug, visibility,
            access_token, access_token_expires_at, opens_at, closes_at,
            status, is_kids_event, allow_children, allow_siblings,
            allow_parents, allow_status_choice, max_party_size_per_rsvp,
            locale, start_at, location_text
       FROM events
      WHERE slug = ?
        AND status = 'published'
      LIMIT 1`,
  )
    .bind(slug)
    .first<EventRow>()

  if (!event) {
    return c.html(renderNotFound(), 404)
  }

  const now = new Date().toISOString()

  // ── Visibility check ──────────────────────────────────────────────────────
  if (event.visibility === 'private') {
    if (!accessToken || accessToken !== event.access_token) {
      return c.html(renderAccessDenied(event.title), 403)
    }
    // GAP-06: expired token
    if (event.access_token_expires_at && event.access_token_expires_at < now) {
      return c.html(renderLinkExpired(event.title), 403)
    }
  }

  // ── Time-window check ─────────────────────────────────────────────────────
  if (event.opens_at && event.opens_at > now) {
    return c.html(renderNotOpenYet(event), 200)
  }

  if (event.closes_at && event.closes_at < now) {
    return c.html(renderClosed(event.title), 410)
  }

  // ── Happy path: render form ───────────────────────────────────────────────
  // ── Edit mode: prefill form from rid token ───────────────────────────────
  const rid = c.req.query('rid') ?? null
  if (rid) {
    const rsvp = await getRsvpByToken(c.env.DB, rid)
    if (!rsvp || rsvp.event_id !== event.id) {
      return c.html(renderInvalidEditLink(), 403)
    }
    return c.html(renderEditForm(event, rsvp as RsvpEditRow, rid))
  }

  // ── New RSVP: render blank form ───────────────────────────────────────────
  return c.html(renderForm(event, accessToken))
})

// ── HTML renderers ────────────────────────────────────────────────────────────

function renderInvalidEditLink(): string {
  return page(
    'Edit Link Invalid',
    `<h1>Edit Link No Longer Valid</h1>
     <p>This edit link is no longer valid. Contact the host for a new link.</p>`,
  )
}

function renderEditForm(event: EventRow, rsvp: RsvpEditRow, rid: string): string {
  const dietary: Array<{ kind: string; value: string }> = JSON.parse(rsvp.dietary || '[]')
  const firstDietary = dietary[0] ?? null

  return page(
    event.title,
    `
    <div class="edit-banner">Editing your RSVP</div>
    <h1>${escHtml(event.title)}</h1>

    <form method="POST" action="/rsvp/${escHtml(rsvp.id)}" id="rsvp-form">
      <input type="hidden" name="_method" value="PATCH">
      <input type="hidden" name="rid" value="${escHtml(rid)}">

      <fieldset>
        <legend>Your Details</legend>
        <label for="name">Full Name *</label>
        <input id="name" name="name" type="text" required autocomplete="name" maxlength="200"
               value="${escHtml(rsvp.name)}">

        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" maxlength="254"
               value="${escHtml(rsvp.email ?? '')}">

        <label for="phone">Phone</label>
        <input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="30"
               value="${escHtml(rsvp.phone ?? '')}">
      </fieldset>

      <fieldset>
        <legend>Your Party</legend>
        <label for="adults">Adults *</label>
        <input id="adults" name="adults" type="number" min="0" max="${event.max_party_size_per_rsvp}"
               value="${rsvp.adults}" required>
      </fieldset>

      ${
        event.allow_status_choice
          ? `
      <fieldset>
        <legend>Attendance</legend>
        <label><input type="radio" name="status" value="attending" ${rsvp.status === 'attending' ? 'checked' : ''}> Yes, I'll be there</label>
        <label><input type="radio" name="status" value="maybe" ${rsvp.status === 'maybe' ? 'checked' : ''}> Maybe</label>
        <label><input type="radio" name="status" value="not_attending" ${rsvp.status === 'not_attending' ? 'checked' : ''}> Sorry, can't make it</label>
      </fieldset>
      `
          : ''
      }

      <fieldset>
        <legend>Dietary Requirements</legend>
        <div class="dietary-row">
          <select name="dietary_kind[]">
            <option value="">Select...</option>
            ${['vegetarian', 'vegan', 'gluten_free', 'halal', 'kosher', 'nut_allergy', 'dairy_free', 'other']
              .map(
                (k) =>
                  `<option value="${k}" ${firstDietary?.kind === k ? 'selected' : ''}>${k}</option>`,
              )
              .join('')}
          </select>
          <input type="text" name="dietary_value[]" placeholder="Details (optional)"
                 value="${escHtml(firstDietary?.value ?? '')}">
        </div>
      </fieldset>

      <fieldset>
        <legend>Anything Else?</legend>
        <label for="notes">Notes</label>
        <textarea id="notes" name="notes" rows="3" maxlength="2000">${escHtml(rsvp.notes ?? '')}</textarea>
      </fieldset>

      <button type="submit">Save Changes</button>
    </form>
  `,
  )
}

function renderNotFound(): string {
  return page('Event Not Found', `<h1>Event Not Found</h1><p>This event doesn't exist or is no longer available.</p>`)
}

function renderAccessDenied(title: string): string {
  return page('Access Denied', `
    <h1>${escHtml(title)}</h1>
    <p>This event is private. Please use the personalised link you received to access this RSVP form.</p>
  `)
}

function renderLinkExpired(title: string): string {
  return page('Link Expired', `
    <h1>${escHtml(title)}</h1>
    <p>Your invitation link has expired. Please contact the host for a new link.</p>
  `)
}

function renderNotOpenYet(event: EventRow): string {
  const opensDate = event.opens_at ? new Date(event.opens_at).toLocaleDateString('en', { dateStyle: 'long' }) : ''
  return page(event.title, `
    <h1>${escHtml(event.title)}</h1>
    <p>RSVPs are not open yet.</p>
    ${opensDate ? `<p>Opening on <strong>${escHtml(opensDate)}</strong>.</p>` : ''}
  `)
}

function renderClosed(title: string): string {
  return page('RSVP Closed', `
    <h1>${escHtml(title)}</h1>
    <p>RSVPs for this event are now closed.</p>
  `)
}

function renderForm(event: EventRow, accessToken: string | null): string {
  const isKids = Boolean(event.is_kids_event)
  const allowStatusChoice = Boolean(event.allow_status_choice)
  const maxParty = event.max_party_size_per_rsvp

  return page(event.title, `
    <h1>${escHtml(event.title)}</h1>
    ${event.host_name ? `<p class="host">Hosted by ${escHtml(event.host_name)}</p>` : ''}
    ${event.location_text ? `<p class="location">${escHtml(event.location_text)}</p>` : ''}
    ${event.description_html ?? ''}

    <form method="POST" action="/rsvp/${escHtml(event.slug)}" id="rsvp-form">
      ${accessToken ? `<input type="hidden" name="t" value="${escHtml(accessToken)}">` : ''}

      <fieldset>
        <legend>Your Details</legend>

        <label for="name">Full Name *</label>
        <input id="name" name="name" type="text" required autocomplete="name" maxlength="200">

        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" maxlength="254">

        <label for="phone">Phone (optional if email provided)</label>
        <input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="30">
      </fieldset>

      <fieldset>
        <legend>Your Party</legend>

        ${isKids ? renderKidsPartyFields(event) : renderStandardPartyFields(event, maxParty)}
      </fieldset>

      ${allowStatusChoice ? renderStatusChoice() : ''}

      <fieldset>
        <legend>Dietary Requirements</legend>
        <p>Add up to 10 entries (one per line).</p>
        <div id="dietary-container">
          <div class="dietary-row">
            <select name="dietary_kind[]">
              <option value="">Select...</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="vegan">Vegan</option>
              <option value="gluten_free">Gluten-free</option>
              <option value="halal">Halal</option>
              <option value="kosher">Kosher</option>
              <option value="nut_allergy">Nut allergy</option>
              <option value="dairy_free">Dairy-free</option>
              <option value="other">Other</option>
            </select>
            <input type="text" name="dietary_value[]" placeholder="Details (optional)" maxlength="200">
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Anything Else?</legend>
        <label for="notes">Notes for the host (optional)</label>
        <textarea id="notes" name="notes" rows="3" maxlength="2000"></textarea>
      </fieldset>

      <!-- Cloudflare Turnstile widget -->
      <div class="cf-turnstile" data-sitekey="TURNSTILE_SITE_KEY_PLACEHOLDER"></div>

      <button type="submit">Send my RSVP</button>
    </form>

    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  `)
}

function renderKidsPartyFields(event: EventRow): string {
  const allowSiblings = Boolean(event.allow_siblings)
  const allowParents = Boolean(event.allow_parents)
  return `
    <label for="children_count">Number of children attending *</label>
    <input id="children_count" name="children_count" type="number" min="0" max="${event.max_party_size_per_rsvp}" required>

    <label for="children_ages">Children's ages (comma-separated, e.g. 3,5,7)</label>
    <input id="children_ages" name="children_ages" type="text" maxlength="100" placeholder="3,5,7">

    ${allowSiblings ? `
      <label for="siblings_count">Siblings attending</label>
      <input id="siblings_count" name="siblings_count" type="number" min="0" max="${event.max_party_size_per_rsvp}" value="0">
    ` : ''}

    ${allowParents ? `
      <label for="adults">Adults / parents attending</label>
      <input id="adults" name="adults" type="number" min="0" max="${event.max_party_size_per_rsvp}" value="1">

      <label for="parents_count">Additional parents / guardians</label>
      <input id="parents_count" name="parents_count" type="number" min="0" max="${event.max_party_size_per_rsvp}" value="0">
    ` : ''}
  `
}

function renderStandardPartyFields(event: EventRow, maxParty: number): string {
  return `
    <label for="adults">Number of adults attending (including yourself) *</label>
    <input id="adults" name="adults" type="number" min="1" max="${maxParty}" value="1" required>
  `
}

function renderStatusChoice(): string {
  return `
    <fieldset>
      <legend>Will you be attending?</legend>
      <label><input type="radio" name="status" value="attending" checked> Yes, I'll be there</label>
      <label><input type="radio" name="status" value="maybe"> Maybe</label>
      <label><input type="radio" name="status" value="not_attending"> Sorry, can't make it</label>
    </fieldset>
  `
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)} — RSVPex</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
    fieldset { border: 1px solid #ddd; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; }
    label { display: block; font-weight: 600; margin-top: 0.75rem; }
    input, select, textarea { width: 100%; padding: 0.4rem 0.6rem; margin-top: 0.25rem; font-size: 1rem; border: 1px solid #bbb; border-radius: 4px; }
    button[type=submit] { margin-top: 1rem; padding: 0.75rem 2rem; font-size: 1rem; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
    button[type=submit]:hover { background: #1d4ed8; }
  </style>
</head>
<body>
${body}
</body>
</html>`
}

/** Minimal HTML entity escaping — never interpolate untrusted data without this. */
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export default rsvpFormRouter
