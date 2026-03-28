// app/src/middleware/securityHeaders.ts
/**
 * Security response headers middleware.
 *
 * Sets Content-Security-Policy, X-Frame-Options, X-Content-Type-Options,
 * and Referrer-Policy on every response.
 *
 * CSP is slightly different for admin routes (allows Chart.js CDN) vs
 * public routes (allows Turnstile iframe).
 *
 * @req SEC-06 — strict CSP + security headers
 */
import { createMiddleware } from 'hono/factory'

// Turnstile needs: script-src challenges.cloudflare.com, frame-src challenges.cloudflare.com
// Chart.js CDN (admin only): script-src cdn.jsdelivr.net
// Inline styles are used in HTML templates: style-src 'unsafe-inline'
const PUBLIC_CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  'frame-src https://challenges.cloudflare.com',
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const ADMIN_CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  'frame-src https://challenges.cloudflare.com',
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export function securityHeaders() {
  return createMiddleware(async (c, next) => {
    await next()

    const isAdmin = c.req.path.startsWith('/rsvp/admin')
    const csp = isAdmin ? ADMIN_CSP : PUBLIC_CSP

    c.res.headers.set('Content-Security-Policy', csp)
    c.res.headers.set('X-Frame-Options', 'DENY')
    c.res.headers.set('X-Content-Type-Options', 'nosniff')
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  })
}
