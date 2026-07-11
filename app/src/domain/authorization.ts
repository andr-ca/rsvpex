/**
 * Appends a WHERE clause fragment for event ownership filtering in hosts.
 * Owner/Editor have no ownership restrictions (global visibility).
 * Hosts see only events they created (created_by = <adminUserId>).
 * Legacy events with created_by = NULL are invisible to hosts.
 *
 * Usage (for list queries):
 *   const role = await getAdminRole(db, adminUserId);
 *   const filter = appendOwnershipFilter(role, adminUserId, 'events');
 *   const sql = `SELECT * FROM events WHERE archived_at IS NULL ${filter}`;
 *   // For hosts, bind adminUserId; for owner/editor, bind nothing (no ? in filter)
 *
 * @req AUTH-01 — Strict equality for host ownership (no NULL match)
 * @param role User's role ('owner', 'editor', 'host')
 * @param adminUserId Admin user ID (used only for hosts)
 * @param tableAlias Table alias or name (default 'events')
 * @returns WHERE clause fragment: '' for owner/editor, 'AND (table.created_by = ?)' for host
 */
export function appendOwnershipFilter(
  role: 'owner' | 'editor' | 'host',
  adminUserId: string,
  tableAlias: string = 'events',
): string {
  if (role === 'owner' || role === 'editor') {
    return '' // No filter — see all events
  }
  // role === 'host'
  // Important: NO 'OR created_by IS NULL' — hosts NEVER see legacy unowned events
  return `AND (${tableAlias}.created_by = ?)`
}

/**
 * Verifies event ownership for a host.
 * Owner/Editor always have access (returns true immediately).
 * Hosts have access ONLY if event.created_by === adminUserId (strict equality).
 * Legacy events (created_by IS NULL) return false for hosts.
 *
 * Usage (early in route handler, after fetching event):
 *   const role = await getAdminRole(c.env.DB, c.var.adminUserId);
 *   const owns = await verifyEventOwnership(c.env.DB, eventId, c.var.adminUserId, role);
 *   if (!owns) return c.notFound(); // 404, not 403 — don't reveal event exists
 *
 * @req AUTH-01 — Strict equality for host ownership (no NULL match)
 * @param db D1Database binding
 * @param eventId Event ID to check
 * @param adminUserId Admin user ID (used only for hosts)
 * @param role User's role
 * @returns true if owner/editor, or if host owns the event; false otherwise
 */
export async function verifyEventOwnership(
  db: D1Database,
  eventId: string,
  adminUserId: string,
  role: 'owner' | 'editor' | 'host',
): Promise<boolean> {
  if (role === 'owner' || role === 'editor') {
    return true // No check needed — owner/editor see all events
  }

  // role === 'host'
  const event = await db
    .prepare('SELECT created_by FROM events WHERE id = ?')
    .bind(eventId)
    .first<{ created_by: string | null }>()

  if (!event) {
    return false // Event doesn't exist
  }

  // STRICT EQUALITY ONLY — hosts NEVER match NULL created_by (legacy events)
  return event.created_by === adminUserId
}
