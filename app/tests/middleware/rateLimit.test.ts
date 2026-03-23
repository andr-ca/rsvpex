import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { rsvpRateLimit } from '../../src/middleware/rateLimit'

function buildApp() {
  const app = new Hono<{ Bindings: Env }>()
  app.post('/rsvp/test', rsvpRateLimit(), (c) => c.json({ ok: true }))
  return app
}

const FIXED_IP = '203.0.113.42'

function makeRequest(app: ReturnType<typeof buildApp>) {
  return app.request(
    'http://example.com/rsvp/test',
    {
      method: 'POST',
      headers: { 'CF-Connecting-IP': FIXED_IP, 'Content-Type': 'application/json' },
      body: '{}',
    },
    env,
  )
}

describe('rsvpRateLimit middleware', () => {
  it('allows the first 5 requests', async () => {
    const app = buildApp()
    for (let i = 0; i < 5; i++) {
      const res = await makeRequest(app)
      expect(res.status).toBe(200)
    }
  })

  it('returns 429 on the 6th request', async () => {
    const app = buildApp()
    for (let i = 0; i < 5; i++) await makeRequest(app)
    const res = await makeRequest(app)
    expect(res.status).toBe(429)
    const body = await res.json<{ error: string }>()
    expect(body.error).toBe('rate_limit_exceeded')
  })

  it('sets Retry-After header on 429', async () => {
    const app = buildApp()
    for (let i = 0; i < 5; i++) await makeRequest(app)
    const res = await makeRequest(app)
    expect(res.headers.get('Retry-After')).toBe('60')
  })

  it('different IPs do not share rate limit buckets', async () => {
    const app = buildApp()
    // Exhaust limit for IP A
    for (let i = 0; i < 5; i++) await makeRequest(app)
    // IP B should still be allowed
    const resB = await app.request(
      'http://example.com/rsvp/test',
      {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '198.51.100.1', 'Content-Type': 'application/json' },
        body: '{}',
      },
      env,
    )
    expect(resB.status).toBe(200)
  })
})
