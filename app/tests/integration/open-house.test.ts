/**
 * @req PUB-01 — seeded public open-house event is reachable
 */
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/app'

describe('seeded open-house event', () => {
  it('GET /rsvp/open-house renders the live public RSVP form', async () => {
    const res = await app.fetch(new Request('http://localhost/rsvp/open-house'), env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('RSVPex open house')
    expect(html).toContain('Andrey Malashenko')
    expect(html).toContain('Send my RSVP')
    expect(html).toContain('id="rsvp-form"')
    expect(html).toContain('name="name"')
  })

  it('unknown slug still 404s', async () => {
    const res = await app.fetch(new Request('http://localhost/rsvp/does-not-exist'), env)
    expect(res.status).toBe(404)
  })
})
