import { describe, it, expect } from 'vitest'
import { appendOwnershipFilter, verifyEventOwnership } from '../../app/src/domain/authorization'

describe('authorization.ts — Ownership helpers', () => {
  // ─── appendOwnershipFilter ────────────────────────────────────────────

  describe('appendOwnershipFilter()', () => {
    it('returns empty string for owner role (no filter)', () => {
      const filter = appendOwnershipFilter('owner', 'user-123', 'events')
      expect(filter).toBe('')
    })

    it('returns empty string for editor role (no filter)', () => {
      const filter = appendOwnershipFilter('editor', 'user-123', 'events')
      expect(filter).toBe('')
    })

    it('returns ownership filter for host role (strict equality only)', () => {
      const filter = appendOwnershipFilter('host', 'user-123', 'events')
      expect(filter).toBe('AND (events.created_by = ?)')
    })

    it('uses custom table alias when provided', () => {
      const filter = appendOwnershipFilter('host', 'user-123', 'e')
      expect(filter).toBe('AND (e.created_by = ?)')
    })

    it('uses default table alias "events" when not provided', () => {
      const filter = appendOwnershipFilter('host', 'user-123')
      expect(filter).toBe('AND (events.created_by = ?)')
    })

    it('does NOT include "OR created_by IS NULL" for hosts (no backward compat for hosts)', () => {
      const filter = appendOwnershipFilter('host', 'user-123', 'events')
      expect(filter).not.toContain('IS NULL')
      expect(filter).not.toContain('OR')
    })

    it('filter includes correct parameterized placeholder for hosts', () => {
      const filter = appendOwnershipFilter('host', 'user-456', 'my_table')
      expect(filter).toMatch(/\?/)
      expect(filter).toBe('AND (my_table.created_by = ?)')
    })
  })

  // ─── verifyEventOwnership ─────────────────────────────────────────────

  describe('verifyEventOwnership()', () => {
    it('returns true immediately for owner role (no DB query needed)', async () => {
      // Mock DB (not called for owner)
      const mockDb = {} as D1Database

      const result = await verifyEventOwnership(mockDb, 'event-1', 'user-123', 'owner')
      expect(result).toBe(true)
    })

    it('returns true immediately for editor role (no DB query needed)', async () => {
      // Mock DB (not called for editor)
      const mockDb = {} as D1Database

      const result = await verifyEventOwnership(mockDb, 'event-1', 'user-123', 'editor')
      expect(result).toBe(true)
    })

    // Note: Full verifyEventOwnership tests for host role require Miniflare + D1
    // and belong in integration tests (tests/integration/authorization.test.ts)
    // These unit tests verify the pure logic without DB access.
  })
})
