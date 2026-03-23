import { Hono } from 'hono'
import healthRouter from './routes/health'
import rsvpFormRouter from './routes/rsvpForm'
import rsvpSubmitRouter from './routes/rsvpSubmit'

const app = new Hono<{ Bindings: Env }>()

app.route('/rsvp', healthRouter)

// Phase 2: Public RSVP form
app.route('/rsvp', rsvpFormRouter)
app.route('/rsvp', rsvpSubmitRouter)

// Phase 3 stub: thank-you page
app.get('/rsvp/thank-you', (c) => {
  const rid = c.req.query('rid') ?? ''
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Thank You — RSVPex</title></head>
<body>
  <h1>Thank you for your RSVP!</h1>
  <p>Your response has been recorded. Reference: ${rid.replace(/[^a-zA-Z0-9-]/g, '')}</p>
</body>
</html>`)
})

export default app
