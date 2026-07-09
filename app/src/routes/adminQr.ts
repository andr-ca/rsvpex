// app/src/routes/adminQr.ts
/**
 * QR code download for an event.
 * Returns a 512x512 PNG data URL page with a download link.
 *
 * @req ADMIN-07 — QR code PNG (512×512) downloadable, encodes event URL
 */
import { Hono } from 'hono'
import QRCode from 'qrcode'
import { getEvent } from '../domain/adminEvents'
import { requireAdmin } from '../middleware/requireAdmin'
import { escHtml } from '../views/layout'

const adminQrRouter = new Hono<{ Bindings: Env; Variables: { adminUserId: string } }>()

adminQrRouter.use('/rsvp/admin/events/*', requireAdmin)

adminQrRouter.get('/rsvp/admin/events/:id/qr', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.notFound()

  const baseUrl = new URL(c.req.url).origin
  const token = event.access_token ? `?t=${event.access_token}` : ''
  const eventUrl = `${baseUrl}/rsvp/${event.slug}${token}`

  // Generate QR PNG as data URL (pure JS, Workers-compatible)
  const dataUrl = await QRCode.toDataURL(eventUrl, { width: 512, margin: 2 })

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QR Code — ${escHtml(event.title)}</title>
  <style>body{font-family:system-ui,sans-serif;max-width:600px;margin:3rem auto;padding:0 1rem;text-align:center}
  img{border:1px solid #eee;padding:1rem;border-radius:8px} a{display:inline-block;margin-top:1rem;padding:.75rem 2rem;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px}</style>
</head>
<body>
  <h1>${escHtml(event.title)} — QR Code</h1>
  <p>Encodes: <code>${escHtml(eventUrl)}</code></p>
  <img src="${dataUrl}" alt="QR code for ${escHtml(event.title)}" width="256" height="256">
  <br>
  <a href="${dataUrl}" download="${escHtml(event.slug)}-qr.png">Download PNG</a>
  <br><br>
  <a href="/rsvp/admin/events/${escHtml(event.id)}">← Back to Event</a>
</body>
</html>`)
})

export default adminQrRouter
