/**
 * @req I18N-01 — event locale en/fr/es on public form
 *
 * Integration tests verifying that public-facing pages render
 * in the correct language based on event locale and Accept-Language fallback.
 */
import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import app from '../../src/app'

describe('i18n integration', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM rsvps')
    await env.DB.exec('DELETE FROM events')
  })

  async function seedEvent(overrides: Record<string, unknown> = {}) {
    const defaults: Record<string, unknown> = {
      id: 'evt-i18n',
      slug: 'test-i18n',
      title: 'Fête Internationale',
      start_at: '2026-06-15T14:00:00Z',
      status: 'published',
      locale: 'en',
      visibility: 'public',
      is_kids_event: 0,
      allow_status_choice: 1,
      max_party_size_per_rsvp: 10,
      enable_waitlist: 0,
      enable_heuristic_dup_check: 0,
      notify_via_email: 0,
      notify_via_sms: 0,
      questions: '[]',
      timezone: 'America/Toronto',
    }
    const row = { ...defaults, ...overrides }
    const cols = Object.keys(row)
    const placeholders = cols.map(() => '?').join(', ')
    await env.DB.prepare(`INSERT INTO events (${cols.join(', ')}) VALUES (${placeholders})`)
      .bind(...Object.values(row))
      .run()
  }

  // ── Public RSVP form ────────────────────────────────────────────────────────

  it('renders French form when event locale is fr', async () => {
    await seedEvent({ locale: 'fr' })
    const res = await app.fetch(new Request('http://localhost/rsvp/test-i18n'), env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Nom complet')
    expect(html).toContain('Envoyer mon RSVP')
    expect(html).toContain('lang="fr"')
    // Should NOT contain English labels
    expect(html).not.toContain('Full Name')
    expect(html).not.toContain('Send my RSVP')
  })

  it('renders Spanish form when event locale is es', async () => {
    await seedEvent({ locale: 'es', slug: 'test-es', id: 'evt-es' })
    const res = await app.fetch(new Request('http://localhost/rsvp/test-es'), env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Nombre completo')
    expect(html).toContain('Enviar mi RSVP')
    expect(html).toContain('lang="es"')
  })

  it('falls back to Accept-Language when event locale is empty', async () => {
    await seedEvent({ locale: '' })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/test-i18n', {
        headers: { 'Accept-Language': 'fr-FR,fr;q=0.9' },
      }),
      env,
    )
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Nom complet')
    expect(html).toContain('lang="fr"')
  })

  it('falls back to English when event locale is empty and Accept-Language unsupported', async () => {
    await seedEvent({ locale: '' })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/test-i18n', {
        headers: { 'Accept-Language': 'de,ja;q=0.5' },
      }),
      env,
    )
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Full Name')
    expect(html).toContain('lang="en"')
  })

  // ── Thank-you page ──────────────────────────────────────────────────────────

  it('renders French thank-you page for French event', async () => {
    await seedEvent({ locale: 'fr' })
    await env.DB.prepare(
      `INSERT INTO rsvps (id, event_id, name, email, adults, parents_count, siblings_count, children_count, dietary, answers, status, rsvp_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind('rsvp-fr', 'evt-i18n', 'Marie', 'marie@test.com', 1, 0, 0, 0, '[]', '{}', 'attending', 'tok-fr').run()

    const res = await app.fetch(new Request('http://localhost/rsvp/thank-you?rid=tok-fr'), env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('RSVP confirmé')
    expect(html).toContain('Votre RSVP')
    expect(html).toContain('lang="fr"')
    expect(html).toContain('Télécharger le calendrier')
    expect(html).toContain('Modifier le RSVP')
  })

  // ── Capacity-full page ──────────────────────────────────────────────────────

  it('renders French capacity-full page', async () => {
    await seedEvent({ locale: 'fr', max_guests_total: 1 })
    // Fill capacity
    await env.DB.prepare(
      `INSERT INTO rsvps (id, event_id, name, email, adults, parents_count, siblings_count, children_count, dietary, answers, status, rsvp_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind('rsvp-fill', 'evt-i18n', 'Jean', 'jean@test.com', 1, 0, 0, 0, '[]', '{}', 'attending', 'tok-fill').run()

    const form = new URLSearchParams({
      name: 'Pierre',
      email: 'pierre@test.com',
      adults: '1',
    })
    const res = await app.fetch(
      new Request('http://localhost/rsvp/test-i18n', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      }),
      env,
    )
    expect(res.status).toBe(409)
    const html = await res.text()
    expect(html).toContain('lang="fr"')
    // French capacity-full message
    expect(html).toContain('capacité maximale')
  })

  // ── Closed page ─────────────────────────────────────────────────────────────

  it('renders French closed page', async () => {
    await seedEvent({ locale: 'fr', closes_at: '2020-01-01T00:00:00Z' })
    const res = await app.fetch(new Request('http://localhost/rsvp/test-i18n'), env)
    const html = await res.text()
    expect(html).toContain('Inscriptions terminées')
    expect(html).toContain('lang="fr"')
  })

  // ── Admin UI remains English-only ───────────────────────────────────────────

  it('renders English form when event locale is en (default)', async () => {
    await seedEvent({ locale: 'en', slug: 'test-en', id: 'evt-en' })
    const res = await app.fetch(new Request('http://localhost/rsvp/test-en'), env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Full Name')
    expect(html).toContain('Send my RSVP')
    expect(html).toContain('lang="en"')
  })
})
