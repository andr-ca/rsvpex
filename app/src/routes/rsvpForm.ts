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
 * @req I18N-01 — event locale with Accept-Language fallback
 */

import { Hono } from 'hono'
import { getRsvpByToken } from '../domain/rsvpEdit'
import { timingSafeEqual } from '../domain/tokens'
import { t, resolveLocale, type SupportedLocale } from '../i18n'
import { parseQuestionDefs, questionFieldName, type QuestionDef } from '../domain/questions'

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
  timezone: string
  location_text: string | null
  questions: string
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
  children_ages: string
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
            locale, start_at, timezone, location_text, questions
       FROM events
      WHERE slug = ?
        AND status = 'published'
      LIMIT 1`,
  )
    .bind(slug)
    .first<EventRow>()

  if (!event) {
    return c.html(renderNotFound('en'), 404)
  }

  const locale = resolveLocale(event.locale, c.req.raw.headers.get('Accept-Language'))
  const now = new Date().toISOString()

  // ── Visibility check ──────────────────────────────────────────────────────
  if (event.visibility === 'private') {
    if (!accessToken || !event.access_token || !timingSafeEqual(accessToken, event.access_token)) {
      return c.html(renderAccessDenied(event.title, locale), 403)
    }
    // GAP-06: expired token
    if (event.access_token_expires_at && event.access_token_expires_at < now) {
      return c.html(renderLinkExpired(event.title, locale), 403)
    }
  }

  // ── Time-window check ─────────────────────────────────────────────────────
  if (event.opens_at && event.opens_at > now) {
    return c.html(renderNotOpenYet(event, locale), 200)
  }

  if (event.closes_at && event.closes_at < now) {
    return c.html(renderClosed(event.title, locale), 410)
  }

  // ── Happy path: render form ───────────────────────────────────────────────
  // ── Edit mode: prefill form from rid token ───────────────────────────────
  const rid = c.req.query('rid') ?? null
  if (rid) {
    const rsvp = await getRsvpByToken(c.env.DB, rid)
    if (!rsvp || rsvp.event_id !== event.id) {
      return c.html(renderInvalidEditLink(locale), 403)
    }
    return c.html(renderEditForm(event, rsvp as RsvpEditRow, rid, locale))
  }

  // ── New RSVP: render blank form ───────────────────────────────────────────
  return c.html(renderForm(event, accessToken, locale, c.env.TURNSTILE_SITE_KEY))
})

// ── HTML renderers ────────────────────────────────────────────────────────────

function renderInvalidEditLink(locale: SupportedLocale): string {
  return page(
    t('edit.invalidLink', locale),
    `<h1>${escHtml(t('edit.invalidLink', locale))}</h1>
     <p>${escHtml(t('edit.invalidLinkMsg', locale))}</p>`,
    locale,
  )
}

function renderEditForm(
  event: EventRow,
  rsvp: RsvpEditRow,
  rid: string,
  locale: SupportedLocale,
): string {
  const dietary: Array<{ kind: string; value: string }> = JSON.parse(rsvp.dietary || '[]')
  const questionDefs = parseQuestionDefs(event.questions)
  const currentAnswers: Record<string, unknown> = JSON.parse(rsvp.answers || '{}')
  const isKids = Boolean(event.is_kids_event)

  return page(
    event.title,
    `
    <div class="edit-banner">${escHtml(t('edit.banner', locale))}</div>
    <h1>${escHtml(event.title)}</h1>

    <form method="POST" action="/rsvp/${escHtml(rsvp.id)}" id="rsvp-form">
      <input type="hidden" name="_method" value="PATCH">
      <input type="hidden" name="rid" value="${escHtml(rid)}">

      <fieldset>
        <legend>${escHtml(t('legend.details', locale))}</legend>
        <label for="name">${escHtml(t('form.fullName', locale))} *</label>
        <input id="name" name="name" type="text" required autocomplete="name" maxlength="200"
               value="${escHtml(rsvp.name)}">

        <label for="email">${escHtml(t('form.email', locale))}</label>
        <input id="email" name="email" type="email" autocomplete="email" maxlength="254"
               value="${escHtml(rsvp.email ?? '')}">

        <label for="phone">${escHtml(t('form.phone', locale))}</label>
        <input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="30"
               value="${escHtml(rsvp.phone ?? '')}">
      </fieldset>

      <fieldset>
        <legend>${escHtml(t('legend.party', locale))}</legend>
        ${
          isKids
            ? renderKidsPartyFields(event, locale, {
                childrenCount: rsvp.children_count,
                childrenAges: (JSON.parse(rsvp.children_ages || '[]') as number[]).join(','),
                siblingsCount: rsvp.siblings_count,
                adults: rsvp.adults,
                parentsCount: rsvp.parents_count,
              })
            : renderStandardPartyFields(event, event.max_party_size_per_rsvp, locale, rsvp.adults)
        }
      </fieldset>

      ${
        event.allow_status_choice
          ? `
      <fieldset>
        <legend>${escHtml(t('legend.attendance', locale))}</legend>
        <label><input type="radio" name="status" value="attending" ${rsvp.status === 'attending' ? 'checked' : ''}> ${escHtml(t('status.attending', locale))}</label>
        <label><input type="radio" name="status" value="maybe" ${rsvp.status === 'maybe' ? 'checked' : ''}> ${escHtml(t('status.maybe', locale))}</label>
        <label><input type="radio" name="status" value="not_attending" ${rsvp.status === 'not_attending' ? 'checked' : ''}> ${escHtml(t('status.notAttending', locale))}</label>
      </fieldset>
      `
          : ''
      }

      <fieldset>
        <legend>${escHtml(t('legend.dietary', locale))}</legend>
        <p>${escHtml(t('legend.dietaryHint', locale))}</p>
        <div id="dietary-container">
          ${renderDietaryRows(locale, dietary)}
        </div>
      </fieldset>

      ${renderQuestionFields(questionDefs, locale, currentAnswers)}

      <fieldset>
        <legend>${escHtml(t('legend.notes', locale))}</legend>
        <label for="notes">${escHtml(t('form.notes', locale))}</label>
        <textarea id="notes" name="notes" rows="3" maxlength="2000">${escHtml(rsvp.notes ?? '')}</textarea>
      </fieldset>

      <button type="submit">${escHtml(t('form.saveChanges', locale))}</button>
    </form>
  `,
    locale,
  )
}

function renderNotFound(locale: SupportedLocale): string {
  return page(
    t('page.notFound', locale),
    `<h1>${escHtml(t('page.notFound', locale))}</h1><p>${escHtml(t('page.notFoundMsg', locale))}</p>`,
    locale,
  )
}

function renderAccessDenied(title: string, locale: SupportedLocale): string {
  return page(
    t('page.accessDenied', locale),
    `
    <h1>${escHtml(title)}</h1>
    <p>${escHtml(t('page.accessDeniedMsg', locale))}</p>
  `,
    locale,
  )
}

function renderLinkExpired(title: string, locale: SupportedLocale): string {
  return page(
    t('page.linkExpired', locale),
    `
    <h1>${escHtml(title)}</h1>
    <p>${escHtml(t('page.linkExpiredMsg', locale))}</p>
  `,
    locale,
  )
}

function renderNotOpenYet(event: EventRow, locale: SupportedLocale): string {
  // opens_at is stored as true UTC (C-5 in recommendations.md) — an explicit
  // timeZone is required, otherwise this formats in the Workers runtime's
  // own zone (UTC) instead of the event's.
  const opensDate = event.opens_at
    ? new Date(event.opens_at).toLocaleDateString(locale, {
        dateStyle: 'long',
        timeZone: event.timezone,
      })
    : ''
  return page(
    event.title,
    `
    <h1>${escHtml(event.title)}</h1>
    <p>${escHtml(t('page.notOpenYet', locale))}</p>
    ${opensDate ? `<p>${escHtml(t('page.openingOn', locale))} <strong>${escHtml(opensDate)}</strong>.</p>` : ''}
  `,
    locale,
  )
}

function renderClosed(title: string, locale: SupportedLocale): string {
  return page(
    t('page.closed', locale),
    `
    <h1>${escHtml(title)}</h1>
    <p>${escHtml(t('page.closedMsg', locale))}</p>
  `,
    locale,
  )
}

function renderForm(
  event: EventRow,
  accessToken: string | null,
  locale: SupportedLocale,
  turnstileSiteKey: string,
): string {
  const isKids = Boolean(event.is_kids_event)
  const allowStatusChoice = Boolean(event.allow_status_choice)
  const maxParty = event.max_party_size_per_rsvp
  const questionDefs = parseQuestionDefs(event.questions)

  return page(
    event.title,
    `
    <h1>${escHtml(event.title)}</h1>
    ${event.host_name ? `<p class="host">${escHtml(t('page.hostedBy', locale))} ${escHtml(event.host_name)}</p>` : ''}
    ${event.location_text ? `<p class="location">${escHtml(event.location_text)}</p>` : ''}
    ${event.description_html ?? ''}

    <form method="POST" action="/rsvp/${escHtml(event.slug)}" id="rsvp-form">
      ${accessToken ? `<input type="hidden" name="t" value="${escHtml(accessToken)}">` : ''}

      <fieldset>
        <legend>${escHtml(t('legend.details', locale))}</legend>

        <label for="name">${escHtml(t('form.fullName', locale))} *</label>
        <input id="name" name="name" type="text" required autocomplete="name" maxlength="200">

        <label for="email">${escHtml(t('form.email', locale))}</label>
        <input id="email" name="email" type="email" autocomplete="email" maxlength="254">

        <label for="phone">${escHtml(t('form.phoneHint', locale))}</label>
        <input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="30">
      </fieldset>

      <fieldset>
        <legend>${escHtml(t('legend.party', locale))}</legend>

        ${isKids ? renderKidsPartyFields(event, locale) : renderStandardPartyFields(event, maxParty, locale)}
      </fieldset>

      ${allowStatusChoice ? renderStatusChoice(locale) : ''}

      <fieldset>
        <legend>${escHtml(t('legend.dietary', locale))}</legend>
        <p>${escHtml(t('legend.dietaryHint', locale))}</p>
        <div id="dietary-container">
          ${renderDietaryRows(locale, [])}
        </div>
      </fieldset>

      ${renderQuestionFields(questionDefs, locale)}

      <fieldset>
        <legend>${escHtml(t('legend.notes', locale))}</legend>
        <label for="notes">${escHtml(t('form.notes', locale))}</label>
        <textarea id="notes" name="notes" rows="3" maxlength="2000"></textarea>
      </fieldset>

      <!-- Cloudflare Turnstile widget -->
      <div class="cf-turnstile" data-sitekey="${escHtml(turnstileSiteKey)}"></div>

      <button type="submit">${escHtml(t('form.submit', locale))}</button>
    </form>

    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  `,
    locale,
  )
}

type PartyFieldValues = {
  childrenCount?: number
  childrenAges?: string
  siblingsCount?: number
  adults?: number
  parentsCount?: number
}

function renderKidsPartyFields(
  event: EventRow,
  locale: SupportedLocale,
  current?: PartyFieldValues,
): string {
  const allowSiblings = Boolean(event.allow_siblings)
  const allowParents = Boolean(event.allow_parents)
  return `
    <label for="children_count">${escHtml(t('form.childrenCount', locale))} *</label>
    <input id="children_count" name="children_count" type="number" min="0" max="${event.max_party_size_per_rsvp}" value="${current?.childrenCount ?? ''}" required>

    <label for="children_ages">${escHtml(t('form.childrenAges', locale))}</label>
    <input id="children_ages" name="children_ages" type="text" maxlength="100" placeholder="3,5,7" value="${escHtml(current?.childrenAges ?? '')}">

    ${
      allowSiblings
        ? `
      <label for="siblings_count">${escHtml(t('form.siblings', locale))}</label>
      <input id="siblings_count" name="siblings_count" type="number" min="0" max="${event.max_party_size_per_rsvp}" value="${current?.siblingsCount ?? 0}">
    `
        : ''
    }

    ${
      allowParents
        ? `
      <label for="adults">${escHtml(t('form.adultsKids', locale))}</label>
      <input id="adults" name="adults" type="number" min="0" max="${event.max_party_size_per_rsvp}" value="${current?.adults ?? 1}">

      <label for="parents_count">${escHtml(t('form.parents', locale))}</label>
      <input id="parents_count" name="parents_count" type="number" min="0" max="${event.max_party_size_per_rsvp}" value="${current?.parentsCount ?? 0}">
    `
        : ''
    }
  `
}

function renderStandardPartyFields(
  event: EventRow,
  maxParty: number,
  locale: SupportedLocale,
  currentAdults?: number,
): string {
  return `
    <label for="adults">${escHtml(t('form.adults', locale))} *</label>
    <input id="adults" name="adults" type="number" min="1" max="${maxParty}" value="${currentAdults ?? 1}" required>
  `
}

function renderStatusChoice(locale: SupportedLocale): string {
  return `
    <fieldset>
      <legend>${escHtml(t('legend.attendance', locale))}</legend>
      <label><input type="radio" name="status" value="attending" checked> ${escHtml(t('status.attending', locale))}</label>
      <label><input type="radio" name="status" value="maybe"> ${escHtml(t('status.maybe', locale))}</label>
      <label><input type="radio" name="status" value="not_attending"> ${escHtml(t('status.notAttending', locale))}</label>
    </fieldset>
  `
}

const DIETARY_KEYS = [
  'vegetarian',
  'vegan',
  'glutenFree',
  'halal',
  'kosher',
  'nutAllergy',
  'dairyFree',
  'other',
] as const

const DIETARY_VALUES = [
  'vegetarian',
  'vegan',
  'gluten_free',
  'halal',
  'kosher',
  'nut_allergy',
  'dairy_free',
  'other',
] as const

function renderDietaryOptions(locale: SupportedLocale, selectedKind?: string): string {
  return DIETARY_KEYS.map(
    (key, i) =>
      `<option value="${DIETARY_VALUES[i]}" ${selectedKind === DIETARY_VALUES[i] ? 'selected' : ''}>${escHtml(t(`dietary.${key}`, locale))}</option>`,
  ).join('')
}

/**
 * Renders one `.dietary-row` per existing entry, plus a trailing blank row.
 * Used by both the new-RSVP form (entries=[]) and the edit form (C-3 in
 * recommendations.md: the edit form previously rendered only ONE dietary row
 * regardless of how many entries the guest originally submitted, so editing
 * silently dropped every entry past the first).
 */
function renderDietaryRow(
  locale: SupportedLocale,
  entry?: { kind: string; value: string },
): string {
  return `
          <div class="dietary-row">
            <select name="dietary_kind[]">
              <option value="">${escHtml(t('dietary.select', locale))}</option>
              ${renderDietaryOptions(locale, entry?.kind)}
            </select>
            <input type="text" name="dietary_value[]" placeholder="${escHtml(t('dietary.detailsPlaceholder', locale))}" maxlength="200" value="${escHtml(entry?.value ?? '')}">
          </div>`
}

function renderDietaryRows(
  locale: SupportedLocale,
  entries: Array<{ kind: string; value: string }>,
): string {
  const rows = entries.map((entry) => renderDietaryRow(locale, entry))
  rows.push(renderDietaryRow(locale)) // always one trailing blank row to add more
  return rows.join('')
}

// ── Custom questions (GUEST-04) ─────────────────────────────────────────────
// @req GUEST-04 — custom questions per event, rendered here and parsed by
// rsvpSubmit.ts / rsvpPatch.ts using the shared questionFieldName() convention.

function renderQuestionFields(
  questions: QuestionDef[],
  locale: SupportedLocale,
  currentAnswers?: Record<string, unknown>,
): string {
  if (questions.length === 0) return ''
  return `
      <fieldset>
        <legend>${escHtml(t('legend.additionalQuestions', locale))}</legend>
        ${questions.map((q) => renderQuestionField(q, currentAnswers?.[q.id])).join('')}
      </fieldset>
  `
}

function renderQuestionField(q: QuestionDef, currentValue?: unknown): string {
  const fieldName = questionFieldName(q)
  const fieldId = `answer_${escHtml(q.id)}`
  const label = `${escHtml(q.label)}${q.required ? ' *' : ''}`
  const requiredAttr = q.required ? 'required' : ''
  const currentStr = typeof currentValue === 'string' ? currentValue : ''
  const currentArr = Array.isArray(currentValue) ? currentValue.map(String) : []

  switch (q.type) {
    case 'short_text':
      return `
        <label for="${fieldId}">${label}</label>
        <input id="${fieldId}" name="${fieldName}" type="text" maxlength="500" value="${escHtml(currentStr)}" ${requiredAttr}>`
    case 'long_text':
      return `
        <label for="${fieldId}">${label}</label>
        <textarea id="${fieldId}" name="${fieldName}" rows="3" maxlength="2000" ${requiredAttr}>${escHtml(currentStr)}</textarea>`
    case 'boolean':
      return `
        <label for="${fieldId}">${label}</label>
        <select id="${fieldId}" name="${fieldName}" ${requiredAttr}>
          <option value="">—</option>
          <option value="yes" ${currentStr === 'yes' ? 'selected' : ''}>Yes</option>
          <option value="no" ${currentStr === 'no' ? 'selected' : ''}>No</option>
        </select>`
    case 'single_select':
      return `
        <label for="${fieldId}">${label}</label>
        <select id="${fieldId}" name="${fieldName}" ${requiredAttr}>
          <option value="">—</option>
          ${(q.options ?? []).map((opt) => `<option value="${escHtml(opt)}" ${currentStr === opt ? 'selected' : ''}>${escHtml(opt)}</option>`).join('')}
        </select>`
    case 'multi_select':
      return `
        <fieldset>
          <legend>${label}</legend>
          ${(q.options ?? [])
            .map(
              (opt, i) =>
                `<label><input type="checkbox" id="${i === 0 ? fieldId : ''}" name="${fieldName}" value="${escHtml(opt)}" ${currentArr.includes(opt) ? 'checked' : ''}> ${escHtml(opt)}</label>`,
            )
            .join('')}
        </fieldset>`
    default:
      return ''
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function page(title: string, body: string, locale: SupportedLocale = 'en'): string {
  return `<!DOCTYPE html>
<html lang="${locale}">
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
    .edit-banner { display: inline-block; background: #fef3c7; color: #92400e; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem; }
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
