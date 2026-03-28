/**
 * Admin event management — pure domain functions (no CF bindings).
 *
 * @req ADMIN-04 — Event CRUD: create, edit, publish, archive
 */

export type EventInput = {
  title: string
  slug?: string // if not provided, auto-generated
  hostName?: string
  descriptionHtml?: string
  timezone: string
  startAt: string // ISO-8601
  endAt?: string
  locationText?: string
  wishlistUrl?: string
  visibility: 'public' | 'unlisted' | 'private'
  isKidsEvent: boolean
  allowChildren: boolean
  allowSiblings: boolean
  allowParents: boolean
  allowStatusChoice: boolean
  enableWaitlist: boolean
  enableHeuristicDupCheck: boolean
  locale: 'en' | 'fr' | 'es'
  maxGuestsTotal?: number
  maxPartySizePerRsvp: number
  opensAt?: string
  closesAt?: string
  notifyViaEmail: boolean
  notifyViaSms: boolean
  reminderDaysBefore?: number
  questions: string // JSON array string
}

export type EventRow = {
  id: string
  slug: string
  title: string
  host_name: string | null
  description_html: string | null
  timezone: string
  start_at: string
  end_at: string | null
  location_text: string | null
  wishlist_url: string | null
  visibility: string
  access_token: string | null
  is_kids_event: number
  allow_children: number
  allow_siblings: number
  allow_parents: number
  allow_status_choice: number
  enable_waitlist: number
  enable_heuristic_dup_check: number
  locale: string
  max_guests_total: number | null
  max_party_size_per_rsvp: number
  opens_at: string | null
  closes_at: string | null
  status: string
  notify_via_email: number
  notify_via_sms: number
  reminder_days_before: number | null
  questions: string
  threshold_80_notified_at: string | null
  threshold_100_notified_at: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

/**
 * Generate a URL-friendly slug from a title.
 * Converts to lowercase, replaces spaces/special chars with hyphens, trims.
 */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'event'
  )
}

/**
 * Find a unique slug by appending -2, -3 etc. if the base slug already exists.
 */
export async function generateUniqueSlug(
  db: D1Database,
  baseSlug: string,
  excludeId?: string,
): Promise<string> {
  let candidate = baseSlug
  let n = 2
  while (true) {
    const existing = await db
      .prepare('SELECT id FROM events WHERE slug = ? AND (? IS NULL OR id != ?) LIMIT 1')
      .bind(candidate, excludeId ?? null, excludeId ?? null)
      .first<{ id: string }>()
    if (!existing) return candidate
    candidate = `${baseSlug}-${n++}`
  }
}

/**
 * Create a new event. Returns the new event id.
 */
export async function createEvent(db: D1Database, input: EventInput): Promise<string> {
  const id = crypto.randomUUID()
  const baseSlug = input.slug ? slugify(input.slug) : slugify(input.title)
  const slug = await generateUniqueSlug(db, baseSlug)
  const now = new Date().toISOString()

  await db
    .prepare(
      `
    INSERT INTO events (
      id, slug, title, host_name, description_html, timezone,
      start_at, end_at, location_text, wishlist_url,
      visibility, is_kids_event, allow_children, allow_siblings, allow_parents,
      allow_status_choice, enable_waitlist, enable_heuristic_dup_check,
      locale, max_guests_total, max_party_size_per_rsvp,
      opens_at, closes_at, status,
      notify_via_email, notify_via_sms, reminder_days_before,
      questions, created_at, updated_at
    ) VALUES (
      ?,?,?,?,?,?, ?,?,?,?,
      ?,?,?,?,?,
      ?,?,?,
      ?,?,?,
      ?,?,'draft',
      ?,?,?,
      ?,?,?
    )
  `,
    )
    .bind(
      id,
      slug,
      input.title,
      input.hostName ?? null,
      input.descriptionHtml ?? null,
      input.timezone,
      input.startAt,
      input.endAt ?? null,
      input.locationText ?? null,
      input.wishlistUrl ?? null,
      input.visibility,
      input.isKidsEvent ? 1 : 0,
      input.allowChildren ? 1 : 0,
      input.allowSiblings ? 1 : 0,
      input.allowParents ? 1 : 0,
      input.allowStatusChoice ? 1 : 0,
      input.enableWaitlist ? 1 : 0,
      input.enableHeuristicDupCheck ? 1 : 0,
      input.locale,
      input.maxGuestsTotal ?? null,
      input.maxPartySizePerRsvp,
      input.opensAt ?? null,
      input.closesAt ?? null,
      input.notifyViaEmail ? 1 : 0,
      input.notifyViaSms ? 1 : 0,
      input.reminderDaysBefore ?? null,
      input.questions,
      now,
      now,
    )
    .run()

  return id
}

/**
 * Get a single event by id.
 */
export async function getEvent(db: D1Database, id: string): Promise<EventRow | null> {
  return db.prepare('SELECT * FROM events WHERE id = ? LIMIT 1').bind(id).first<EventRow>()
}

/**
 * Get a single event by slug.
 */
export async function getEventBySlug(db: D1Database, slug: string): Promise<EventRow | null> {
  return db.prepare('SELECT * FROM events WHERE slug = ? LIMIT 1').bind(slug).first<EventRow>()
}

/**
 * List all events ordered by start_at descending.
 */
export async function listEvents(db: D1Database): Promise<EventRow[]> {
  const result = await db
    .prepare('SELECT * FROM events WHERE archived_at IS NULL ORDER BY start_at DESC')
    .all<EventRow>()
  return result.results
}

/**
 * Update an existing event. Only provided fields are updated.
 */
export async function updateEvent(
  db: D1Database,
  id: string,
  input: Partial<EventInput>,
): Promise<void> {
  const now = new Date().toISOString()
  const sets: string[] = ['updated_at = ?']
  const binds: unknown[] = [now]

  if (input.title !== undefined) {
    sets.push('title = ?')
    binds.push(input.title)
  }
  if (input.hostName !== undefined) {
    sets.push('host_name = ?')
    binds.push(input.hostName)
  }
  if (input.descriptionHtml !== undefined) {
    sets.push('description_html = ?')
    binds.push(input.descriptionHtml)
  }
  if (input.timezone !== undefined) {
    sets.push('timezone = ?')
    binds.push(input.timezone)
  }
  if (input.startAt !== undefined) {
    sets.push('start_at = ?')
    binds.push(input.startAt)
  }
  if (input.endAt !== undefined) {
    sets.push('end_at = ?')
    binds.push(input.endAt)
  }
  if (input.locationText !== undefined) {
    sets.push('location_text = ?')
    binds.push(input.locationText)
  }
  if (input.wishlistUrl !== undefined) {
    sets.push('wishlist_url = ?')
    binds.push(input.wishlistUrl)
  }
  if (input.visibility !== undefined) {
    sets.push('visibility = ?')
    binds.push(input.visibility)
  }
  if (input.isKidsEvent !== undefined) {
    sets.push('is_kids_event = ?')
    binds.push(input.isKidsEvent ? 1 : 0)
  }
  if (input.allowChildren !== undefined) {
    sets.push('allow_children = ?')
    binds.push(input.allowChildren ? 1 : 0)
  }
  if (input.allowSiblings !== undefined) {
    sets.push('allow_siblings = ?')
    binds.push(input.allowSiblings ? 1 : 0)
  }
  if (input.allowParents !== undefined) {
    sets.push('allow_parents = ?')
    binds.push(input.allowParents ? 1 : 0)
  }
  if (input.allowStatusChoice !== undefined) {
    sets.push('allow_status_choice = ?')
    binds.push(input.allowStatusChoice ? 1 : 0)
  }
  if (input.enableWaitlist !== undefined) {
    sets.push('enable_waitlist = ?')
    binds.push(input.enableWaitlist ? 1 : 0)
  }
  if (input.enableHeuristicDupCheck !== undefined) {
    sets.push('enable_heuristic_dup_check = ?')
    binds.push(input.enableHeuristicDupCheck ? 1 : 0)
  }
  if (input.locale !== undefined) {
    sets.push('locale = ?')
    binds.push(input.locale)
  }
  if (input.maxGuestsTotal !== undefined) {
    sets.push('max_guests_total = ?')
    binds.push(input.maxGuestsTotal)
  }
  if (input.maxPartySizePerRsvp !== undefined) {
    sets.push('max_party_size_per_rsvp = ?')
    binds.push(input.maxPartySizePerRsvp)
  }
  if (input.opensAt !== undefined) {
    sets.push('opens_at = ?')
    binds.push(input.opensAt)
  }
  if (input.closesAt !== undefined) {
    sets.push('closes_at = ?')
    binds.push(input.closesAt)
  }
  if (input.notifyViaEmail !== undefined) {
    sets.push('notify_via_email = ?')
    binds.push(input.notifyViaEmail ? 1 : 0)
  }
  if (input.notifyViaSms !== undefined) {
    sets.push('notify_via_sms = ?')
    binds.push(input.notifyViaSms ? 1 : 0)
  }
  if (input.reminderDaysBefore !== undefined) {
    sets.push('reminder_days_before = ?')
    binds.push(input.reminderDaysBefore)
  }
  if (input.questions !== undefined) {
    sets.push('questions = ?')
    binds.push(input.questions)
  }

  binds.push(id)
  await db
    .prepare(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run()
}

/**
 * Publish an event (set status = 'published').
 */
export async function publishEvent(db: D1Database, id: string): Promise<void> {
  const now = new Date().toISOString()
  await db
    .prepare("UPDATE events SET status = 'published', updated_at = ? WHERE id = ?")
    .bind(now, id)
    .run()
}

/**
 * Archive an event (set status = 'archived', archived_at = now).
 */
export async function archiveEvent(db: D1Database, id: string): Promise<void> {
  const now = new Date().toISOString()
  await db
    .prepare("UPDATE events SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, id)
    .run()
}

export type EventStats = {
  total: number
  attending: number
  waitlist: number
  not_attending: number
  maybe: number
  capacity: number | null
}

/**
 * Get RSVP stats for an event.
 */
export async function getEventStats(db: D1Database, eventId: string): Promise<EventStats> {
  const event = await db
    .prepare('SELECT max_guests_total FROM events WHERE id = ?')
    .bind(eventId)
    .first<{ max_guests_total: number | null }>()
  const rows = await db
    .prepare(
      `SELECT status, COALESCE(SUM(party_total), 0) as count FROM rsvps WHERE event_id = ? GROUP BY status`,
    )
    .bind(eventId)
    .all<{ status: string; count: number }>()

  const byStatus: Record<string, number> = {}
  for (const r of rows.results) byStatus[r.status] = Number(r.count)

  return {
    total: Object.values(byStatus).reduce((s, v) => s + v, 0),
    attending: byStatus['attending'] ?? 0,
    waitlist: byStatus['waitlist'] ?? 0,
    not_attending: byStatus['not_attending'] ?? 0,
    maybe: byStatus['maybe'] ?? 0,
    capacity: event?.max_guests_total ?? null,
  }
}
