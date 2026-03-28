import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, it, expect } from 'vitest'

describe('Phase 1 Smoke Tests', () => {
  it('D1 binding is callable', async () => {
    const result = await env.DB.prepare('SELECT 1 as val').first<{ val: number }>()
    expect(result?.val).toBe(1)
  })

  it('all tables exist after migration', async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all<{ name: string }>()

    const tableNames = result.results.map((r) => r.name).sort()
    expect(tableNames).toContain('admin_users')
    expect(tableNames).toContain('events')
    expect(tableNames).toContain('rsvps')
    expect(tableNames).toContain('audit_logs')
    expect(tableNames).toContain('notification_log')
  })

  it('GET /rsvp/healthz returns ok when DB is reachable', async () => {
    const response = await SELF.fetch('http://example.com/rsvp/healthz')
    expect(response.status).toBe(200)
    const body = await response.json<{ status: string; db: string }>()
    expect(body.status).toBe('ok')
    expect(body.db).toBe('ok')
  })

  it('SESSION_KV binding is available', async () => {
    await env.SESSION_KV.put('test:key', 'value', { expirationTtl: 60 })
    const val = await env.SESSION_KV.get('test:key')
    expect(val).toBe('value')
  })
})
