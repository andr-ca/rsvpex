/**
 * Capacity enforcement for RSVP submissions.
 *
 * Uses a conditional INSERT … SELECT … WHERE to enforce the capacity cap atomically.
 * D1 serializes writes at the API layer, so each statement executes in its own implicit
 * transaction — no explicit BEGIN IMMEDIATE is needed (and D1 rejects raw transaction
 * SQL statements when called from Workers).
 *
 * @req CAP-01 — enforce max_guests_total hard cap
 * @req CAP-02 — waitlist when enable_waitlist=true and event is full
 * @req CAP-03 — reject with status 'full' when enable_waitlist=false and event is full
 */

export type RsvpInsertData = {
  id: string
  eventId: string
  name: string
  email: string | null
  phone: string | null
  adults: number
  parentsCount: number
  siblingsCount: number
  childrenCount: number
  childrenAges: string      // JSON array string e.g. '[3,5]'
  dietary: string           // JSON array string
  notes: string | null
  answers: string           // JSON object string
  status: 'attending' | 'not_attending' | 'maybe' | 'waitlist'
  rsvpToken: string
  ipHash: string | null
  userAgent: string | null
  clientSubmittedAt: string | null
}

export type CapacityResult =
  | { success: true;  status: 'attending' | 'waitlist' | 'not_attending' | 'maybe'; rsvpId: string; rsvpToken: string }
  | { success: false; status: 'full' }

/**
 * Atomically checks capacity and inserts the RSVP in a single D1 statement.
 *
 * Returns `{ success: true, status: 'attending', rsvpId, rsvpToken }` on normal insert.
 * Returns `{ success: true, status: 'waitlist', rsvpId, rsvpToken }` when full + waitlist enabled.
 * Returns `{ success: false, status: 'full' }` when full + waitlist disabled.
 *
 * When `max_guests_total` is NULL (no cap configured), the conditional INSERT always fires.
 */
export async function checkAndInsertRsvp(
  db: D1Database,
  eventId: string,
  data: RsvpInsertData,
): Promise<CapacityResult> {
  // Fetch event config first — needed for waitlist flag and cap value.
  const event = await db
    .prepare(
      `SELECT max_guests_total, enable_waitlist
         FROM events
        WHERE id = ?
        LIMIT 1`,
    )
    .bind(eventId)
    .first<{ max_guests_total: number | null; enable_waitlist: number }>()

  if (!event) {
    throw new Error(`Event not found: ${eventId}`)
  }

  // For non-capacity-checked statuses (not_attending, maybe), insert directly.
  if (data.status === 'not_attending' || data.status === 'maybe') {
    const result = await db
      .prepare(
        `INSERT INTO rsvps
           (id, event_id, name, email, phone,
            adults, parents_count, siblings_count, children_count, children_ages,
            dietary, notes, answers, status, source, rsvp_token,
            ip_hash, user_agent, client_submitted_at)
         VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?)`,
      )
      .bind(
        data.id, data.eventId, data.name, data.email, data.phone,
        data.adults, data.parentsCount, data.siblingsCount, data.childrenCount, data.childrenAges,
        data.dietary, data.notes, data.answers, data.status, 'web', data.rsvpToken,
        data.ipHash, data.userAgent, data.clientSubmittedAt,
      )
      .run()

    if (!result.success) throw new Error('Insert failed for non-attending RSVP')
    return { success: true, status: data.status, rsvpId: data.id, rsvpToken: data.rsvpToken }
  }

  // For 'attending': use a conditional INSERT that enforces the capacity cap.
  //
  // The WHERE clause inside the SELECT prevents the insert when
  // current_total + party_size would exceed max_guests_total.
  // D1 serializes writes at the API layer so this single statement is atomic.
  const partySize = data.adults + data.parentsCount + data.siblingsCount + data.childrenCount

  const insertResult = await db.prepare(
    `INSERT INTO rsvps
       (id, event_id, name, email, phone,
        adults, parents_count, siblings_count, children_count, children_ages,
        dietary, notes, answers, status, source, rsvp_token,
        ip_hash, user_agent, client_submitted_at)
     SELECT ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?
      WHERE (
        -- No cap configured → always allow
        (SELECT max_guests_total FROM events WHERE id = ?) IS NULL
        OR
        -- Current attending total + this party fits within cap
        (SELECT COALESCE(SUM(party_total), 0)
           FROM rsvps
          WHERE event_id = ?
            AND status = 'attending') + ? <=
        (SELECT max_guests_total FROM events WHERE id = ?)
      )`,
  ).bind(
    data.id, data.eventId, data.name, data.email, data.phone,
    data.adults, data.parentsCount, data.siblingsCount, data.childrenCount, data.childrenAges,
    data.dietary, data.notes, data.answers, 'attending', 'web', data.rsvpToken,
    data.ipHash, data.userAgent, data.clientSubmittedAt,
    // WHERE clause bindings
    eventId, eventId, partySize, eventId,
  ).run()

  if (insertResult.meta.changes > 0) {
    // Row was inserted as 'attending'.
    return { success: true, status: 'attending', rsvpId: data.id, rsvpToken: data.rsvpToken }
  }

  // Insert was skipped → event is at capacity.
  if (event.enable_waitlist) {
    // Insert again as 'waitlist' — no capacity check needed.
    const waitlistResult = await db
      .prepare(
        `INSERT INTO rsvps
           (id, event_id, name, email, phone,
            adults, parents_count, siblings_count, children_count, children_ages,
            dietary, notes, answers, status, source, rsvp_token,
            ip_hash, user_agent, client_submitted_at)
         VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?)`,
      )
      .bind(
        data.id, data.eventId, data.name, data.email, data.phone,
        data.adults, data.parentsCount, data.siblingsCount, data.childrenCount, data.childrenAges,
        data.dietary, data.notes, data.answers, 'waitlist', 'web', data.rsvpToken,
        data.ipHash, data.userAgent, data.clientSubmittedAt,
      )
      .run()

    if (!waitlistResult.success) throw new Error('Insert failed for waitlist RSVP')
    return { success: true, status: 'waitlist', rsvpId: data.id, rsvpToken: data.rsvpToken }
  }

  return { success: false, status: 'full' }
}
