// app/src/domain/adminAuth.ts
/**
 * Admin authentication domain functions.
 *
 * All functions are pure (accept D1Database or primitives) — no HTTP/CF concerns.
 * Runs in Workers runtime: crypto.subtle available globally.
 *
 * Password hashing uses PBKDF2-HMAC-SHA256 via WebCrypto, not argon2id
 * (switched from the pure-JS @noble/hashes argon2id used through initial
 * production launch): argon2id has no hardware acceleration in a JS
 * implementation, and even at OWASP-minimum cost params (m=19456, t=2) it
 * measured well past 200ms CPU on a cold isolate — over 20x the Workers
 * Free plan's 10ms budget and still past the 50ms paid-plan budget. It
 * failed in production with "Worker exceeded CPU time limit" on the very
 * first real admin-setup request. PBKDF2 via crypto.subtle is natively
 * hardware-accelerated, so it comfortably fits the CPU budget on every
 * plan tier. Made before any real admin account existed in production, so
 * there was no existing hash format to migrate.
 *
 * Iteration count is capped at 100,000, not OWASP's 2023-recommended
 * 600,000 — Cloudflare's WebCrypto PBKDF2 implementation hard-rejects
 * anything above 100,000 ("NotSupportedError: iteration counts above
 * 100000 are not supported"), confirmed by an actual 500 in production
 * when this was first set to 600,000. 100,000 is still well above NIST
 * SP 800-63B's 10,000 minimum and OWASP's older (pre-2023) 100,000
 * recommendation for PBKDF2-HMAC-SHA256, combined with a secret pepper
 * and the existing 5-attempt account lockout.
 *
 * @req ADMIN-01 — PBKDF2 login; lockout after 5 failed attempts (15 min)
 * @req ADMIN-02 — session creation/lookup/deletion; password reset tokens
 */
const PBKDF2_ITERATIONS = 100_000 // Cloudflare Workers' hard cap for WebCrypto PBKDF2
const LOCKOUT_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

// Fallback pepper used only when ARGON2_PEPPER isn't configured (local
// dev/tests). Production MUST set ARGON2_PEPPER via `wrangler secret put` —
// see S-11 in recommendations.md. A pepper protects against offline
// cracking of a leaked `admin_users` table alone (unlike the per-hash salt,
// it never leaves the Worker). Env var name kept as ARGON2_PEPPER (not
// renamed to e.g. PASSWORD_PEPPER) to avoid a secret-rename step alongside
// the hash-algorithm switch — it's just "the pepper mixed into the admin
// password hash," independent of which KDF is used.
const FALLBACK_PEPPER = 'rsvpex-argon2-fallback-pepper-set-ARGON2_PEPPER-in-production'

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/** Derives a 32-byte PBKDF2-HMAC-SHA256 key from (pepper + password) and salt. */
async function deriveKey(
  password: string,
  pepper: string | undefined,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode((pepper || FALLBACK_PEPPER) + password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return new Uint8Array(derivedBits)
}

export type SessionRow = {
  id: string
  admin_user_id: string
  expires_at: string
  created_at: string
}

/**
 * Hashes a plaintext password using PBKDF2-HMAC-SHA256 (600,000 iterations).
 * Returns a "salt_hex:hash_hex" string so verification can re-derive.
 *
 * @param pepper - Env.ARGON2_PEPPER; falls back to a fixed pepper if unset
 */
export async function hashPassword(password: string, pepper?: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const hashBytes = await deriveKey(password, pepper, salt)
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
    const actual = await deriveKey(password, pepper, salt)
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
