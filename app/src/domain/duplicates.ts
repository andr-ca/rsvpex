/**
 * Duplicate RSVP detection — exact match and heuristic window check.
 *
 * Exact match relies on the partial unique indexes created in the migration:
 *   uidx_rsvps_event_email  ON rsvps(event_id, lower(email)) WHERE email IS NOT NULL
 *   uidx_rsvps_event_phone  ON rsvps(event_id, phone)        WHERE phone IS NOT NULL
 *
 * Heuristic match guards against near-duplicates: same name+contact submitted
 * within a configurable time window (default 5 minutes).
 *
 * @req CAP-04 — heuristic duplicate detection (enable_heuristic_dup_check)
 * @req GAP-02 — return existing rsvp_token so guest can be offered an edit link
 */

export type ExactDuplicateResult =
  | { isDuplicate: true;  rsvpToken: string }
  | { isDuplicate: false }

export type HeuristicDuplicateResult =
  | { isDuplicate: true;  rsvpToken: string }
  | { isDuplicate: false }

/**
 * Checks for an exact duplicate RSVP by email OR phone for the given event.
 *
 * Uses `lower(email)` to make the email check case-insensitive, matching the
 * partial unique index in the migration.
 */
export async function isDuplicate(
  db: D1Database,
  eventId: string,
  email: string | null,
  phone: string | null,
): Promise<ExactDuplicateResult> {
  if (!email && !phone) return { isDuplicate: false }

  const conditions: string[] = []
  const bindings: (string | null)[] = []

  if (email) {
    conditions.push('(event_id = ? AND lower(email) = lower(?))')
    bindings.push(eventId, email)
  }

  if (phone) {
    conditions.push('(event_id = ? AND phone = ?)')
    bindings.push(eventId, phone)
  }

  const sql = `SELECT rsvp_token FROM rsvps WHERE (${conditions.join(' OR ')}) LIMIT 1`
  const row = await db.prepare(sql).bind(...bindings).first<{ rsvp_token: string }>()

  if (row) return { isDuplicate: true, rsvpToken: row.rsvp_token }
  return { isDuplicate: false }
}

/**
 * Heuristic duplicate check: same (normalised) name + same email-or-phone
 * submitted within `windowMs` milliseconds of now.
 *
 * Only called when `event.enable_heuristic_dup_check = true`.
 * "Normalised name" = trimmed, lowercased, collapsed whitespace.
 */
export async function isHeuristicDuplicate(
  db: D1Database,
  eventId: string,
  name: string,
  email: string | null,
  phone: string | null,
  windowMs = 5 * 60 * 1000,
): Promise<HeuristicDuplicateResult> {
  const normalisedName = name.trim().toLowerCase().replace(/\s+/g, ' ')
  const windowStart = new Date(Date.now() - windowMs).toISOString()

  const contactConditions: string[] = []
  const bindings: (string | null | number)[] = [eventId, normalisedName, windowStart]

  if (email) {
    contactConditions.push('lower(email) = lower(?)')
    bindings.push(email)
  }
  if (phone) {
    contactConditions.push('phone = ?')
    bindings.push(phone)
  }

  if (contactConditions.length === 0) return { isDuplicate: false }

  const contactClause = contactConditions.join(' OR ')
  const sql = `
    SELECT rsvp_token
      FROM rsvps
     WHERE event_id = ?
       AND lower(trim(name)) = ?
       AND submitted_at >= ?
       AND (${contactClause})
     LIMIT 1`

  const row = await db.prepare(sql).bind(...bindings).first<{ rsvp_token: string }>()

  if (row) return { isDuplicate: true, rsvpToken: row.rsvp_token }
  return { isDuplicate: false }
}
