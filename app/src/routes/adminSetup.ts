// app/src/routes/adminSetup.ts
/**
 * One-time admin bootstrap — GET /rsvp/admin/setup, POST /rsvp/admin/setup
 *
 * Creates the first admin user. Returns 409 if any admin user already exists.
 * This endpoint is open (no auth required) but safe: it is a no-op after first use.
 *
 * @req ADMIN-01 — admin user creation with argon2id password hash
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { hashPassword } from '../domain/adminAuth'
import { timingSafeEqual } from '../domain/tokens'

const adminSetupRouter = new Hono<{ Bindings: Env }>()

const setupSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  display_name: z.string().max(100).optional(),
  setup_secret: z.string().optional(),
})

adminSetupRouter.get('/setup', (c) => {
  return c.html(
    page(
      'Admin Setup',
      `
    <h1>Admin Setup</h1>
    <p>Create the first administrator account.</p>
    <form method="POST" action="/rsvp/admin/setup">
      <label for="email">Email *</label>
      <input id="email" name="email" type="email" required maxlength="254" autocomplete="email">
      <label for="display_name">Display Name</label>
      <input id="display_name" name="display_name" type="text" maxlength="100">
      <label for="password">Password * (min 12 characters)</label>
      <input id="password" name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password">
      <label for="setup_secret">Setup Secret *</label>
      <input id="setup_secret" name="setup_secret" type="password" maxlength="200" autocomplete="off">
      <p style="font-size:.85rem;color:#666">Provided out-of-band by whoever deployed this app (the SETUP_SECRET value).</p>
      <button type="submit">Create Admin Account</button>
    </form>
  `,
    ),
  )
})

adminSetupRouter.post('/setup', async (c) => {
  // Block if any admin user already exists
  const existing = await c.env.DB.prepare('SELECT id FROM admin_users LIMIT 1').first()
  if (existing) {
    return c.json({ error: 'already_set_up' }, 409)
  }

  const body = await c.req.parseBody()
  const parsed = setupSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'validation_failed', issues: parsed.error.issues }, 400)
  }

  const { email, password, display_name, setup_secret } = parsed.data

  // If SETUP_SECRET is configured (production), require a matching value.
  // Unset in local/test environments so setup isn't gated during development.
  if (c.env.SETUP_SECRET) {
    if (!setup_secret || !timingSafeEqual(setup_secret, c.env.SETUP_SECRET)) {
      return c.json({ error: 'invalid_setup_secret' }, 403)
    }
  }

  const passwordHash = await hashPassword(password, c.env.ARGON2_PEPPER)
  const id = crypto.randomUUID()

  // Race-safety (C-12 in recommendations.md): two concurrent first-run POSTs could
  // both pass the SELECT check above. The email UNIQUE index doesn't help if the
  // emails differ, so guard with a conditional INSERT that only fires when the
  // table is still empty, and treat the resulting no-op as "already set up".
  const result = await c.env.DB.prepare(
    `INSERT INTO admin_users (id, email, password_hash, display_name)
     SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM admin_users)`,
  )
    .bind(id, email.toLowerCase(), passwordHash, display_name ?? null)
    .run()

  if (result.meta.changes === 0) {
    return c.json({ error: 'already_set_up' }, 409)
  }

  return c.redirect('/rsvp/admin/login', 303)
})

export default adminSetupRouter

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

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
