// app/src/routes/adminSignup.ts
/**
 * Public host signup — GET /rsvp/admin/signup (form), POST /rsvp/admin/signup (create account)
 *
 * No authentication required. Rate-limited to prevent abuse.
 * Creates a new admin_users row with role='host' (self-service registration).
 *
 * @req HOST-REGISTRATION — Public self-service signup without invite codes
 */
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { z } from 'zod'
import { hashPassword, createSession } from '../domain/adminAuth'
import { adminAuthRateLimit } from '../middleware/rateLimit'
import { escHtml } from '../views/layout'

const adminSignupRouter = new Hono<{ Bindings: Env }>()

const SESSION_EXPIRY_DAYS = 7

const signupSchema = z.object({
  email: z.string().email('Invalid email').max(254),
  password: z.string().min(12, 'Password must be at least 12 characters').max(128),
  displayName: z.string().max(100).optional(),
})

/**
 * GET /rsvp/admin/signup — Serve signup form (public, no auth required)
 */
adminSignupRouter.get('/signup', (c) => {
  return c.html(
    page(
      'Sign Up as Host',
      `
    <h1>Create Your Host Account</h1>
    <form method="post" action="/rsvp/admin/signup" class="auth-form">
      <label for="email">Email *</label>
      <input id="email" name="email" type="email" required maxlength="254" autocomplete="email">
      <label for="password">Password (min 12 characters) *</label>
      <input id="password" name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password">
      <label for="displayName">Display Name (optional)</label>
      <input id="displayName" name="displayName" type="text" maxlength="100">
      <button type="submit">Sign Up</button>
      <p>Already have an account? <a href="/rsvp/admin/login">Log in</a></p>
    </form>
  `,
    ),
  )
})

/**
 * POST /rsvp/admin/signup — Create a new host account
 *
 * Rate-limited: 5 requests per minute per IP (adminAuthRateLimit)
 * Duplicate email: Returns 409 with friendly message and password reset link
 * Success: Redirect to /rsvp/admin/login (302)
 */
adminSignupRouter.post('/signup', adminAuthRateLimit(), async (c) => {
  const body = await c.req.parseBody()

  // Extract string values from form data (parseBody returns Record<string, string | File>)
  const emailValue = body['email']
  const passwordValue = body['password']
  const displayNameValue = body['displayName']

  // Safely extract string values
  const emailStr = typeof emailValue === 'string' ? emailValue : ''
  const passwordStr = typeof passwordValue === 'string' ? passwordValue : ''
  const displayNameStr = typeof displayNameValue === 'string' ? displayNameValue : ''

  // Validate form input
  const validation = signupSchema.safeParse({
    email: emailStr,
    password: passwordStr,
    displayName: displayNameStr || undefined,
  })

  if (!validation.success) {
    const errors = validation.error.flatten().fieldErrors
    const errorList = Object.entries(errors)
      .map(
        ([field, msgs]) =>
          `<p class="error">${escHtml(field)}: ${escHtml(msgs?.[0] || 'Invalid')}</p>`,
      )
      .join('')

    return c.html(
      page(
        'Sign Up — Error',
        `
      <h1>Sign Up</h1>
      <div class="error-messages">
        ${errorList}
      </div>
      <form method="post" action="/rsvp/admin/signup" class="auth-form">
        <label for="email">Email *</label>
        <input id="email" name="email" type="email" value="${escHtml(emailStr)}" required maxlength="254" autocomplete="email">
        <label for="password">Password *</label>
        <input id="password" name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password">
        <label for="displayName">Display Name (optional)</label>
        <input id="displayName" name="displayName" type="text" value="${escHtml(displayNameStr)}" maxlength="100">
        <button type="submit">Sign Up</button>
      </form>
    `,
      ),
      400,
    )
  }

  const { email, password, displayName } = validation.data

  // Hash password with pepper
  const passwordHash = await hashPassword(password, c.env.ARGON2_PEPPER)
  const id = crypto.randomUUID()

  // Conditional INSERT: race-safe (C-12 pattern from adminSetup.ts)
  // If email already exists, meta.changes === 0
  const result = await c.env.DB.prepare(
    `
    INSERT INTO admin_users (id, email, password_hash, display_name, role, is_active, created_at)
    SELECT ?, ?, ?, ?, 'host', 1, datetime('now')
    WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE email = ?)
  `,
  )
    .bind(id, email.toLowerCase(), passwordHash, displayName ?? null, email.toLowerCase())
    .run()

  if (result.meta.changes === 0) {
    // Email already exists
    return c.html(
      page(
        'Sign Up — Email in Use',
        `
      <h1>Email Already in Use</h1>
      <p>This email is already registered.</p>
      <p><a href="/rsvp/admin/password-reset">Reset your password?</a></p>
      <p><a href="/rsvp/admin/login">Go back to login</a></p>
    `,
      ),
      409,
    )
  }

  // Success: Auto-login the new host
  const sessionId = await createSession(c.env.DB, id, SESSION_EXPIRY_DAYS)

  setCookie(c, 'session_id', sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    path: '/',
  })

  return c.redirect('/rsvp/admin', 303)
})

export default adminSignupRouter

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
    .error-messages { margin-bottom: 1.5rem; }
    a { color: #0066cc; }
  </style>
</head>
<body>${body}</body>
</html>`
}
