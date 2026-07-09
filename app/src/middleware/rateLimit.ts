/**
 * KV-based IP rate limiter, parameterized per endpoint family.
 *
 * Key: `rate:<prefix>:<ip-hash>` — the raw IP is never stored.
 * Window: rolling (TTL reset on each new window) — a simple sliding-window
 * approximation, suitable for CF KV's eventual consistency (see S-4 in
 * recommendations.md for the known limitations of this approach: KV
 * read-modify-write races and per-POP counters mean this is best-effort
 * defense-in-depth, not a hard guarantee — pair with Cloudflare's zone-level
 * rate limiting rules for anything that actually needs to hold).
 *
 * Only trusts CF-Connecting-IP (S-4): the previous X-Forwarded-For fallback
 * is client-spoofable on any request that reaches the Worker directly.
 *
 * @req SEC-01 — IP stored only as SHA-256 hash
 * @req CAP-05 (implied) — rate limiting protects capacity endpoint from flood
 * @req SEC-05 — rate limiting on admin login / password-reset
 */

import type { MiddlewareHandler } from 'hono'
import { generateIpHash } from '../domain/tokens'

function rateLimit(
  prefix: string,
  limit: number,
  windowTtl: number,
): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const ip = c.req.raw.headers.get('CF-Connecting-IP') ?? 'unknown'
    const ipHash = await generateIpHash(ip, c.env.IP_HASH_KEY)
    const key = `rate:${prefix}:${ipHash}`

    const raw = await c.env.RATE_LIMIT_KV.get(key)
    const count = raw ? parseInt(raw, 10) : 0

    if (count >= limit) {
      return c.json({ error: 'rate_limit_exceeded', retryAfter: windowTtl }, 429, {
        'Retry-After': String(windowTtl),
      })
    }

    await c.env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: windowTtl })

    await next()
  }
}

/**
 * 5 requests / 60s per IP on the public RSVP submission endpoint.
 * Usage: app.post('/rsvp/:slug', rsvpRateLimit(), handler)
 */
export function rsvpRateLimit(): MiddlewareHandler<{ Bindings: Env }> {
  return rateLimit('rsvp', 5, 60)
}

/**
 * 10 requests / 5 min per IP on admin login / password-reset endpoints (S-5
 * in recommendations.md: these had no rate limit at all, making credential
 * stuffing and reset-token spam free for an attacker).
 *
 * Bypassed under the same TURNSTILE_SECRET_KEY==='test-secret' signal the
 * Turnstile middleware uses (middleware/turnstile.ts) — integration tests
 * exercise the lockout/session/reset flows with many sequential requests
 * from the same synthetic IP and would otherwise trip this limiter well
 * before a human ever would. Never true in production (the real secret is
 * never that literal string).
 */
export function adminAuthRateLimit(): MiddlewareHandler<{ Bindings: Env }> {
  const limited = rateLimit('admin-auth', 10, 300)
  return async (c, next) => {
    // Same ENVIRONMENT-gated bypass as turnstile.ts (S-1 in recommendations.md).
    if (c.env.TURNSTILE_SECRET_KEY === 'test-secret' && c.env.ENVIRONMENT !== 'production') {
      await next()
      return
    }
    await limited(c, next)
  }
}
