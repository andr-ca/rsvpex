/**
 * Cloudflare Turnstile CAPTCHA — server-side token verification middleware.
 *
 * Reads `cf-turnstile-response` from the parsed request body (must be called
 * after body parsing). Verifies against the Turnstile siteverify API.
 *
 * Test bypass: if `TURNSTILE_SECRET_KEY === 'test-secret'` the verification
 * is skipped entirely (allows Vitest tests to run without a real Turnstile key).
 *
 * @req SEC-02 — CAPTCHA on public RSVP form submission
 */

import type { MiddlewareHandler } from 'hono'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TEST_BYPASS_KEY = 'test-secret'

/**
 * Hono middleware that verifies a Turnstile CAPTCHA token.
 *
 * Expects the request body to have already been parsed and stored via
 * Hono's built-in body caching — access via `c.req.parseBody()`.
 *
 * Usage:
 *   app.post('/rsvp/:slug', turnstileVerify(), rsvpRateLimit(), handler)
 */
export function turnstileVerify(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const secretKey = c.env.TURNSTILE_SECRET_KEY

    // Dev/test bypass — requires BOTH the magic secret AND a non-production
    // environment (S-1 in recommendations.md): gating on the secret value
    // alone means a prod deploy that accidentally sets TURNSTILE_SECRET_KEY
    // to this literal would silently disable CAPTCHA.
    if (secretKey === TEST_BYPASS_KEY && c.env.ENVIRONMENT !== 'production') {
      await next()
      return
    }

    const body = await c.req.parseBody()
    const token = body['cf-turnstile-response']

    if (!token || typeof token !== 'string') {
      return c.json({ error: 'captcha_missing' }, 400)
    }

    // Only CF-Connecting-IP (S-4 in recommendations.md): X-Forwarded-For is
    // client-spoofable, and Turnstile uses `remoteip` as a verification signal.
    const ip = c.req.raw.headers.get('CF-Connecting-IP') ?? ''

    const formData = new FormData()
    formData.append('secret', secretKey)
    formData.append('response', token)
    if (ip) formData.append('remoteip', ip)

    let verifyResponse: Response
    try {
      verifyResponse = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        body: formData,
      })
    } catch {
      // Fail CLOSED (S-1 in recommendations.md): the previous fail-open behavior
      // meant CAPTCHA silently stopped protecting the form during any Turnstile
      // outage — including one an attacker could induce. A brief 503 here is a
      // better trade than turning off abuse protection for real users.
      return c.json({ error: 'captcha_unavailable' }, 503)
    }

    const result = await verifyResponse.json<{ success: boolean }>()

    if (!result.success) {
      return c.json({ error: 'captcha_failed' }, 400)
    }

    await next()
  }
}
