// app/src/middleware/requireAdmin.ts
/**
 * Admin session guard middleware.
 *
 * Reads the `session_id` cookie, verifies against D1 sessions table.
 * Sets c.var.adminUserId on success. Returns 302 redirect to login on failure.
 *
 * @req ADMIN-01 — admin routes require authenticated session
 * @req SEC-03 — session cookie: HttpOnly, SameSite=Lax, Secure
 */
import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { getSession } from '../domain/adminAuth'

export const requireAdmin = createMiddleware<{ Bindings: Env; Variables: { adminUserId: string } }>(
  async (c, next) => {
    const sessionId = getCookie(c, 'session_id')
    if (!sessionId) {
      return c.redirect('/rsvp/admin/login', 302)
    }
    const session = await getSession(c.env.DB, sessionId)
    if (!session) {
      return c.redirect('/rsvp/admin/login', 302)
    }
    c.set('adminUserId', session.admin_user_id)
    await next()
  },
)
