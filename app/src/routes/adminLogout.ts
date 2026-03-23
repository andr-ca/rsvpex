// app/src/routes/adminLogout.ts
/**
 * Admin logout — POST /rsvp/admin/logout
 *
 * Deletes session from D1, clears cookie.
 *
 * @req ADMIN-01 — session management
 */
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { deleteSession } from '../domain/adminAuth'

const adminLogoutRouter = new Hono<{ Bindings: Env }>()

adminLogoutRouter.post('/logout', async (c) => {
  const sessionId = getCookie(c, 'session_id')
  if (sessionId) {
    await deleteSession(c.env.DB, sessionId)
  }
  setCookie(c, 'session_id', '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
    maxAge: 0,
    path: '/',
  })
  return c.redirect('/rsvp/admin/login', 303)
})

export default adminLogoutRouter
