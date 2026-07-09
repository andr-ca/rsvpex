/**
 * RSVP edit domain functions: token lookup, field update, token revocation.
 *
 * All functions take a D1Database instance — no CF binding context needed.
 * Pure data operations; no HTTP or HTML concerns.
 *
 * @req PUB-10 — prefill form from rid token; PATCH requires rid
 * @req GUEST-05 — token revocation regenerates token; old token invalid within 60s
 */

export type RsvpRow = {
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
  submitted_at: string
}

export type RsvpUpdateData = {
  name: string
  email: string | null
  phone: string | null
  adults: number
  parentsCount: number
  siblingsCount: number
  childrenCount: number
  childrenAges: string
  dietary: string
  notes: string | null
  answers: string
  status: string
}

/**
 * Looks up an RSVP by its rsvp_token.
 * Returns null if the token does not match any record (revoked or never existed).
 */
export async function getRsvpByToken(db: D1Database, token: string): Promise<RsvpRow | null> {
  return db
    .prepare(
      `SELECT id, event_id, name, email, phone, adults, parents_count,
              siblings_count, children_count, children_ages, dietary,
              notes, answers, status, rsvp_token, submitted_at
         FROM rsvps
        WHERE rsvp_token = ?
        LIMIT 1`,
    )
    .bind(token)
    .first<RsvpRow>()
}

/**
 * Updates mutable RSVP fields in place.
 * Does not change rsvp_token, event_id, source, ip_hash, or submitted_at.
 */
export async function updateRsvp(
  db: D1Database,
  rsvpId: string,
  data: RsvpUpdateData,
): Promise<void> {
  await db
    .prepare(
      `UPDATE rsvps
          SET name = ?,
              email = ?,
              phone = ?,
              adults = ?,
              parents_count = ?,
              siblings_count = ?,
              children_count = ?,
              children_ages = ?,
              dietary = ?,
              notes = ?,
              answers = ?,
              status = ?,
              updated_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(
      data.name,
      data.email,
      data.phone,
      data.adults,
      data.parentsCount,
      data.siblingsCount,
      data.childrenCount,
      data.childrenAges,
      data.dietary,
      data.notes,
      data.answers,
      data.status,
      rsvpId,
    )
    .run()
}

/**
 * Revokes the current rsvp_token by replacing it with a new UUID.
 * The old token will no longer match any getRsvpByToken lookup.
 * Returns the new token.
 *
 * Per GUEST-05: admin calls this; the old token is invalid immediately
 * (D1 is single-writer so there is no grace window at DB level — the
 * 60s grace window is a product-level policy enforced by callers if needed).
 */
export async function revokeToken(db: D1Database, rsvpId: string): Promise<string> {
  const newToken = crypto.randomUUID()
  await db
    .prepare(`UPDATE rsvps SET rsvp_token = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(newToken, rsvpId)
    .run()
  return newToken
}
