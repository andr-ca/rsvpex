// app/src/domain/adminAuth.ts
/**
 * Admin authentication domain functions.
 *
 * All functions are pure (accept D1Database or primitives) — no HTTP/CF concerns.
 * Runs in Workers runtime: crypto.subtle available globally; @noble/hashes for argon2id.
 *
 * @req ADMIN-01 — argon2id login; lockout after 5 failed attempts (15 min)
 * @req ADMIN-02 — session creation/lookup/deletion; password reset tokens
 */
import { argon2id } from '@noble/hashes/argon2.js'
import { utf8ToBytes, bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

const ARGON2_M = 19456 // memory in KiB (OWASP minimum)
const ARGON2_T = 2 // iterations
const ARGON2_P = 1 // parallelism (Workers: single-threaded)
const LOCKOUT_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

// Fallback pepper used only when ARGON2_PEPPER isn't configured (local
// dev/tests). Production MUST set ARGON2_PEPPER via `wrangler secret put` —
// see S-11 in recommendations.md. A pepper protects against offline
// cracking of a leaked `admin_users` table alone (unlike the per-hash salt,
// it never leaves the Worker).
const FALLBACK_PEPPER = 'rsvpex-argon2-fallback-pepper-set-ARGON2_PEPPER-in-production'

export type SessionRow = {
  id: string
  admin_user_id: string
  expires_at: string
  created_at: string
}

/**
 * Hashes a plaintext password using argon2id at OWASP minimum params.
 * Returns a "salt_hex:hash_hex" string so verification can re-derive.
 *
 * @param pepper - Env.ARGON2_PEPPER; falls back to a fixed pepper if unset
 */
export async function hashPassword(password: string, pepper?: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const hashBytes = argon2id(utf8ToBytes((pepper || FALLBACK_PEPPER) + password), salt, {
    m: ARGON2_M,
    t: ARGON2_T,
    p: ARGON2_P,
    version: 0x13, // argon2id v1.3
    dkLen: 32,
  })
  return `${bytesToHex(salt)}:${bytesToHex(hashBytes)}`
}

/**
 * Verifies a plaintext password against a stored hash string.
 *
 * @param pepper - Env.ARGON2_PEPPER; falls back to a fixed pepper if unset
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  pepper?: string,
): Promise<boolean> {
  try {
    const [saltHex, hashHex] = storedHash.split(':')
    if (!saltHex || !hashHex) return false
    const salt = hexToBytes(saltHex)
    const expected = hexToBytes(hashHex)
    const actual = argon2id(utf8ToBytes((pepper || FALLBACK_PEPPER) + password), salt, {
      m: ARGON2_M,
      t: ARGON2_T,
      p: ARGON2_P,
      version: 0x13,
      dkLen: 32,
    })
    // Constant-time comparison
    if (actual.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
    return diff === 0
  } catch {
    return false
  }
}

/**
 * Checks if an account is currently locked out.
 * Returns { locked: false } or { locked: true, retryAfterSeconds: N }.
 */
export function checkLockout(
  failedAttempts: number,
  lockedUntil: string | null,
): { locked: boolean; retryAfterSeconds?: number } {
  if (!lockedUntil) return { locked: false }
  const lockedUntilMs = new Date(lockedUntil).getTime()
  const now = Date.now()
  if (lockedUntilMs <= now) return { locked: false }
  return { locked: true, retryAfterSeconds: Math.ceil((lockedUntilMs - now) / 1000) }
}

/**
 * Increments failed login attempts. Sets locked_until on the 5th failure.
 */
export async function recordFailedAttempt(db: D1Database, userId: string): Promise<void> {
  const row = await db
    .prepare('SELECT failed_login_attempts FROM admin_users WHERE id = ?')
    .bind(userId)
    .first<{ failed_login_attempts: number }>()

  const newCount = (row?.failed_login_attempts ?? 0) + 1
  if (newCount >= LOCKOUT_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
    await db
      .prepare('UPDATE admin_users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?')
      .bind(newCount, lockedUntil, userId)
      .run()
  } else {
    await db
      .prepare('UPDATE admin_users SET failed_login_attempts = ? WHERE id = ?')
      .bind(newCount, userId)
      .run()
  }
}

/**
 * Clears lockout state on successful login or password reset.
 */
export async function clearLockout(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare('UPDATE admin_users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?')
    .bind(userId)
    .run()
}

/**
 * Generates a 32-byte random session token, hex-encoded (64 chars). Higher
 * entropy than crypto.randomUUID() (122 bits) and matches the recommended
 * fix for S-15 in recommendations.md.
 */
function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Creates a new session for the given admin user.
 *
 * Only SHA-256(token) is stored in D1 (S-15 in recommendations.md): a
 * plaintext session table is a bearer-credential leak waiting to happen —
 * anyone with read access to a D1 backup/export could impersonate any
 * logged-in admin. Hashing means a DB read-leak alone isn't enough; the
 * attacker still needs the raw cookie value, which never touches storage.
 *
 * Returns the raw token (used as the cookie value) — never store this
 * anywhere else.
 */
export async function createSession(
  db: D1Database,
  adminUserId: string,
  expiryDays: number,
): Promise<string> {
  const rawToken = generateSessionToken()
  const tokenHash = await hashToken(rawToken)
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
  await db
    .prepare('INSERT INTO sessions (id, admin_user_id, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, adminUserId, expiresAt)
    .run()
  return rawToken
}

/**
 * Retrieves a valid (non-expired) session by raw cookie token.
 * Returns null if session does not exist or has expired.
 */
export async function getSession(db: D1Database, rawToken: string): Promise<SessionRow | null> {
  const tokenHash = await hashToken(rawToken)
  const now = new Date().toISOString()
  return db
    .prepare(
      'SELECT id, admin_user_id, expires_at, created_at FROM sessions WHERE id = ? AND expires_at > ?',
    )
    .bind(tokenHash, now)
    .first<SessionRow>()
}

/**
 * Deletes a session (logout) by raw cookie token.
 */
export async function deleteSession(db: D1Database, rawToken: string): Promise<void> {
  const tokenHash = await hashToken(rawToken)
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(tokenHash).run()
}

/**
 * Hashes a raw token string with SHA-256, returns hex.
 * Used for storing reset tokens — raw token is sent once via email.
 */
export async function hashToken(rawToken: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(rawToken)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Creates a password reset token. Stores the token_hash in D1.
 * Returns the raw token (sent once via email; never stored).
 */
export async function createResetToken(
  db: D1Database,
  adminUserId: string,
  expiryMinutes: number,
): Promise<string> {
  const rawToken = crypto.randomUUID()
  const tokenHash = await hashToken(rawToken)
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString()
  await db
    .prepare(
      'INSERT INTO password_reset_tokens (id, admin_user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    )
    .bind(crypto.randomUUID(), adminUserId, tokenHash, expiresAt)
    .run()
  return rawToken
}

/**
 * Consumes a password reset token.
 * Returns the admin_user_id on success.
 * Returns null if token not found, expired, or already used.
 * On success, marks token as used (used_at = now).
 *
 * The check and the write happen in a SINGLE conditional UPDATE (C-12 in
 * recommendations.md): the previous read-then-update let two concurrent uses
 * of the same token both pass the "not yet used" check and both succeed.
 */
export async function consumeResetToken(
  db: D1Database,
  rawToken: string,
): Promise<{ adminUserId: string } | null> {
  const tokenHash = await hashToken(rawToken)
  const now = new Date().toISOString()

  const claim = await db
    .prepare(
      `UPDATE password_reset_tokens SET used_at = ?
        WHERE token_hash = ? AND expires_at > ? AND used_at IS NULL`,
    )
    .bind(now, tokenHash, now)
    .run()

  if (claim.meta.changes === 0) return null

  const row = await db
    .prepare('SELECT admin_user_id FROM password_reset_tokens WHERE token_hash = ? LIMIT 1')
    .bind(tokenHash)
    .first<{ admin_user_id: string }>()

  return row ? { adminUserId: row.admin_user_id } : null
}

/**
 * Deletes all sessions for an admin user — used after password reset (S-6 in
 * recommendations.md: previously a reset didn't invalidate existing sessions,
 * so "my password was compromised" didn't actually kick out the attacker).
 */
export async function deleteAllSessionsForUser(db: D1Database, adminUserId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE admin_user_id = ?').bind(adminUserId).run()
}
