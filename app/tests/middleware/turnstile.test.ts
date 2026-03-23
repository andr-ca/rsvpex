import { env } from 'cloudflare:test'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Hono } from 'hono'
import { turnstileVerify } from '../../src/middleware/turnstile'

function buildApp(secretKey = 'real-secret') {
  const app = new Hono<{ Bindings: typeof env }>()
  app.post('/rsvp/test', turnstileVerify(), (c) => c.json({ ok: true }))
  return app
}

function makeRequest(
  app: ReturnType<typeof buildApp>,
  token: string | null = 'valid-token',
  extraEnv: Partial<typeof env> = {},
) {
  const body = new URLSearchParams()
  if (token) body.append('cf-turnstile-response', token)
  body.append('name', 'Test User')

  return app.request(
    'http://example.com/rsvp/test',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '1.2.3.4' },
      body: body.toString(),
    },
    { ...env, ...extraEnv },
  )
}

describe('turnstileVerify middleware', () => {
  afterEach(() => vi.restoreAllMocks())

  it('bypasses verification when TURNSTILE_SECRET_KEY is test-secret', async () => {
    const app = buildApp()
    const res = await makeRequest(app, 'any-token', { TURNSTILE_SECRET_KEY: 'test-secret' })
    expect(res.status).toBe(200)
  })

  it('returns 400 captcha_missing when no token provided', async () => {
    const app = buildApp()
    // Patch global fetch to ensure it would succeed if called (but it should NOT be called)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
    const res = await makeRequest(app, null, { TURNSTILE_SECRET_KEY: 'real-secret' })
    expect(res.status).toBe(400)
    const body = await res.json<{ error: string }>()
    expect(body.error).toBe('captcha_missing')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns 400 captcha_failed when Turnstile returns success: false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
      }),
    )
    const app = buildApp()
    const res = await makeRequest(app, 'bad-token', { TURNSTILE_SECRET_KEY: 'real-secret' })
    expect(res.status).toBe(400)
    const body = await res.json<{ error: string }>()
    expect(body.error).toBe('captcha_failed')
  })

  it('passes through when Turnstile returns success: true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
    const app = buildApp()
    const res = await makeRequest(app, 'valid-token', { TURNSTILE_SECRET_KEY: 'real-secret' })
    expect(res.status).toBe(200)
  })

  it('fails open (passes through) when Turnstile API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network error'))
    const app = buildApp()
    const res = await makeRequest(app, 'valid-token', { TURNSTILE_SECRET_KEY: 'real-secret' })
    expect(res.status).toBe(200)
  })
})
