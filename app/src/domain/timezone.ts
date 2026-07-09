/**
 * Timezone normalization for admin-entered event times.
 *
 * `<input type="datetime-local">` submits a zoneless wall-clock string
 * ("2026-07-08T18:00") with no indication of which timezone it was entered
 * in. Storing that raw string and later parsing it with `new Date(...)`
 * silently treats it as UTC (Workers' runtime TZ is always UTC) — so a
 * host in America/Toronto entering "6pm" ends up with an event that opens,
 * closes, and sends reminders 4-5 hours off from what they typed
 * (C-5 in recommendations.md).
 *
 * The fix: normalize at the write boundary. Every admin route that accepts
 * a datetime-local value converts it to a proper UTC ISO-8601 string
 * (with `Z`) via `localToUtc()` *before* it reaches the domain layer or D1.
 * Everything downstream (ICS generation, reminder cron, opens/closes
 * comparisons against `new Date().toISOString()`) already assumes its
 * stored datetimes are true UTC instants — this makes that assumption true.
 *
 * @req ADMIN-04 — event start/end/opens/closes times reflect the host's intent
 */

const LOCAL_DATETIME_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/

/** Returns the IANA timezone's UTC offset, in minutes, at the given instant. */
function getOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return (asUtc - at.getTime()) / 60_000
}

/**
 * Converts a zoneless "YYYY-MM-DDTHH:mm[:ss]" wall-clock string — as
 * produced by `<input type="datetime-local">` — into a UTC ISO-8601 string
 * with `Z`, interpreting the input as local time in `tz`.
 *
 * Correct across DST transitions: computes the offset at a first-guess
 * instant, applies it, then re-checks the offset at the corrected instant
 * and re-applies if it changed (handles the case where the guess landed on
 * the other side of a DST boundary from the real answer).
 *
 * @throws RangeError if `tz` is not a recognized IANA timezone name
 * @throws Error if `localStr` isn't in the expected zoneless format
 */
export function localToUtc(tz: string, localStr: string): string {
  const match = LOCAL_DATETIME_RE.exec(localStr)
  if (!match) {
    throw new Error(`localToUtc: expected a zoneless "YYYY-MM-DDTHH:mm" string, got "${localStr}"`)
  }
  const normalized = match[2] ? localStr : `${localStr}:00`

  // First guess: treat the wall-clock string as if it were already UTC.
  const guess = new Date(`${normalized}Z`)
  const offset = getOffsetMinutes(tz, guess)
  let corrected = new Date(guess.getTime() - offset * 60_000)

  // Re-check: if the offset at the corrected instant differs (DST boundary
  // straddle), redo the correction once more against the new instant.
  const offset2 = getOffsetMinutes(tz, corrected)
  if (offset2 !== offset) {
    corrected = new Date(guess.getTime() - offset2 * 60_000)
  }

  return corrected.toISOString()
}

/**
 * Inverse of `localToUtc()`: formats a UTC ISO-8601 instant as a zoneless
 * "YYYY-MM-DDTHH:mm" wall-clock string in `tz`, for pre-filling a
 * `<input type="datetime-local">` when rendering an edit form. Without
 * this, an edit form would display the raw UTC value as if it were local
 * time, and resubmitting untouched would silently shift it again on save.
 */
export function utcToLocal(tz: string, utcIso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcIso))

  const get = (type: string) => parts.find((p) => p.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
