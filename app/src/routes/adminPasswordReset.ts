// app/src/routes/adminPasswordReset.ts
/**
 * Password reset flow:
 *   GET  /rsvp/admin/password-reset        — request form
 *   POST /rsvp/admin/password-reset        — send reset email
 *   GET  /rsvp/admin/password-reset/confirm — confirm form (token via query param)
 *   POST /rsvp/admin/password-reset/confirm — consume token + set new password
 *
 * @req ADMIN-02 — 15-min single-use token; second use returns 410
 */
import { Hono } from 'hono'
import { z } from 'zod'
import {
  createResetToken,
  consumeResetToken,
  hashPassword,
  clearLockout,
} from '../domain/adminAuth'

const adminPasswordResetRouter = new Hono<{ Bindings: Env }>()

const requestSchema = z.object({ email: z.string().email().max(254) })
const confirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12).max(128),
})

const RESET_EXPIRY_MINUTES = 15

adminPasswordResetRouter.get('/password-reset', (c) => {
  return c.html(
    page(
      'Password Reset',
      `
    <h1>Reset Password</h1>
    <p>Enter your email address and we'll send a reset link.</p>
    <form method="POST" action="/rsvp/admin/password-reset">
      <label for="email">Email *</label>
      <input id="email" name="email" type="email" required maxlength="254" autocomplete="email">
      <button type="submit">Send Reset Link</button>
    </form>
    <p><a href="/rsvp/admin/login">Back to login</a></p>
  `,
    ),
  )
})

adminPasswordResetRouter.post('/password-reset', async (c) => {
  const body = await c.req.parseBody()
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return c.html(
      page('Password Reset', '<h1>Reset Password</h1><p class="error">Invalid email.</p>'),
      400,
    )
  }

  const { email } = parsed.data
  const user = await c.env.DB.prepare('SELECT id FROM admin_users WHERE email = ? LIMIT 1')
    .bind(email.toLowerCase())
    .first<{ id: string }>()

  // Always show success (don't reveal whether email exists)
  if (user) {
    const rawToken = await createResetToken(c.env.DB, user.id, RESET_EXPIRY_MINUTES)
    const resetUrl = `${new URL(c.req.url).origin}/rsvp/admin/password-reset/confirm?token=${rawToken}`
    await sendResetEmail(c.env, email, resetUrl)
  }

  return c.html(
    page(
      'Password Reset Sent',
      `
    <h1>Check Your Email</h1>
    <p>If an account exists for that email, a reset link has been sent. It expires in ${RESET_EXPIRY_MINUTES} minutes.</p>
    <p><a href="/rsvp/admin/login">Back to login</a></p>
  `,
    ),
  )
})

adminPasswordResetRouter.get('/password-reset/confirm', (c) => {
  const token = c.req.query('token') ?? ''
  return c.html(
    page(
      'Set New Password',
      `
    <h1>Set New Password</h1>
    <form method="POST" action="/rsvp/admin/password-reset/confirm">
      <input type="hidden" name="token" value="${escHtml(token)}">
      <label for="password">New Password * (min 12 characters)</label>
      <input id="password" name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password">
      <button type="submit">Set Password</button>
    </form>
  `,
    ),
  )
})

adminPasswordResetRouter.post('/password-reset/confirm', async (c) => {
  const body = await c.req.parseBody()
  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'validation_failed', issues: parsed.error.issues }, 400)
  }

  const { token, password } = parsed.data
  const result = await consumeResetToken(c.env.DB, token)

  if (!result) {
    return c.json({ error: 'token_expired_or_invalid' }, 410)
  }

  const newHash = await hashPassword(password)
  await c.env.DB.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?')
    .bind(newHash, result.adminUserId)
    .run()

  // Clear lockout state on password reset
  await clearLockout(c.env.DB, result.adminUserId)

  return c.redirect('/rsvp/admin/login?reset=success', 303)
})

export default adminPasswordResetRouter

async function sendResetEmail(env: Env, toEmail: string, resetUrl: string): Promise<void> {
  if (!env.RESEND_API_KEY) return // skip in dev/test without API key
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.ADMIN_FROM_EMAIL ?? 'noreply@rsvpex.app',
      to: toEmail,
      subject: 'Reset your RSVPex admin password',
      html: `<p>Click the link below to reset your password. This link expires in 15 minutes.</p>
             <p><a href="${resetUrl}">${resetUrl}</a></p>
             <p>If you did not request a password reset, ignore this email.</p>`,
    }),
  })
}

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
