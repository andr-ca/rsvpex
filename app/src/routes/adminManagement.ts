// app/src/routes/adminManagement.ts
/**
 * Admin management endpoints (Owner only).
 *
 * GET /rsvp/admin/admins — List all admins
 * POST /rsvp/admin/admins/:id/deactivate — Deactivate an admin
 * POST /rsvp/admin/admins/:id/reactivate — Reactivate an admin
 * POST /rsvp/admin/admins/:id/promote — Promote editor to owner
 * POST /rsvp/admin/admins/:id/demote — Demote owner to editor
 *
 * @req ADMIN-03 — Owner-only admin management
 */
import { Hono } from 'hono'
import { deleteAllSessionsForUser } from '../domain/adminAuth'
import { requireAdmin } from '../middleware/requireAdmin'
import { requireOwner } from '../middleware/requireOwner'
import { escHtml } from '../views/layout'

const adminManagementRouter = new Hono<{ Bindings: Env; Variables: { adminUserId: string } }>()

type AdminUser = {
  id: string
  email: string
  display_name: string | null
  role: string
  is_active: number
  created_at: string
}

adminManagementRouter.get('/admins', requireAdmin, requireOwner, async (c) => {
  const currentUserId = c.var.adminUserId
  const result = await c.env.DB.prepare(
    'SELECT id, email, display_name, role, is_active, created_at FROM admin_users ORDER BY created_at',
  ).all<AdminUser>()

  const admins = result.results || []

  return c.html(
    page(
      'Admin List',
      `
      <h1>Admin Management</h1>
      <p><a href="/rsvp/admin/admins/invite" class="button">+ Invite New Admin</a></p>

      <table style="width:100%; border-collapse:collapse; margin-top:1.5rem;">
        <thead>
          <tr style="border-bottom:2px solid #ccc;">
            <th style="text-align:left; padding:.5rem;">Email</th>
            <th style="text-align:left; padding:.5rem;">Display Name</th>
            <th style="text-align:center; padding:.5rem;">Role</th>
            <th style="text-align:center; padding:.5rem;">Status</th>
            <th style="text-align:center; padding:.5rem;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${admins
            .map(
              (admin) => `
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:.5rem;">${escHtml(admin.email)}</td>
              <td style="padding:.5rem;">${admin.display_name ? escHtml(admin.display_name) : '—'}</td>
              <td style="text-align:center; padding:.5rem;"><strong>${admin.role}</strong></td>
              <td style="text-align:center; padding:.5rem;">${admin.is_active ? '✓ Active' : '○ Inactive'}</td>
              <td style="text-align:center; padding:.5rem;">
                ${renderActions(admin, currentUserId)}
              </td>
            </tr>
            `,
            )
            .join('')}
        </tbody>
      </table>

      <p style="margin-top:2rem;"><a href="/rsvp/admin">Back to Dashboard</a></p>
      `,
    ),
  )
})

adminManagementRouter.post('/admins/:id/deactivate', requireAdmin, requireOwner, async (c) => {
  const id = c.req.param('id')
  const currentUserId = c.var.adminUserId

  if (id === currentUserId) {
    return c.json({ error: 'cannot_deactivate_self' }, 400)
  }

  const admin = await c.env.DB.prepare('SELECT role, is_active FROM admin_users WHERE id = ?')
    .bind(id)
    .first<{ role: string; is_active: number }>()
  if (!admin) return c.json({ error: 'not_found' }, 404)

  // Check if this is the last active owner
  if (admin.role === 'owner' && admin.is_active) {
    const ownerCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM admin_users WHERE is_active = 1 AND role = ?',
    )
      .bind('owner')
      .first<{ count: number }>()
    if ((ownerCount?.count ?? 0) <= 1) {
      return c.json({ error: 'cannot_deactivate_last_owner' }, 400)
    }
  }

  await c.env.DB.prepare('UPDATE admin_users SET is_active = 0 WHERE id = ?').bind(id).run()
  await deleteAllSessionsForUser(c.env.DB, id)

  return c.redirect('/rsvp/admin/admins', 303)
})

adminManagementRouter.post('/admins/:id/reactivate', requireAdmin, requireOwner, async (c) => {
  const id = c.req.param('id')
  const currentUserId = c.var.adminUserId

  if (id === currentUserId) {
    return c.json({ error: 'cannot_reactivate_self' }, 400)
  }

  const admin = await c.env.DB.prepare('SELECT id FROM admin_users WHERE id = ?')
    .bind(id)
    .first()
  if (!admin) return c.json({ error: 'not_found' }, 404)

  await c.env.DB.prepare('UPDATE admin_users SET is_active = 1 WHERE id = ?').bind(id).run()

  return c.redirect('/rsvp/admin/admins', 303)
})

adminManagementRouter.post('/admins/:id/promote', requireAdmin, requireOwner, async (c) => {
  const id = c.req.param('id')
  const currentUserId = c.var.adminUserId

  if (id === currentUserId) {
    return c.json({ error: 'cannot_promote_self' }, 400)
  }

  const admin = await c.env.DB.prepare('SELECT role, is_active FROM admin_users WHERE id = ?')
    .bind(id)
    .first<{ role: string; is_active: number }>()
  if (!admin) return c.json({ error: 'not_found' }, 404)
  if (admin.role !== 'editor') {
    return c.json({ error: 'already_owner' }, 400)
  }

  await c.env.DB.prepare('UPDATE admin_users SET role = ? WHERE id = ?')
    .bind('owner', id)
    .run()

  return c.redirect('/rsvp/admin/admins', 303)
})

adminManagementRouter.post('/admins/:id/demote', requireAdmin, requireOwner, async (c) => {
  const id = c.req.param('id')
  const currentUserId = c.var.adminUserId

  if (id === currentUserId) {
    return c.json({ error: 'cannot_demote_self' }, 400)
  }

  const admin = await c.env.DB.prepare('SELECT role, is_active FROM admin_users WHERE id = ?')
    .bind(id)
    .first<{ role: string; is_active: number }>()
  if (!admin) return c.json({ error: 'not_found' }, 404)
  if (admin.role !== 'owner') {
    return c.json({ error: 'not_owner' }, 400)
  }

  // Check if this is the last active owner
  if (admin.is_active) {
    const ownerCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM admin_users WHERE is_active = 1 AND role = ?',
    )
      .bind('owner')
      .first<{ count: number }>()
    if ((ownerCount?.count ?? 0) <= 1) {
      return c.json({ error: 'cannot_demote_last_owner' }, 400)
    }
  }

  await c.env.DB.prepare('UPDATE admin_users SET role = ? WHERE id = ?')
    .bind('editor', id)
    .run()
  await deleteAllSessionsForUser(c.env.DB, id)

  return c.redirect('/rsvp/admin/admins', 303)
})

export default adminManagementRouter

function renderActions(admin: AdminUser, currentUserId: string): string {
  const isSelf = admin.id === currentUserId
  const isActive = admin.is_active === 1
  const isOwner = admin.role === 'owner'

  if (isSelf) {
    return '<em style="color:#999;">(self)</em>'
  }

  let actions = ''

  if (isActive) {
    actions += `
      <form method="POST" action="/rsvp/admin/admins/${admin.id}/deactivate" style="display:inline;">
        <button type="submit" onclick="return confirm('Deactivate this admin? They will be logged out.')">Deactivate</button>
      </form>
    `
  } else {
    actions += `
      <form method="POST" action="/rsvp/admin/admins/${admin.id}/reactivate" style="display:inline;">
        <button type="submit">Reactivate</button>
      </form>
    `
  }

  if (isOwner) {
    actions += `
      <form method="POST" action="/rsvp/admin/admins/${admin.id}/demote" style="display:inline;">
        <button type="submit" onclick="return confirm('Demote to editor?')">Demote</button>
      </form>
    `
  } else {
    actions += `
      <form method="POST" action="/rsvp/admin/admins/${admin.id}/promote" style="display:inline;">
        <button type="submit" onclick="return confirm('Promote to owner?')">Promote</button>
      </form>
    `
  }

  return actions
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)} — RSVPex Admin</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }
    h1 { margin-top: 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f5f5f5; font-weight: bold; border-bottom: 2px solid #ccc; }
    button { padding: 0.4rem 0.8rem; margin: 0.2rem; font-size: 0.9rem; cursor: pointer; }
    .button { display: inline-block; padding: 0.75rem 1.5rem; background: #0066cc; color: white; text-decoration: none; border-radius: 4px; }
    .button:hover { background: #0052a3; }
    a { color: #0066cc; }
    form { display: inline; }
  </style>
</head>
<body>${body}</body>
</html>`
}
