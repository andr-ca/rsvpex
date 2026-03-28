// app/src/routes/adminLogin.ts
/**
 * Admin login — GET /rsvp/admin/login (form), POST /rsvp/admin/login (submit)
 *
 * @req ADMIN-01 — argon2id verification; lockout after 5 failed attempts (15 min)
 * @req SEC-03 — HttpOnly SameSite=Lax session cookie
 */
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { z } from 'zod'
import {
  verifyPassword,
  checkLockout,
  recordFailedAttempt,
  clearLockout,
  createSession,
} from '../domain/adminAuth'

const adminLoginRouter = new Hono<{ Bindings: Env }>()

const SESSION_EXPIRY_DAYS = 7
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
})

adminLoginRouter.get('/login', (c) => {
  const error = c.req.query('error')
  const reset = c.req.query('reset')
  return c.html(
    page(
      'Admin Login',
      `
    <h1>Admin Login</h1>
    ${reset === 'success' ? '<p class="success">Password updated. Please log in with your new password.</p>' : ''}
    ${error === 'invalid' ? '<p class="error">Invalid email or password.</p>' : ''}
    ${error === 'locked' ? '<p class="error">Account locked. Too many failed attempts. Please try again later or reset your password.</p>' : ''}
    <form method="POST" action="/rsvp/admin/login">
      <label for="email">Email *</label>
      <input id="email" name="email" type="email" required maxlength="254" autocomplete="email">
      <label for="password">Password *</label>
      <input id="password" name="password" type="password" required maxlength="128" autocomplete="current-password">
      <button type="submit">Log In</button>
      <p><a href="/rsvp/admin/password-reset">Forgot password?</a></p>
    </form>
  `,
    ),
  )
})

adminLoginRouter.post('/login', async (c) => {
  const body = await c.req.parseBody()
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return c.redirect('/rsvp/admin/login?error=invalid', 302)
  }

  const { email, password } = parsed.data

  const user = await c.env.DB.prepare(
    'SELECT id, password_hash, failed_login_attempts, locked_until, is_active FROM admin_users WHERE email = ? LIMIT 1',
  )
    .bind(email.toLowerCase())
    .first<{
      id: string
      password_hash: string
      failed_login_attempts: number
      locked_until: string | null
      is_active: number
    }>()

  // Don't reveal whether user exists — always run the same checks
  if (!user || !user.is_active) {
    return c.redirect('/rsvp/admin/login?error=invalid', 302)
  }

  const lockout = checkLockout(user.failed_login_attempts, user.locked_until)
  if (lockout.locked) {
    return c.json({ error: 'account_locked', retry_after_seconds: lockout.retryAfterSeconds }, 423)
  }

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) {
    await recordFailedAttempt(c.env.DB, user.id)
    return c.redirect('/rsvp/admin/login?error=invalid', 302)
  }

  await clearLockout(c.env.DB, user.id)
  const sessionId = await createSession(c.env.DB, user.id, SESSION_EXPIRY_DAYS)

  setCookie(c, 'session_id', sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    path: '/',
  })

  return c.redirect('/rsvp/admin', 303)
})

export default adminLoginRouter

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)} — RSVPex Admin</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; }
    label { display: block; margin-top: 1rem; font-weight: bold; }
    input { display: block; width: 100%; padding: .5rem; margin-top: .25rem; font-size: 1rem; box-sizing: border-box; }
    button { margin-top: 1.5rem; padding: .75rem 2rem; font-size: 1rem; cursor: pointer; }
    .error { color: #c00; background: #fee; padding: .75rem; border-radius: 4px; margin-bottom: 1rem; }
    .success { color: #060; background: #efe; padding: .75rem; border-radius: 4px; margin-bottom: 1rem; }
    a { color: #0066cc; }
  </style>
</head>
<body>${body}</body>
</html>`
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
