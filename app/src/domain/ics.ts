/**
 * ICS calendar file generation for RSVPex.
 *
 * Uses ical-generator (pure JS, no fs) — Workers-compatible.
 * Produces RFC 5545-compliant output including VTIMEZONE block.
 * VTIMEZONE is generated inline using the Intl API (Workers-compatible;
 * no fs access required).
 *
 * @req PUB-09 — ICS download on thank-you page
 * @req GAP-01 — VTIMEZONE block required; RFC 5545 valid; Outlook-compatible
 */

import ical, { ICalCalendarMethod } from 'ical-generator'

export type DietaryEntry = {
  kind: string
  value: string
}

export type IcsEventData = {
  rsvpId: string
  eventTitle: string
  eventStartAt: string // ISO-8601
  eventEndAt: string | null // ISO-8601 or null
  eventTimezone: string // IANA timezone name e.g. 'America/Toronto'
  locationText: string | null
  guestName: string
  adults: number
  childrenCount: number
  dietary: DietaryEntry[]
}

// ── Inline VTIMEZONE generator (Intl API — Works in Cloudflare Workers) ───────

function getUtcOffsetMinutes(tz: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: tz,
    timeZoneName: 'longOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  if (offsetPart === 'GMT') return 0
  const m = offsetPart.match(/GMT([+-])(\d{1,2}):(\d{2})/)
  if (!m) return 0
  return (m[1] === '+' ? 1 : -1) * (parseInt(m[2]) * 60 + parseInt(m[3]))
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  return sign + String(Math.floor(abs / 60)).padStart(2, '0') + String(abs % 60).padStart(2, '0')
}

/** Format a Date as local datetime string in the given timezone: YYYYMMDDTHHmmss */
function toLocalDtStr(tz: string, date: Date): string {
  const fmt = new Intl.DateTimeFormat('sv', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  // sv locale produces "2026-03-08 02:00:00"
  const s = fmt.format(date)
  // Convert to ICS format: 20260308T020000
  const [datePart, timePart] = s.split(' ')
  return datePart.replace(/-/g, '') + 'T' + timePart.replace(/:/g, '')
}

/**
 * Binary-searches the day-of-year (relative to `year`'s January) where the
 * UTC offset for `tz` flips from `loOff` to `hiOff`, given that day `loDay`
 * is known to have offset `loOff` and day `hiDay` is known to have offset
 * `hiOff`. `hiDay` may exceed 365/366 (e.g. 380 = next Jan 15) — `Date.UTC`
 * normalizes that into the following year, which is fine since it's only
 * used as a search boundary, never actually queried.
 *
 * O(log n) Intl.DateTimeFormat calls instead of scanning every day (C-17 in
 * recommendations.md: the previous version instantiated ~365-370 of these
 * per ICS download, which can exceed the Workers free-plan 10ms CPU budget).
 */
function findTransition(
  tz: string,
  year: number,
  loDay: number,
  loOff: number,
  hiDay: number,
  hiOff: number,
): { date: Date; from: number; to: number } {
  let lo = loDay
  let hi = hiDay
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    const off = getUtcOffsetMinutes(tz, new Date(Date.UTC(year, 0, mid, 12)))
    if (off === loOff) lo = mid
    else hi = mid
  }
  return { date: new Date(Date.UTC(year, 0, hi, 12)), from: loOff, to: hiOff }
}

// Memoized per "tz:year" — a Workers isolate can live for many requests, so
// this amortizes the (already much cheaper) computation across an isolate's
// lifetime instead of redoing it on every single ICS download (C-17).
const vtimezoneCache = new Map<string, string>()

/**
 * Generate a valid RFC 5545 VTIMEZONE block for the given IANA timezone.
 * Uses Intl API to detect DST transitions — no fs access required.
 */
function generateVtimezone(tz: string): string {
  const year = new Date().getFullYear()
  const cacheKey = `${tz}:${year}`
  const cached = vtimezoneCache.get(cacheKey)
  if (cached) return cached

  const result = computeVtimezone(tz, year)
  vtimezoneCache.set(cacheKey, result)
  return result
}

function computeVtimezone(tz: string, year: number): string {
  const stdOffset = getUtcOffsetMinutes(tz, new Date(Date.UTC(year, 0, 15)))
  const dstOffset = getUtcOffsetMinutes(tz, new Date(Date.UTC(year, 6, 15)))

  if (stdOffset === dstOffset) {
    // No DST — single STANDARD component
    return generateVtimezone.__noTransition(tz, stdOffset)
  }

  // Day 15 (~Jan 15) is known std, day 196 (~Jul 15) is known dst, so the
  // spring-forward transition lies in [15,196] and the fall-back transition
  // lies in [196,380] (380 = 15 + 365, i.e. the following Jan 15 — back to
  // std for any zone with stable year-over-year DST rules). This preserves
  // the exact same "first transition found = spring, second = fall"
  // semantics as the original day-by-day scan.
  const spring = findTransition(tz, year, 15, stdOffset, 196, dstOffset)
  const fall = findTransition(tz, year, 196, dstOffset, 380, stdOffset)

  const springDt = toLocalDtStr(tz, spring.date)
  const fallDt = toLocalDtStr(tz, fall.date)

  return [
    'BEGIN:VTIMEZONE',
    `TZID:${tz}`,
    'BEGIN:DAYLIGHT',
    `DTSTART:${springDt}`,
    `TZOFFSETFROM:${formatOffset(spring.from)}`,
    `TZOFFSETTO:${formatOffset(spring.to)}`,
    'TZNAME:DST',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    `DTSTART:${fallDt}`,
    `TZOFFSETFROM:${formatOffset(fall.from)}`,
    `TZOFFSETTO:${formatOffset(fall.to)}`,
    'TZNAME:STD',
    'END:STANDARD',
    'END:VTIMEZONE',
  ].join('\r\n')
}

generateVtimezone.__noTransition = (tz: string, offset: number): string =>
  [
    'BEGIN:VTIMEZONE',
    `TZID:${tz}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    `TZOFFSETFROM:${formatOffset(offset)}`,
    `TZOFFSETTO:${formatOffset(offset)}`,
    'END:STANDARD',
    'END:VTIMEZONE',
  ].join('\r\n')

// ── ICS generation ────────────────────────────────────────────────────────────

/**
 * Generates a valid RFC 5545 ICS string for the given RSVP.
 * Includes VTIMEZONE block derived from the event's IANA timezone.
 */
export function generateIcs(data: IcsEventData): string {
  const cal = ical({
    name: 'RSVPex',
    method: ICalCalendarMethod.PUBLISH,
    timezone: {
      name: data.eventTimezone,
      generator: generateVtimezone,
    },
  })

  const start = new Date(data.eventStartAt)
  const end = data.eventEndAt
    ? new Date(data.eventEndAt)
    : new Date(start.getTime() + 2 * 60 * 60 * 1000)

  // Build DESCRIPTION with RSVP summary
  const dietarySummary =
    data.dietary.length > 0
      ? data.dietary.map((d) => (d.value ? `${d.kind} (${d.value})` : d.kind)).join(', ')
      : 'None'

  const description = [
    `Guest: ${data.guestName}`,
    `Party size: ${data.adults} adult(s)${data.childrenCount > 0 ? `, ${data.childrenCount} child(ren)` : ''}`,
    `Dietary: ${dietarySummary}`,
  ].join('\n')

  cal.createEvent({
    id: `${data.rsvpId}@rsvpex`,
    summary: data.eventTitle,
    start,
    end,
    timezone: data.eventTimezone,
    location: data.locationText ?? undefined,
    description,
  })

  return cal.toString()
}
