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

    // Dev/test bypass — never bypass in production
    if (secretKey === TEST_BYPASS_KEY) {
      await next()
      return
    }

    const body = await c.req.parseBody()
    const token = body['cf-turnstile-response']

    if (!token || typeof token !== 'string') {
      return c.json({ error: 'captcha_missing' }, 400)
    }

    const ip =
      c.req.raw.headers.get('CF-Connecting-IP') ??
      c.req.raw.headers.get('X-Forwarded-For') ??
      ''

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
      // Network failure — fail open to avoid blocking legitimate users
      // if the Turnstile API is temporarily unreachable.
      await next()
      return
    }

    const result = await verifyResponse.json<{ success: boolean }>()

    if (!result.success) {
      return c.json({ error: 'captcha_failed' }, 400)
    }

    await next()
  }
}
