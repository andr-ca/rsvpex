/**
 * Health check route.
 * @req SEC-05
 */
import { Hono } from 'hono'

const healthRouter = new Hono<{ Bindings: Env }>()

healthRouter.get('/healthz', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1').first()
    return c.json({ status: 'ok', db: 'ok' })
  } catch {
    return c.json({ status: 'error', db: 'down' }, 503)
  }
})

export default healthRouter
