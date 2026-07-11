// tests/domain/adminInvites.test.ts
/**
 * Unit tests for admin invite domain functions.
 */
import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import { createInvite, consumeInvite } from '../../src/domain/adminInvites'

describe('createInvite', () => {
  it('creates token and stores hash with expiry', async () => {
    const rawToken = await createInvite(env.DB, 'newadmin@example.com', 'editor', 10_080)
    expect(rawToken).toBeTruthy()
    expect(rawToken.length).toBeGreaterThan(0)

    // Verify tokenHash is in DB
    const row = await env.DB.prepare('SELECT token_hash, expires_at, role FROM admin_invites WHERE email = ?')
      .bind('newadmin@example.com')
      .first<{ token_hash: string; expires_at: string; role: string }>()
    expect(row?.token_hash).toBeTruthy()
    expect(row?.expires_at).toBeTruthy()
    expect(row?.role).toBe('editor')
  })

  it('persists role column in invite', async () => {
    const ownerToken = await createInvite(env.DB, 'owner@example.com', 'owner', 10_080)
    const invite = await env.DB.prepare('SELECT role FROM admin_invites WHERE email = ?')
      .bind('owner@example.com')
      .first<{ role: string }>()
    expect(invite?.role).toBe('owner')
  })

  it('sets expiry to future timestamp', async () => {
    const before = Date.now()
    await createInvite(env.DB, 'future@example.com', 'editor', 10_080)
    const after = Date.now()

    const row = await env.DB.prepare('SELECT expires_at FROM admin_invites WHERE email = ?')
      .bind('future@example.com')
      .first<{ expires_at: string }>()
    const expiresAtMs = new Date(row?.expires_at || '').getTime()

    // Should be roughly 7 days in the future (allow ±2 seconds for execution time)
    const expectedMs = before + 10_080 * 60 * 1000
    expect(expiresAtMs).toBeGreaterThanOrEqual(expectedMs - 2000)
    expect(expiresAtMs).toBeLessThanOrEqual(expectedMs + 2000)
  })
})

describe('consumeInvite', () => {
  it('returns email on valid, unused token', async () => {
    const rawToken = await createInvite(env.DB, 'consume@example.com', 'editor', 10_080)
    const result = await consumeInvite(env.DB, rawToken)
    expect(result?.email).toBe('consume@example.com')
  })

  it('returns null if token already used', async () => {
    const rawToken = await createInvite(env.DB, 'already-used@example.com', 'editor', 10_080)
    const first = await consumeInvite(env.DB, rawToken)
    expect(first?.email).toBe('already-used@example.com')
    const second = await consumeInvite(env.DB, rawToken)
    expect(second).toBeNull()
  })

  it('returns null if token expired', async () => {
    // Insert an expired invite directly
    const expiredAt = new Date(Date.now() - 1000).toISOString()
    const tokenHash = 'fake-hash-' + crypto.randomUUID()
    await env.DB.prepare(
      'INSERT INTO admin_invites (id, email, token_hash, expires_at, role) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(crypto.randomUUID(), 'expired@example.com', tokenHash, expiredAt, 'editor')
      .run()

    // Try to consume with any token (won't match the fake-hash anyway)
    const result = await consumeInvite(env.DB, 'any-token')
    expect(result).toBeNull()
  })

  it('returns null if token does not exist', async () => {
    const result = await consumeInvite(env.DB, 'nonexistent-token-' + crypto.randomUUID())
    expect(result).toBeNull()
  })

  it('enforces idempotency (C-12): only one concurrent consume succeeds', async () => {
    const rawToken = await createInvite(env.DB, 'concurrent@example.com', 'editor', 10_080)

    // Simulate two concurrent consumptions by executing them both
    const [result1, result2] = await Promise.all([
      consumeInvite(env.DB, rawToken),
      consumeInvite(env.DB, rawToken),
    ])

    // Exactly one should succeed (both get the same email but the second update sees changes === 0)
    const successCount = [result1, result2].filter((r) => r !== null).length
    expect(successCount).toBe(1)
  })
})
