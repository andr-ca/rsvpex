import { Hono } from 'hono'

/**
 * Health check route.
 * @req SEC-05
 */
const healthRouter = new Hono<{ Bindings: Env }>()

healthRouter.get('/healthz', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1').first()
    return c.json({ status: 'ok', db: 'ok' })
  } catch (e) {
    return c.json({ status: 'error', db: 'down' }, 503)
  }
})

export default healthRouter
