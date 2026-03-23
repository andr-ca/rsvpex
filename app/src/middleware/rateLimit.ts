/**
 * KV-based IP rate limiter for the RSVP submission endpoint.
 *
 * Key: `rate:rsvp:<ip-hash>` — the raw IP is never stored.
 * Window: 60 seconds rolling (TTL reset on each new window).
 * Limit: 5 requests per window.
 *
 * @req SEC-01 — IP stored only as SHA-256 hash
 * @req CAP-05 (implied) — rate limiting protects capacity endpoint from flood
 */

import type { MiddlewareHandler } from 'hono'
import { generateIpHash } from '../domain/tokens'

const LIMIT = 5
const WINDOW_TTL = 60 // seconds

/**
 * Hono middleware factory for RSVP rate limiting.
 *
 * Usage:
 *   app.post('/rsvp/:slug', rsvpRateLimit(), handler)
 */
export function rsvpRateLimit(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const ip =
      c.req.raw.headers.get('CF-Connecting-IP') ??
      c.req.raw.headers.get('X-Forwarded-For') ??
      'unknown'

    const ipHash = await generateIpHash(ip)
    const key = `rate:rsvp:${ipHash}`

    const raw = await c.env.SESSION_KV.get(key)
    const count = raw ? parseInt(raw, 10) : 0

    if (count >= LIMIT) {
      return c.json(
        { error: 'rate_limit_exceeded', retryAfter: WINDOW_TTL },
        429,
        { 'Retry-After': String(WINDOW_TTL) },
      )
    }

    // Increment — if first request in window, set TTL; otherwise preserve remaining TTL
    // by using expirationTtl on every write (TTL is reset to WINDOW_TTL each request within
    // the window; this is a simple sliding window approximation suitable for CF KV).
    await c.env.SESSION_KV.put(key, String(count + 1), { expirationTtl: WINDOW_TTL })

    await next()
  }
}
