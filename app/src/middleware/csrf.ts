// app/src/middleware/csrf.ts
/**
 * CSRF protection — double-submit cookie pattern + Origin header validation.
 *
 * On GET/HEAD to admin routes: sets `csrf_token` cookie if not present.
 * On POST/PATCH/DELETE to protected admin routes: validates that:
 *   1. Origin header (if present) matches DEPLOYMENT_DOMAIN
 *   2. `csrf_token` cookie matches `X-CSRF-Token` header or `_csrf` form field
 *
 * Exempt routes (pre-auth): /rsvp/admin/setup, /rsvp/admin/login,
 *   /rsvp/admin/password-reset, /rsvp/admin/password-reset/confirm,
 *   /rsvp/admin/logout
 * Exempt: all non-admin routes (public RSVP has Turnstile + rate limiting)
 *
 * @req SEC-03 — CSRF protection on all mutating admin endpoints
 */
import { createMiddleware } from 'hono/factory'
import { getCookie, setCookie } from 'hono/cookie'

/** Admin paths exempt from CSRF (pre-auth or logout). */
const EXEMPT_PATHS = new Set([
  '/rsvp/admin/setup',
  '/rsvp/admin/login',
  '/rsvp/admin/logout',
  '/rsvp/admin/password-reset',
  '/rsvp/admin/password-reset/confirm',
])

function isExempt(path: string): boolean {
  return EXEMPT_PATHS.has(path)
}

function isAdminMutating(method: string, path: string): boolean {
  if (!['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) return false
  if (!path.startsWith('/rsvp/admin')) return false
  if (isExempt(path)) return false
  return true
}

export function csrfProtection() {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const method = c.req.method
    const path = c.req.path

    // Only protect admin mutating routes
    if (!isAdminMutating(method, path)) {
      // On GET to admin pages, ensure a CSRF token cookie is set
      if ((method === 'GET' || method === 'HEAD') && path.startsWith('/rsvp/admin')) {
        await next()
        // Set csrf_token cookie if not already present
        const existing = getCookie(c, 'csrf_token')
        if (!existing) {
          setCookie(c, 'csrf_token', crypto.randomUUID(), {
            httpOnly: false, // JS needs to read it to set the header
            sameSite: 'Strict',
            secure: true,
            path: '/',
            maxAge: 60 * 60 * 24, // 24 hours
          })
        }
        return
      }
      await next()
      return
    }

    // ── Origin header check ───────────────────────────────────────────
    const origin = c.req.raw.headers.get('Origin')
    const deployDomain = (c.env as unknown as Record<string, unknown>).DEPLOYMENT_DOMAIN as
      | string
      | undefined

    if (origin && deployDomain) {
      // Compare origin against deployment domain
      const allowed = [deployDomain]
      // In dev, also allow localhost variants
      if (!deployDomain.includes('localhost')) {
        allowed.push('http://localhost')
      }
      const originMatch = allowed.some(
        (d) => origin === d || origin.startsWith(d + '/') || origin.startsWith(d + ':'),
      )
      if (!originMatch) {
        return c.json({ error: 'origin_mismatch' }, 403)
      }
    }

    // ── Double-submit token check ─────────────────────────────────────
    const cookieToken = getCookie(c, 'csrf_token')
    if (!cookieToken) {
      return c.json({ error: 'csrf_token_missing' }, 403)
    }

    // Check header first, then form field
    let headerToken = c.req.raw.headers.get('X-CSRF-Token')

    if (!headerToken) {
      // Try to read from form body (_csrf field).
      // Hono caches parseBody() results internally — subsequent calls to parseBody()
      // in route handlers return the same cached data. This is confirmed by the existing
      // turnstile middleware which also calls parseBody() before the route handler.
      try {
        const body = await c.req.parseBody()
        headerToken = typeof body._csrf === 'string' ? body._csrf : null
      } catch {
        // Body parsing may fail; treat as missing token
      }
    }

    if (!headerToken) {
      return c.json({ error: 'csrf_token_missing' }, 403)
    }

    if (cookieToken !== headerToken) {
      return c.json({ error: 'csrf_token_mismatch' }, 403)
    }

    await next()
  })
}
