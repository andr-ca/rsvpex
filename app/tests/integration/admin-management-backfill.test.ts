// tests/integration/admin-management-backfill.test.ts
/**
 * Tests migration 0005's owner-backfill logic (fixes the migration 0004 bug
 * where `role text DEFAULT 'editor'` silently demoted every pre-existing
 * admin_users row, leaving zero active Owners on any install that already
 * had an admin before this feature shipped).
 *
 * Migrations only run once, against an empty table, before any test in this
 * file executes (`tests/apply-migrations.ts`'s `applyD1Migrations()` runs in
 * a setup file and skips already-applied migrations) — so seeding rows
 * *after* that point can never retroactively trigger 0005 to re-run. To
 * actually exercise the backfill logic against seeded data, each test here
 * re-runs the exact same statement migration 0005 applies (kept in sync via
 * BACKFILL_SQL below) rather than relying on migration timing.
 *
 * D1 storage in this pool is shared across tests within a single file (not
 * isolated per-test) — the backfill SQL's `NOT EXISTS (... role = 'owner')`
 * check is genuinely global across the whole table, so a `beforeEach` wipe
 * is required here (unlike most other integration tests, which scope every
 * assertion to their own seeded row's id and never rely on total-table state).
 */
import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import { hashPassword } from '../../src/domain/adminAuth'

// Mirrors app/migrations/0005_backfill_admin_owner.sql's UPDATE statement.
const BACKFILL_SQL = `
  UPDATE admin_users
  SET role = 'owner'
  WHERE id = (
      SELECT id FROM admin_users
      WHERE is_active = 1 AND role = 'editor'
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    )
    AND NOT EXISTS (
      SELECT 1 FROM admin_users WHERE is_active = 1 AND role = 'owner'
    )
`

async function runBackfill(): Promise<void> {
  await env.DB.prepare(BACKFILL_SQL).run()
}

async function seedAdmin(
  db: D1Database,
  overrides?: Partial<{
    email: string
    role: string
    is_active: number
    created_at: string
  }>,
): Promise<{ id: string; email: string }> {
  const id = crypto.randomUUID()
  const email = overrides?.email ?? `admin${id.slice(0, 6)}@test.com`
  const role = overrides?.role ?? 'editor'
  const is_active = overrides?.is_active ?? 1
  const created_at = overrides?.created_at ?? new Date().toISOString()
  const hash = await hashPassword('test-password')

  await db
    .prepare(
      `INSERT INTO admin_users (id, email, password_hash, role, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, email, hash, role, is_active, created_at)
    .run()

  return { id, email }
}

async function roleOf(id: string): Promise<string | undefined> {
  const row = await env.DB.prepare('SELECT role FROM admin_users WHERE id = ?')
    .bind(id)
    .first<{ role: string }>()
  return row?.role
}

describe('migration 0005: backfill admin Owner', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM admin_users').run()
  })

  it('no-ops on an empty admin_users table', async () => {
    await expect(runBackfill()).resolves.not.toThrow()
    const count = await env.DB.prepare('SELECT COUNT(*) as count FROM admin_users').first<{
      count: number
    }>()
    expect(count?.count).toBe(0)
  })

  it('promotes the sole editor to owner when no owner exists', async () => {
    const admin = await seedAdmin(env.DB, { role: 'editor' })
    expect(await roleOf(admin.id)).toBe('editor')

    await runBackfill()

    expect(await roleOf(admin.id)).toBe('owner')
  })

  it('promotes only the oldest editor when multiple editors exist', async () => {
    const now = Date.now()
    const oldest = await seedAdmin(env.DB, {
      role: 'editor',
      created_at: new Date(now - 10_000).toISOString(),
    })
    const middle = await seedAdmin(env.DB, {
      role: 'editor',
      created_at: new Date(now - 5_000).toISOString(),
    })
    const newest = await seedAdmin(env.DB, {
      role: 'editor',
      created_at: new Date(now).toISOString(),
    })

    await runBackfill()

    expect(await roleOf(oldest.id)).toBe('owner')
    expect(await roleOf(middle.id)).toBe('editor')
    expect(await roleOf(newest.id)).toBe('editor')
  })

  it('is a no-op when an active owner already exists', async () => {
    const owner = await seedAdmin(env.DB, { role: 'owner' })
    const editor = await seedAdmin(env.DB, { role: 'editor' })

    await runBackfill()

    expect(await roleOf(owner.id)).toBe('owner')
    expect(await roleOf(editor.id)).toBe('editor')
  })

  it('does not promote an inactive editor even with no active owner', async () => {
    const inactiveEditor = await seedAdmin(env.DB, { role: 'editor', is_active: 0 })

    await runBackfill()

    expect(await roleOf(inactiveEditor.id)).toBe('editor')
  })

  it('is idempotent: running twice has the same effect as running once', async () => {
    const admin = await seedAdmin(env.DB, { role: 'editor' })

    await runBackfill()
    expect(await roleOf(admin.id)).toBe('owner')

    await expect(runBackfill()).resolves.not.toThrow()
    expect(await roleOf(admin.id)).toBe('owner')
  })
})
