// app/src/domain/audit.ts
/**
 * Pure domain functions for audit logging.
 * No CF bindings except D1Database passed in.
 *
 * @req SEC-04 — audit log write path with PII-redacted diffs; 365-day purge
 */

export type AuditEntry = {
  actorId: string | null
  entityType: string
  entityId: string
  action: string
  diff: Record<string, unknown> | null
}

/**
 * Redact PII fields (email, phone) by replacing them with the first 8 hex
 * characters of their SHA-256 hash. Other fields are passed through unchanged.
 */
export async function redactPii(obj: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if ((key === 'email' || key === 'phone') && typeof value === 'string') {
      result[key] = await sha256prefix(value)
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Build a JSON Merge Patch diff (RFC 7396) between two plain objects.
 * Returns only the keys that changed (value in `after` differs from `before`).
 */
export function buildDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {}
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of allKeys) {
    const bv = before[key]
    const av = after[key]
    // Shallow equality check — sufficient for flat audit diffs
    if (bv !== av) {
      diff[key] = av
    }
  }
  return diff
}

/**
 * Write an audit log entry to the audit_logs table.
 * Uses INSERT (not INSERT OR IGNORE) — each action should produce a row.
 *
 * @req SEC-04
 */
export async function writeAuditLog(db: D1Database, entry: AuditEntry): Promise<void> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      'INSERT INTO audit_logs (id, actor_id, entity_type, entity_id, action, diff_json) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(
      id,
      entry.actorId,
      entry.entityType,
      entry.entityId,
      entry.action,
      entry.diff !== null ? JSON.stringify(entry.diff) : null,
    )
    .run()
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sha256prefix(value: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(value)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, 8)
}
