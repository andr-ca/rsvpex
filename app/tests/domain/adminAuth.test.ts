// app/tests/domain/adminAuth.test.ts
/**
 * @req ADMIN-01 — argon2id login; lockout after 5 failed attempts
 * @req ADMIN-02 — session creation, session lookup, session deletion
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import {
  hashPassword,
  verifyPassword,
  checkLockout,
  recordFailedAttempt,
  clearLockout,
  createSession,
  getSession,
  deleteSession,
} from '../../src/domain/adminAuth'

const SESSION_EXPIRY_DAYS = 7

describe('hashPassword / verifyPassword', () => {
  it('hashes a password and verifies it correctly', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(hash).toBeTruthy()
    expect(hash).not.toBe('correct-horse-battery-staple')
    const ok = await verifyPassword('correct-horse-battery-staple', hash)
    expect(ok).toBe(true)
  })

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('right-password')
    const ok = await verifyPassword('wrong-password', hash)
    expect(ok).toBe(false)
  })

  it('completes within 5000ms (argon2id CPU budget; Miniflare is slower than prod)', async () => {
    const start = Date.now()
    await hashPassword('benchmark-password')
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(5000) // Miniflare ~1.5s; prod Workers target is <200ms CPU
  })
})

describe('checkLockout', () => {
  it('returns not locked when attempts < 5', () => {
    const result = checkLockout(3, null)
    expect(result.locked).toBe(false)
  })

  it('returns locked when locked_until is in the future', () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const result = checkLockout(5, future)
    expect(result.locked).toBe(true)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('returns not locked when locked_until is in the past', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const result = checkLockout(5, past)
    expect(result.locked).toBe(false)
  })
})

describe('recordFailedAttempt', () => {
  it('increments failed_login_attempts', async () => {
    const userId = crypto.randomUUID()
    await env.DB.prepare(`INSERT INTO admin_users (id, email, password_hash) VALUES (?, ?, ?)`)
      .bind(userId, `fail${userId.slice(0, 4)}@test.com`, 'x')
      .run()

    await recordFailedAttempt(env.DB, userId)

    const row = await env.DB.prepare(
      'SELECT failed_login_attempts, locked_until FROM admin_users WHERE id = ?',
    )
      .bind(userId)
      .first<{ failed_login_attempts: number; locked_until: string | null }>()
    expect(row?.failed_login_attempts).toBe(1)
    expect(row?.locked_until).toBeNull()
  })

  it('sets locked_until after 5th failed attempt', async () => {
    const userId = crypto.randomUUID()
    await env.DB.prepare(
      `INSERT INTO admin_users (id, email, password_hash, failed_login_attempts) VALUES (?, ?, ?, 4)`,
    )
      .bind(userId, `lock${userId.slice(0, 4)}@test.com`, 'x')
      .run()

    await recordFailedAttempt(env.DB, userId)

    const row = await env.DB.prepare(
      'SELECT failed_login_attempts, locked_until FROM admin_users WHERE id = ?',
    )
      .bind(userId)
      .first<{ failed_login_attempts: number; locked_until: string | null }>()
    expect(row?.failed_login_attempts).toBe(5)
    expect(row?.locked_until).not.toBeNull()
    // locked_until should be ~15 min from now
    const lockedUntil = new Date(row!.locked_until!).getTime()
    const now = Date.now()
    expect(lockedUntil).toBeGreaterThan(now + 14 * 60 * 1000)
    expect(lockedUntil).toBeLessThan(now + 16 * 60 * 1000)
  })
})

describe('clearLockout', () => {
  it('resets failed_login_attempts and locked_until', async () => {
    const userId = crypto.randomUUID()
    const future = new Date(Date.now() + 900000).toISOString()
    await env.DB.prepare(
      `INSERT INTO admin_users (id, email, password_hash, failed_login_attempts, locked_until) VALUES (?, ?, ?, 5, ?)`,
    )
      .bind(userId, `clear${userId.slice(0, 4)}@test.com`, 'x', future)
      .run()

    await clearLockout(env.DB, userId)

    const row = await env.DB.prepare(
      'SELECT failed_login_attempts, locked_until FROM admin_users WHERE id = ?',
    )
      .bind(userId)
      .first<{ failed_login_attempts: number; locked_until: string | null }>()
    expect(row?.failed_login_attempts).toBe(0)
    expect(row?.locked_until).toBeNull()
  })
})

describe('createSession / getSession / deleteSession', () => {
  it('creates a session and retrieves it', async () => {
    const userId = crypto.randomUUID()
    await env.DB.prepare(`INSERT INTO admin_users (id, email, password_hash) VALUES (?, ?, ?)`)
      .bind(userId, `sess${userId.slice(0, 4)}@test.com`, 'x')
      .run()

    const sessionId = await createSession(env.DB, userId, SESSION_EXPIRY_DAYS)
    expect(sessionId).toBeTruthy()

    const session = await getSession(env.DB, sessionId)
    expect(session).not.toBeNull()
    expect(session?.admin_user_id).toBe(userId)
  })

  it('returns null for non-existent session', async () => {
    const session = await getSession(env.DB, 'nonexistent-session')
    expect(session).toBeNull()
  })

  it('returns null for expired session', async () => {
    const userId = crypto.randomUUID()
    await env.DB.prepare(`INSERT INTO admin_users (id, email, password_hash) VALUES (?, ?, ?)`)
      .bind(userId, `exp${userId.slice(0, 4)}@test.com`, 'x')
      .run()

    const sessionId = crypto.randomUUID()
    const past = new Date(Date.now() - 1000).toISOString()
    await env.DB.prepare(`INSERT INTO sessions (id, admin_user_id, expires_at) VALUES (?, ?, ?)`)
      .bind(sessionId, userId, past)
      .run()

    const session = await getSession(env.DB, sessionId)
    expect(session).toBeNull()
  })

  it('deletes a session', async () => {
    const userId = crypto.randomUUID()
    await env.DB.prepare(`INSERT INTO admin_users (id, email, password_hash) VALUES (?, ?, ?)`)
      .bind(userId, `del${userId.slice(0, 4)}@test.com`, 'x')
      .run()

    const sessionId = await createSession(env.DB, userId, SESSION_EXPIRY_DAYS)
    await deleteSession(env.DB, sessionId)

    const session = await getSession(env.DB, sessionId)
    expect(session).toBeNull()
  })
})
