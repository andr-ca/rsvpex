/**
 * Admin RSVP management — pure domain functions (no CF bindings).
 *
 * @req ADMIN-05 — RSVP list with filters and pagination
 * @req ADMIN-10 — Waitlist promotion with transactional capacity recheck
 * @req GAP-04 — Admin edit capacity guard (same D1 atomic pattern as public submit)
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
  source: string
  rsvp_token: string
  submitted_at: string
  party_total: number
  created_at: string
  updated_at: string
}

export type RsvpListFilters = {
  status?: 'attending' | 'waitlist' | 'not_attending' | 'maybe'
  nameSearch?: string
  dateFrom?: string
  dateTo?: string
  page: number
  perPage: number
}

export type RsvpListResult = {
  rsvps: RsvpRow[]
  total: number
  page: number
  perPage: number
  totalPages: number
}

/**
 * List RSVPs for an event with optional filters and pagination.
 */
export async function listRsvps(
  db: D1Database,
  eventId: string,
  filters: RsvpListFilters,
): Promise<RsvpListResult> {
  const conditions: string[] = ['event_id = ?']
  const binds: unknown[] = [eventId]

  if (filters.status) {
    conditions.push('status = ?')
    binds.push(filters.status)
  }
  if (filters.nameSearch) {
    conditions.push('name LIKE ?')
    binds.push(`%${filters.nameSearch}%`)
  }
  if (filters.dateFrom) {
    conditions.push('submitted_at >= ?')
    binds.push(filters.dateFrom)
  }
  if (filters.dateTo) {
    conditions.push('submitted_at <= ?')
    binds.push(filters.dateTo)
  }

  const where = conditions.join(' AND ')
  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM rsvps WHERE ${where}`)
    .bind(...binds)
    .first<{ total: number }>()
  const total = countResult?.total ?? 0

  const offset = (filters.page - 1) * filters.perPage
  const rows = await db
    .prepare(`SELECT * FROM rsvps WHERE ${where} ORDER BY submitted_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, filters.perPage, offset)
    .all<RsvpRow>()

  return {
    rsvps: rows.results,
    total,
    page: filters.page,
    perPage: filters.perPage,
    totalPages: Math.ceil(total / filters.perPage),
  }
}

/**
 * Get a single RSVP by id.
 */
export async function getRsvp(db: D1Database, id: string): Promise<RsvpRow | null> {
  return db.prepare('SELECT * FROM rsvps WHERE id = ? LIMIT 1').bind(id).first<RsvpRow>()
}

export type RsvpEditInput = {
  name?: string
  email?: string | null
  phone?: string | null
  adults?: number
  parentsCount?: number
  siblingsCount?: number
  childrenCount?: number
  childrenAges?: string
  dietary?: string
  notes?: string | null
  answers?: string
  status?: 'attending' | 'not_attending' | 'maybe' | 'waitlist'
}

export type AdminEditResult =
  | { success: true }
  | { success: false; reason: 'capacity_exceeded'; current: number; capacity: number }

/**
 * Update an RSVP. If the status changes to/from 'attending' or party size increases,
 * performs a transactional capacity recheck using the same atomic pattern as the
 * public submit path.
 *
 * @req GAP-04
 */
export async function updateRsvpWithCapacityGuard(
  db: D1Database,
  rsvpId: string,
  input: RsvpEditInput,
): Promise<AdminEditResult> {
  const existing = await getRsvp(db, rsvpId)
  if (!existing) throw new Error(`RSVP not found: ${rsvpId}`)

  const newPartyTotal =
    (input.adults ?? existing.adults) +
    (input.parentsCount ?? existing.parents_count) +
    (input.siblingsCount ?? existing.siblings_count) +
    (input.childrenCount ?? existing.children_count)

  const newStatus = input.status ?? existing.status
  const oldPartyTotal = existing.party_total
  const oldStatus = existing.status

  // Capacity check needed if: becoming 'attending' from non-attending, or party total increases while attending
  const needsCapacityCheck =
    (newStatus === 'attending' && oldStatus !== 'attending') ||
    (newStatus === 'attending' && oldStatus === 'attending' && newPartyTotal > oldPartyTotal)

  if (needsCapacityCheck) {
    const event = await db
      .prepare('SELECT max_guests_total FROM events WHERE id = ? LIMIT 1')
      .bind(existing.event_id)
      .first<{ max_guests_total: number | null }>()

    if (event?.max_guests_total != null) {
      // Current attending total EXCLUDING this RSVP's old contribution
      const otherAttending = await db
        .prepare(
          `SELECT COALESCE(SUM(party_total), 0) as total FROM rsvps
           WHERE event_id = ? AND status = 'attending' AND id != ?`,
        )
        .bind(existing.event_id, rsvpId)
        .first<{ total: number }>()

      const currentOtherTotal = Number(otherAttending?.total ?? 0)
      if (currentOtherTotal + newPartyTotal > event.max_guests_total) {
        return {
          success: false,
          reason: 'capacity_exceeded',
          current: currentOtherTotal + (oldStatus === 'attending' ? oldPartyTotal : 0),
          capacity: event.max_guests_total,
        }
      }
    }
  }

  // Perform the update
  const now = new Date().toISOString()
  const sets: string[] = ['updated_at = ?']
  const binds: unknown[] = [now]

  if (input.name !== undefined) {
    sets.push('name = ?')
    binds.push(input.name)
  }
  if (input.email !== undefined) {
    sets.push('email = ?')
    binds.push(input.email)
  }
  if (input.phone !== undefined) {
    sets.push('phone = ?')
    binds.push(input.phone)
  }
  if (input.adults !== undefined) {
    sets.push('adults = ?')
    binds.push(input.adults)
  }
  if (input.parentsCount !== undefined) {
    sets.push('parents_count = ?')
    binds.push(input.parentsCount)
  }
  if (input.siblingsCount !== undefined) {
    sets.push('siblings_count = ?')
    binds.push(input.siblingsCount)
  }
  if (input.childrenCount !== undefined) {
    sets.push('children_count = ?')
    binds.push(input.childrenCount)
  }
  if (input.childrenAges !== undefined) {
    sets.push('children_ages = ?')
    binds.push(input.childrenAges)
  }
  if (input.dietary !== undefined) {
    sets.push('dietary = ?')
    binds.push(input.dietary)
  }
  if (input.notes !== undefined) {
    sets.push('notes = ?')
    binds.push(input.notes)
  }
  if (input.answers !== undefined) {
    sets.push('answers = ?')
    binds.push(input.answers)
  }
  if (input.status !== undefined) {
    sets.push('status = ?')
    binds.push(input.status)
  }

  binds.push(rsvpId)
  await db
    .prepare(`UPDATE rsvps SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run()
  return { success: true }
}

export type PromoteResult =
  | { success: true }
  | { success: false; reason: 'no_capacity' }
  | { success: false; reason: 'not_waitlisted' }

/**
 * Promote a waitlisted guest to 'attending' with a transactional capacity recheck.
 * Uses the same conditional UPDATE pattern as the capacity domain.
 *
 * @req ADMIN-10
 */
export async function promoteFromWaitlist(db: D1Database, rsvpId: string): Promise<PromoteResult> {
  const rsvp = await getRsvp(db, rsvpId)
  if (!rsvp || rsvp.status !== 'waitlist') return { success: false, reason: 'not_waitlisted' }

  const event = await db
    .prepare('SELECT max_guests_total FROM events WHERE id = ? LIMIT 1')
    .bind(rsvp.event_id)
    .first<{ max_guests_total: number | null }>()

  // If no capacity cap, promote directly
  if (!event?.max_guests_total) {
    const now = new Date().toISOString()
    await db
      .prepare("UPDATE rsvps SET status = 'attending', updated_at = ? WHERE id = ?")
      .bind(now, rsvpId)
      .run()
    return { success: true }
  }

  // Atomic conditional UPDATE: only promote if capacity allows
  const now = new Date().toISOString()
  const result = await db
    .prepare(
      `
    UPDATE rsvps SET status = 'attending', updated_at = ?
    WHERE id = ?
      AND (
        SELECT COALESCE(SUM(party_total), 0)
          FROM rsvps r2
         WHERE r2.event_id = ? AND r2.status = 'attending'
      ) + ? <= (SELECT max_guests_total FROM events WHERE id = ?)
  `,
    )
    .bind(now, rsvpId, rsvp.event_id, rsvp.party_total, rsvp.event_id)
    .run()

  if (result.meta.changes === 0) return { success: false, reason: 'no_capacity' }
  return { success: true }
}

/**
 * Delete an RSVP.
 */
export async function deleteRsvp(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM rsvps WHERE id = ?').bind(id).run()
}
