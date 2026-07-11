// app/src/middleware/requireOwner.ts
/**
 * Owner role guard middleware.
 *
 * Assumes requireAdmin is already applied (c.var.adminUserId is set).
 * Verifies that the authenticated admin has the 'owner' role.
 * Returns 403 if the user is not an Owner.
 *
 * @req ADMIN-03 — Owner-only admin management routes
 */
import { createMiddleware } from 'hono/factory'

export const requireOwner = createMiddleware<{ Bindings: Env; Variables: { adminUserId: string } }>(
  async (c, next) => {
    const adminUserId = c.var.adminUserId
    if (!adminUserId) {
      return c.redirect('/rsvp/admin/login', 302)
    }

    const adminUser = await c.env.DB.prepare(
      'SELECT role FROM admin_users WHERE id = ? AND is_active = 1',
    )
      .bind(adminUserId)
      .first<{ role: string }>()

    if (!adminUser || adminUser.role !== 'owner') {
      return c.json({ error: 'forbidden_role' }, 403)
    }

    await next()
  },
)
