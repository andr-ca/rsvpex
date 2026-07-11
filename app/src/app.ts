import { Hono } from 'hono'
import { methodOverride } from 'hono/method-override'
import { requestLogger } from './middleware/requestLogger'
import { securityHeaders } from './middleware/securityHeaders'
import { csrfProtection } from './middleware/csrf'
import healthRouter from './routes/health'
import rsvpFormRouter from './routes/rsvpForm'
import rsvpSubmitRouter from './routes/rsvpSubmit'
import rsvpPatchRouter from './routes/rsvpPatch'
import thankYouRouter from './routes/rsvpThankYou'
import icsRouter from './routes/rsvpIcs'
import adminAssetsRouter from './routes/adminAssets'
import adminSetupRouter from './routes/adminSetup'
import adminLoginRouter from './routes/adminLogin'
import adminSignupRouter from './routes/adminSignup'
import adminLogoutRouter from './routes/adminLogout'
import adminPasswordResetRouter from './routes/adminPasswordReset'
import { adminDashboardHandler } from './routes/adminDashboard'
import adminEventsRouter from './routes/adminEvents'
import adminRsvpsRouter from './routes/adminRsvps'
import adminQrRouter from './routes/adminQr'
import adminDataRouter from './routes/adminData'
import adminInviteRouter from './routes/adminInvite'
import adminInviteAcceptRouter from './routes/adminInviteAccept'
import adminManagementRouter from './routes/adminManagement'
import { requireAdmin } from './middleware/requireAdmin'

const app = new Hono<{ Bindings: Env }>()

// Phase 10: Global middleware — outermost first
app.use('*', requestLogger())
app.use('*', securityHeaders())

// methodOverride must run BEFORE csrfProtection: it unconditionally clones
// the raw request body (hono/method-override always calls c.req.raw.clone()
// on any non-GET request) to check for a `_method` override field. clone()
// requires the underlying stream not already be locked to a reader — if
// csrfProtection ran first and called c.req.parseBody() to read the `_csrf`
// form field (which it does on every admin mutating POST that doesn't send
// the X-CSRF-Token header, i.e. every real browser form submission), the
// stream is already locked and methodOverride's clone() throws
// "ReadableStream is currently locked to a reader" — a crash Hono's
// synchronous app.fetch()-based integration tests never exercise, only a
// real streamed HTTP body under `wrangler dev` does.
app.use('*', methodOverride({ app }))
app.use('*', csrfProtection())

app.route('/rsvp', healthRouter)

// Phase 3: Thank-you, ICS, Edit (registered before rsvpForm to avoid /:slug catch-all)
app.route('/rsvp', thankYouRouter)
app.route('/rsvp', icsRouter)

// Phase 2: Public RSVP form
app.route('/rsvp', rsvpFormRouter)
app.route('/rsvp', rsvpSubmitRouter)
app.route('/rsvp', rsvpPatchRouter)

// Static assets for admin pages (no auth required — see P0-5 in recommendations.md)
app.route('/', adminAssetsRouter)

// Phase 4: Admin auth — public endpoints (no requireAdmin)
app.route('/rsvp/admin', adminSetupRouter)
app.route('/rsvp/admin', adminLoginRouter)
app.route('/rsvp/admin', adminSignupRouter)
app.route('/rsvp/admin', adminLogoutRouter)
app.route('/rsvp/admin', adminPasswordResetRouter)
app.route('/rsvp/admin', adminInviteAcceptRouter)

// Phase 4: Protected admin routes
app.get('/rsvp/admin/', requireAdmin, adminDashboardHandler)

// Phase 5: Admin Dashboard + Event/RSVP management
// NOTE: These routers use full paths (e.g. /rsvp/admin/events), so register at '/' to avoid double-prefix.
app.route('/', adminEventsRouter)
app.route('/', adminRsvpsRouter)
app.route('/', adminQrRouter)
app.route('/', adminDataRouter)

// Multi-user admin: invite and management routes (Owner only)
// Routes handle both requireAdmin and requireOwner internally
app.route('/rsvp/admin', adminInviteRouter)
app.route('/rsvp/admin', adminManagementRouter)

export default app
