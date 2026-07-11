// app/src/domain/adminInvites.ts
/**
 * Admin invitation domain functions for multi-user admin provisioning.
 *
 * All functions are pure (accept D1Database or primitives) — no HTTP/CF concerns.
 * Mirrors the passwordResetTokens pattern: token is generated once, hash is stored,
 * raw token is sent once via email and never stored again.
 *
 * @req ADMIN-03 — Admin invite creation with role selection, email delivery
 */
import { hashToken } from './adminAuth'

/**
 * Creates an admin invite token and persists it to the database.
 * Stores role so the invited user's account is created with the selected role.
 *
 * Returns the raw token (sent once via email; never stored).
 */
export async function createInvite(
  db: D1Database,
  email: string,
  role: 'owner' | 'editor',
  expiryMinutes: number,
): Promise<string> {
  const rawToken = crypto.randomUUID()
  const tokenHash = await hashToken(rawToken)
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString()

  await db
    .prepare(
      `INSERT INTO admin_invites (id, email, role, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(crypto.randomUUID(), email.toLowerCase(), role, tokenHash, expiresAt)
    .run()

  return rawToken
}

/**
 * Consumes an admin invite token.
 * Returns { email, role } on success, null if token is invalid, expired, or already used.
 * On success, marks the invite as used (used_at = now).
 *
 * Uses a single conditional UPDATE (C-12 pattern): check and write happen atomically
 * at the D1 API layer, preventing two concurrent calls with the same token both
 * succeeding. The follow-up SELECT is keyed by token_hash (not email — mirrors
 * consumeResetToken's token_hash lookup in adminAuth.ts) so a second invite sent
 * to the same email address can never make this resolve to the wrong role.
 */
export async function consumeInvite(
  db: D1Database,
  rawToken: string,
): Promise<{ email: string; role: 'owner' | 'editor' } | null> {
  const tokenHash = await hashToken(rawToken)
  const now = new Date().toISOString()

  // Single UPDATE: mark as used only if still valid and unused
  const claim = await db
    .prepare(
      `UPDATE admin_invites SET used_at = ?
       WHERE token_hash = ? AND expires_at > ? AND used_at IS NULL`,
    )
    .bind(now, tokenHash, now)
    .run()

  if (claim.meta.changes === 0) return null

  // Fetch the email/role for the exact invite just consumed
  const row = await db
    .prepare('SELECT email, role FROM admin_invites WHERE token_hash = ? LIMIT 1')
    .bind(tokenHash)
    .first<{ email: string; role: 'owner' | 'editor' }>()

  return row ? { email: row.email, role: row.role } : null
}
