import { Hono } from 'hono'
import healthRouter from './routes/health'

const app = new Hono<{ Bindings: Env }>()

app.route('/rsvp', healthRouter)

export default app
