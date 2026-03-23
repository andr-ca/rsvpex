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
 * Generate a valid RFC 5545 VTIMEZONE block for the given IANA timezone.
 * Uses Intl API to detect DST transitions — no fs access required.
 */
function generateVtimezone(tz: string): string {
  const year = new Date().getFullYear()
  const stdOffset = getUtcOffsetMinutes(tz, new Date(Date.UTC(year, 0, 15)))
  const dstOffset = getUtcOffsetMinutes(tz, new Date(Date.UTC(year, 6, 15)))

  if (stdOffset === dstOffset) {
    // No DST — single STANDARD component
    return [
      'BEGIN:VTIMEZONE',
      `TZID:${tz}`,
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      `TZOFFSETFROM:${formatOffset(stdOffset)}`,
      `TZOFFSETTO:${formatOffset(stdOffset)}`,
      'END:STANDARD',
      'END:VTIMEZONE',
    ].join('\r\n')
  }

  // Scan for spring-forward and fall-back transitions in current year
  let spring: { date: Date; from: number; to: number } | null = null
  let fall: { date: Date; from: number; to: number } | null = null
  let prevOff = stdOffset

  for (let month = 0; month < 12; month++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(Date.UTC(year, month, day, 12))
      const off = getUtcOffsetMinutes(tz, d)
      if (off !== prevOff) {
        if (!spring) {
          spring = { date: d, from: prevOff, to: off }
        } else {
          fall = { date: d, from: prevOff, to: off }
        }
        prevOff = off
      }
    }
  }

  if (!spring || !fall) {
    // Fallback: no transition found — treat as no-DST
    return generateVtimezone.__noTransition(tz, stdOffset)
  }

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
