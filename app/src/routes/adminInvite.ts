// app/src/routes/adminInvite.ts
/**
 * Admin invite endpoints (Owner only).
 *
 * GET /rsvp/admin/admins/invite — Display invite form
 * POST /rsvp/admin/admins/invite — Create invite and send email
 *
 * @req ADMIN-03 — Owner-only admin provisioning
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { createInvite } from '../domain/adminInvites'
import { requireOwner } from '../middleware/requireOwner'
import { adminAuthRateLimit } from '../middleware/rateLimit'
import { escHtml } from '../views/layout'

const adminInviteRouter = new Hono<{ Bindings: Env }>()

const inviteSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(['owner', 'editor']).default('editor'),
})

adminInviteRouter.get('/admins/invite', requireOwner, (c) => {
  return c.html(
    page(
      'Invite Admin',
      `
      <h1>Invite a New Admin</h1>
      <form method="POST" action="/rsvp/admin/admins/invite">
        <label for="email">Email *</label>
        <input id="email" name="email" type="email" required maxlength="254" autocomplete="email">
        <label for="role">Role *</label>
        <select id="role" name="role" required>
          <option value="editor">Editor</option>
          <option value="owner">Owner</option>
        </select>
        <button type="submit">Send Invite</button>
      </form>
      <p><a href="/rsvp/admin/admins">Back to Admin List</a></p>
      `,
    ),
  )
})

adminInviteRouter.post('/admins/invite', requireOwner, adminAuthRateLimit(), async (c) => {
  const body = await c.req.parseBody()
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'validation_failed', issues: parsed.error.issues }, 400)
  }

  const { email, role } = parsed.data

  // Check if email is already an admin
  const existing = await c.env.DB.prepare('SELECT id FROM admin_users WHERE email = ?')
    .bind(email.toLowerCase())
    .first()

  if (existing) {
    return c.json({ error: 'already_admin' }, 409)
  }

  const rawToken = await createInvite(c.env.DB, email.toLowerCase(), role, 10_080)
  const baseUrl = c.env.DEPLOYMENT_DOMAIN ?? new URL(c.req.url).origin
  const inviteUrl = `${baseUrl}/rsvp/admin/invite/accept?token=${rawToken}`

  await sendInviteEmail(c.env, email, inviteUrl)

  return c.html(
    page(
      'Invite Sent',
      `
      <h1>Invite Sent</h1>
      <p>An invitation link has been sent to ${escHtml(email)}.</p>
      <p>If email isn't working, you can share this link directly:</p>
      <code style="word-break:break-all;">${escHtml(inviteUrl)}</code>
      <p><a href="/rsvp/admin/admins">Back to Admin List</a></p>
      `,
    ),
  )
})

export default adminInviteRouter

async function sendInviteEmail(env: Env, toEmail: string, inviteUrl: string): Promise<void> {
  if (!env.RESEND_API_KEY) return

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.ADMIN_FROM_EMAIL ?? 'noreply@rsvpex.app',
      to: toEmail,
      subject: "You're invited to RSVPex admin",
      html: `<p>You've been invited to manage RSVPex.</p>
             <p><a href="${escHtml(inviteUrl)}">Click here to set up your account</a></p>
             <p>This link expires in 7 days.</p>`,
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
    input, select { display: block; width: 100%; padding: .5rem; margin-top: .25rem; font-size: 1rem; box-sizing: border-box; }
    button { margin-top: 1.5rem; padding: .75rem 2rem; font-size: 1rem; cursor: pointer; }
    .error { color: #c00; background: #fee; padding: .75rem; border-radius: 4px; }
    a { color: #0066cc; }
    code { background: #f5f5f5; padding: .25rem .5rem; border-radius: 3px; font-family: monospace; font-size: 0.9rem; }
  </style>
</head>
<body>${body}</body>
</html>`
}
