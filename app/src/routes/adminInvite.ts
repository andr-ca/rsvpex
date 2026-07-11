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
import { requireAdmin } from '../middleware/requireAdmin'
import { requireOwner } from '../middleware/requireOwner'
import { adminAuthRateLimit } from '../middleware/rateLimit'
import { escHtml, csrfField, adminPage } from '../views/layout'

const adminInviteRouter = new Hono<{ Bindings: Env; Variables: { csrfToken?: string } }>()

const inviteSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(['owner', 'editor']).default('editor'),
})

adminInviteRouter.get('/admins/invite', requireAdmin, requireOwner, (c) => {
  const csrfToken = c.get('csrfToken') ?? ''
  return c.html(
    adminPage(
      'Invite Admin — RSVPex Admin',
      `
      <h1>Invite a New Admin</h1>
      <form method="POST" action="/rsvp/admin/admins/invite">
        ${csrfField(csrfToken)}
        <label for="email">Email *</label>
        <input id="email" name="email" type="email" required maxlength="254" autocomplete="email">
        <label for="role">Role *</label>
        <select id="role" name="role" required>
          <option value="editor">Editor</option>
          <option value="owner">Owner</option>
        </select>
        <button type="submit" class="btn btn-primary">Send Invite</button>
      </form>
      <p style="margin-top:1.5rem;"><a href="/rsvp/admin/admins">Back to Admin List</a></p>
      `,
      csrfToken,
    ),
  )
})

adminInviteRouter.post(
  '/admins/invite',
  requireAdmin,
  requireOwner,
  adminAuthRateLimit(),
  async (c) => {
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
      adminPage(
        'Invite Sent — RSVPex Admin',
        `
      <h1>Invite Sent</h1>
      <p>An invitation link has been sent to ${escHtml(email)}.</p>
      <p>If email isn't working, you can share this link directly:</p>
      <code style="word-break:break-all;">${escHtml(inviteUrl)}</code>
      <p style="margin-top:1.5rem;"><a href="/rsvp/admin/admins">Back to Admin List</a></p>
      `,
        c.get('csrfToken'),
      ),
    )
  },
)

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
