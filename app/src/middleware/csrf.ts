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
 *   /rsvp/admin/logout, /rsvp/admin/invite/accept
 * Exempt: all non-admin routes (public RSVP has Turnstile + rate limiting)
 *
 * @req SEC-03 — CSRF protection on all mutating admin endpoints
 */
import { createMiddleware } from 'hono/factory'
import { getCookie, setCookie } from 'hono/cookie'
import { timingSafeEqual } from '../domain/tokens'

/** Admin paths exempt from CSRF (pre-auth or logout). */
const EXEMPT_PATHS = new Set([
  '/rsvp/admin/setup',
  '/rsvp/admin/login',
  '/rsvp/admin/logout',
  '/rsvp/admin/password-reset',
  '/rsvp/admin/password-reset/confirm',
  '/rsvp/admin/invite/accept',
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
  return createMiddleware<{ Bindings: Env; Variables: { csrfToken?: string } }>(async (c, next) => {
    const method = c.req.method
    const path = c.req.path

    // For every non-exempt admin path, ensure a CSRF token cookie exists *before*
    // calling next() so route handlers can read it via c.get('csrfToken') and embed
    // it into the forms they render — this is what P0-2 in recommendations.md fixed:
    // the token was previously only ever set AFTER the handler ran, so no form could
    // ever see it, and no admin POST could ever pass the check below.
    if (path.startsWith('/rsvp/admin') && !isExempt(path)) {
      let token = getCookie(c, 'csrf_token')
      if (!token) {
        token = crypto.randomUUID()
        setCookie(c, 'csrf_token', token, {
          httpOnly: false, // JS needs to read it to set the header
          sameSite: 'Strict',
          secure: true,
          path: '/',
          maxAge: 60 * 60 * 24, // 24 hours
        })
      }
      c.set('csrfToken', token)
    }

    // Only protect admin mutating routes
    if (!isAdminMutating(method, path)) {
      await next()
      return
    }

    // ── Origin header check ───────────────────────────────────────────
    // Fail closed: if the browser sent an Origin header (every modern browser
    // does, for same-origin POSTs too) but DEPLOYMENT_DOMAIN isn't configured,
    // we cannot validate it — reject rather than silently skip the check.
    // See S-8 in recommendations.md: the previous `if (origin && deployDomain)`
    // meant this check was a no-op on any deploy that forgot to set the var.
    const origin = c.req.raw.headers.get('Origin')
    const deployDomain = c.env.DEPLOYMENT_DOMAIN

    if (origin) {
      if (!deployDomain) {
        return c.json({ error: 'origin_validation_unavailable' }, 403)
      }
      const allowed = [deployDomain]
      if (!deployDomain.includes('localhost')) {
        // In dev, also allow localhost variants (DEPLOYMENT_DOMAIN is unset
        // or still the production value here).
        allowed.push('http://localhost')
      } else {
        // DEPLOYMENT_DOMAIN itself is a localhost URL (E2E/local dev — see
        // playwright.config.ts). `wrangler dev --local-upstream` strips the
        // port from the incoming Origin header before the Worker sees it, so
        // a browser sending `Origin: http://localhost:8787` arrives here as
        // `http://localhost` — allow the port-stripped form too, or every
        // local admin POST would fail this check even with a correct Origin.
        allowed.push(deployDomain.replace(/:\d+$/, ''))
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

    if (!timingSafeEqual(cookieToken, headerToken)) {
      return c.json({ error: 'csrf_token_mismatch' }, 403)
    }

    await next()
  })
}
