// app/src/routes/adminInviteAccept.ts
/**
 * Admin invite acceptance endpoint (public, token-based).
 *
 * GET /rsvp/admin/invite/accept?token=... — Display password-set form
 * POST /rsvp/admin/invite/accept — Consume token, create admin account, set password
 *
 * @req ADMIN-03 — Invite acceptance and account creation
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { consumeInvite } from '../domain/adminInvites'
import { hashPassword } from '../domain/adminAuth'
import { adminAuthRateLimit } from '../middleware/rateLimit'
import { escHtml } from '../views/layout'

const adminInviteAcceptRouter = new Hono<{ Bindings: Env }>()

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12).max(128),
})

adminInviteAcceptRouter.get('/invite/accept', (c) => {
  const token = c.req.query('token') ?? ''
  return c.html(
    page(
      'Set Up Your Account',
      `
      <h1>Set Up Your Admin Account</h1>
      <p>Welcome! Create a password to complete your setup.</p>
      <form method="POST" action="/rsvp/admin/invite/accept">
        <input type="hidden" name="token" value="${escHtml(token)}">
        <label for="password">Password * (min 12 characters)</label>
        <input id="password" name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password">
        <button type="submit">Create Account</button>
      </form>
      `,
    ),
  )
})

adminInviteAcceptRouter.post('/invite/accept', adminAuthRateLimit(), async (c) => {
  const body = await c.req.parseBody()
  const parsed = acceptSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'validation_failed', issues: parsed.error.issues }, 400)
  }

  const { token, password } = parsed.data
  const result = await consumeInvite(c.env.DB, token)

  if (!result) {
    return c.json({ error: 'invite_expired_or_invalid' }, 410)
  }

  // Fetch the role from admin_invites table
  const inviteRow = await c.env.DB.prepare(
    'SELECT role FROM admin_invites WHERE email = ? AND used_at IS NOT NULL LIMIT 1',
  )
    .bind(result.email)
    .first<{ role: string }>()

  const role = inviteRow?.role ?? 'editor'
  const passwordHash = await hashPassword(password, c.env.ARGON2_PEPPER)
  const id = crypto.randomUUID()

  // Conditional INSERT (C-12): only if email not already an admin
  const insertResult = await c.env.DB.prepare(
    `INSERT INTO admin_users (id, email, password_hash, role, is_active)
     SELECT ?, ?, ?, ?, 1 WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE email = ?)`,
  )
    .bind(id, result.email, passwordHash, role, result.email)
    .run()

  if (insertResult.meta.changes === 0) {
    return c.json({ error: 'account_already_exists' }, 409)
  }

  return c.redirect('/rsvp/admin/login?invite=success', 303)
})

export default adminInviteAcceptRouter

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
    .error { color: #c00; background: #fee; padding: .75rem; border-radius: 4px; }
    a { color: #0066cc; }
  </style>
</head>
<body>${body}</body>
</html>`
}
