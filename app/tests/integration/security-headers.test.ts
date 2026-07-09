// app/tests/integration/security-headers.test.ts
/**
 * @req SEC-06 — strict CSP + security headers on every response
 */
import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import app from '../../src/app'

describe('security response headers', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM rsvps; DELETE FROM events; DELETE FROM audit_logs;')
  })

  it('sets CSP on public RSVP form with Turnstile directives', async () => {
    await env.DB.prepare(
      `INSERT INTO events (id, title, slug, status, visibility, timezone, start_at, max_guests_total, max_party_size_per_rsvp, locale)
       VALUES (?, 'Test', 'sec-test', 'published', 'public', 'UTC', '2099-01-01T00:00:00Z', 100, 10, 'en')`,
    )
      .bind(crypto.randomUUID())
      .run()

    const res = await app.fetch(new Request('http://localhost/rsvp/sec-test'), env)
    const csp = res.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain('challenges.cloudflare.com')
    // Public CSP should NOT include cdn.jsdelivr.net
    expect(csp).not.toContain('cdn.jsdelivr.net')
  })

  it('sets X-Frame-Options DENY on all responses', async () => {
    const res = await app.fetch(new Request('http://localhost/rsvp/healthz'), env)
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('sets X-Content-Type-Options nosniff', async () => {
    const res = await app.fetch(new Request('http://localhost/rsvp/healthz'), env)
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('sets Referrer-Policy strict-origin-when-cross-origin', async () => {
    const res = await app.fetch(new Request('http://localhost/rsvp/healthz'), env)
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('CSP allows cdn.jsdelivr.net for admin pages (Chart.js)', async () => {
    const res = await app.fetch(new Request('http://localhost/rsvp/admin/login'), env)
    const csp = res.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain('cdn.jsdelivr.net')
  })

  // S-13 in recommendations.md: HSTS, Permissions-Policy, and CSP frame-ancestors
  // were all missing entirely — added alongside the pre-existing headers above.
  it('sets Strict-Transport-Security with a 1-year max-age and includeSubDomains', async () => {
    const res = await app.fetch(new Request('http://localhost/rsvp/healthz'), env)
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains')
  })

  it('sets a Permissions-Policy that denies camera/microphone/geolocation/payment/usb', async () => {
    const res = await app.fetch(new Request('http://localhost/rsvp/healthz'), env)
    const policy = res.headers.get('Permissions-Policy') ?? ''
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
      expect(policy).toContain(`${feature}=()`)
    }
  })

  it("CSP includes frame-ancestors 'none' on both public and admin routes", async () => {
    const publicRes = await app.fetch(new Request('http://localhost/rsvp/healthz'), env)
    expect(publicRes.headers.get('Content-Security-Policy') ?? '').toContain(
      "frame-ancestors 'none'",
    )

    const adminRes = await app.fetch(new Request('http://localhost/rsvp/admin/login'), env)
    expect(adminRes.headers.get('Content-Security-Policy') ?? '').toContain(
      "frame-ancestors 'none'",
    )
  })

  it('HSTS and Permissions-Policy are present on admin routes too', async () => {
    const res = await app.fetch(new Request('http://localhost/rsvp/admin/login'), env)
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains')
    expect(res.headers.get('Permissions-Policy')).toBeTruthy()
  })
})
