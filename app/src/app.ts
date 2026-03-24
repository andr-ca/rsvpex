import { Hono } from 'hono'
import { methodOverride } from 'hono/method-override'
import healthRouter from './routes/health'
import rsvpFormRouter from './routes/rsvpForm'
import rsvpSubmitRouter from './routes/rsvpSubmit'
import rsvpPatchRouter from './routes/rsvpPatch'
import thankYouRouter from './routes/rsvpThankYou'
import icsRouter from './routes/rsvpIcs'
import adminSetupRouter from './routes/adminSetup'
import adminLoginRouter from './routes/adminLogin'
import adminLogoutRouter from './routes/adminLogout'
import adminPasswordResetRouter from './routes/adminPasswordReset'
import { adminDashboardHandler } from './routes/adminDashboard'
import { requireAdmin } from './middleware/requireAdmin'

const app = new Hono<{ Bindings: Env }>()

app.use('*', methodOverride({ app }))

app.route('/rsvp', healthRouter)

// Phase 3: Thank-you, ICS, Edit (registered before rsvpForm to avoid /:slug catch-all)
app.route('/rsvp', thankYouRouter)
app.route('/rsvp', icsRouter)

// Phase 2: Public RSVP form
app.route('/rsvp', rsvpFormRouter)
app.route('/rsvp', rsvpSubmitRouter)
app.route('/rsvp', rsvpPatchRouter)

// Phase 4: Admin auth — public endpoints (no requireAdmin)
app.route('/rsvp/admin', adminSetupRouter)
app.route('/rsvp/admin', adminLoginRouter)
app.route('/rsvp/admin', adminLogoutRouter)
app.route('/rsvp/admin', adminPasswordResetRouter)

// Phase 4: Protected admin routes
app.get('/rsvp/admin/', requireAdmin, adminDashboardHandler)

export default app
