import { Hono } from 'hono'
import healthRouter from './routes/health'
import rsvpFormRouter from './routes/rsvpForm'
import rsvpSubmitRouter from './routes/rsvpSubmit'
import thankYouRouter from './routes/rsvpThankYou'

const app = new Hono<{ Bindings: Env }>()

app.route('/rsvp', healthRouter)

// Phase 3: Thank-you, ICS, Edit (registered before rsvpForm to avoid /:slug catch-all)
app.route('/rsvp', thankYouRouter)

// Phase 2: Public RSVP form
app.route('/rsvp', rsvpFormRouter)
app.route('/rsvp', rsvpSubmitRouter)

export default app
