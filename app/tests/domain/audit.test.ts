// app/tests/domain/audit.test.ts
/**
 * @req SEC-04 — audit log with PII-redacted diffs
 */
import { describe, it, expect } from 'vitest'
import { redactPii, buildDiff, writeAuditLog } from '../../src/domain/audit'

describe('redactPii', () => {
  it('replaces email with first-8-char SHA-256 hex prefix', async () => {
    const result = await redactPii({ email: 'alice@example.com' })
    expect(result.email).toMatch(/^[0-9a-f]{8}$/)
    expect(result.email).not.toContain('@')
  })

  it('replaces phone with first-8-char SHA-256 hex prefix', async () => {
    const result = await redactPii({ phone: '+15551234567' })
    expect(result.phone).toMatch(/^[0-9a-f]{8}$/)
  })

  it('leaves non-PII fields unchanged', async () => {
    const result = await redactPii({ title: 'My Event', status: 'published' })
    expect(result.title).toBe('My Event')
    expect(result.status).toBe('published')
  })

  it('handles null/undefined PII fields gracefully', async () => {
    const result = await redactPii({ email: null, phone: undefined })
    expect(result.email).toBeNull()
    expect(result.phone).toBeUndefined()
  })

  it('produces consistent hash for same value', async () => {
    const r1 = await redactPii({ email: 'test@test.com' })
    const r2 = await redactPii({ email: 'test@test.com' })
    expect(r1.email).toBe(r2.email)
  })
})

describe('buildDiff', () => {
  it('returns only changed fields (JSON Merge Patch)', () => {
    const before = { title: 'Old Title', status: 'draft', maxGuests: 100 }
    const after = { title: 'New Title', status: 'draft', maxGuests: 150 }
    const diff = buildDiff(before, after)
    expect(diff).toEqual({ title: 'New Title', maxGuests: 150 })
    expect(diff).not.toHaveProperty('status')
  })

  it('returns empty object when nothing changed', () => {
    const obj = { title: 'Same', status: 'published' }
    const diff = buildDiff(obj, { ...obj })
    expect(diff).toEqual({})
  })

  it('includes new fields added in after', () => {
    const before = { title: 'Old' }
    const after = { title: 'Old', newField: 'value' }
    const diff = buildDiff(before, after)
    expect(diff).toEqual({ newField: 'value' })
  })
})

describe('writeAuditLog', () => {
  it('inserts a row into audit_logs table', async () => {
    const rows: any[] = []
    const mockDb = {
      prepare: () => ({
        bind: (...args: any[]) => {
          rows.push(args)
          return { run: async () => ({}) }
        },
      }),
    }
    await writeAuditLog(mockDb as any, {
      actorId: 'admin-1',
      entityType: 'event',
      entityId: 'evt-1',
      action: 'create',
      diff: { title: 'New Event' },
    })
    expect(rows.length).toBe(1)
    const [id, actorId, entityType, entityId, action, diffJson] = rows[0]
    expect(typeof id).toBe('string')
    expect(actorId).toBe('admin-1')
    expect(entityType).toBe('event')
    expect(entityId).toBe('evt-1')
    expect(action).toBe('create')
    expect(JSON.parse(diffJson)).toEqual({ title: 'New Event' })
  })

  it('accepts null actorId for system actions', async () => {
    const rows: any[] = []
    const mockDb = {
      prepare: () => ({
        bind: (...args: any[]) => {
          rows.push(args)
          return { run: async () => ({}) }
        },
      }),
    }
    await writeAuditLog(mockDb as any, {
      actorId: null,
      entityType: 'system',
      entityId: 'purge',
      action: 'purge',
      diff: null,
    })
    expect(rows[0][1]).toBeNull()
  })
})
