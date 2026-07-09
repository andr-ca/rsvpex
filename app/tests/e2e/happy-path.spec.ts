/**
 * E2E happy path — T-1 in recommendations.md.
 *
 * Drives real rendered HTML through a `wrangler dev` server (see
 * playwright.config.ts webServer): admin bootstrap → login → create event →
 * publish → guest submits RSVP → guest edits RSVP → admin edits RSVP →
 * admin exports CSV/JSON. Also runs axe-core accessibility scans (T-4) on
 * the public form, thank-you, and admin dashboard pages along the way.
 *
 * Admin credentials are fixed (not randomized) so repeat local runs against
 * persisted `.wrangler/state` D1 storage stay idempotent — setup no-ops with
 * a 409 after the first run, and the test falls through to login either way.
 * The event title/slug are randomized per run since creating a new event
 * each time is harmless and avoids slug collisions.
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const ADMIN_EMAIL = 'e2e-admin@rsvpex.test'
const ADMIN_PASSWORD = 'E2eTestPassword123!'

/**
 * Scoped to WCAG 2 A/AA (the standard axe-core/Playwright default set), not
 * axe's "best-practice" rules (landmark-one-main, region, heading-order,
 * etc.) — those flagged real pre-existing gaps in the admin UI (no <main>
 * landmark, h1→h3 heading skip) that are a legitimate follow-up but are a
 * broader admin-template change than this happy-path test should gate on.
 */
function scanA11y(page: Page) {
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
}
const ADMIN_DISPLAY_NAME = 'E2E Admin'

test('full guest + admin happy path', async ({ page }) => {
  const runId = Date.now().toString(36)
  const eventTitle = `E2E Test Event ${runId}`

  // ── Admin bootstrap (no-ops with 409 if already set up from a prior run) ──
  await page.goto('/rsvp/admin/setup')
  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#display_name').fill(ADMIN_DISPLAY_NAME)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Create Admin Account' }).click()

  // ── Admin login ─────────────────────────────────────────────────────────
  await page.goto('/rsvp/admin/login')
  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).not.toHaveURL(/\/login/)

  // ── Create event ────────────────────────────────────────────────────────
  await page.goto('/rsvp/admin/events/new')
  await page.locator('#title').fill(eventTitle)
  await page.locator('#start_at').fill('2099-06-15T18:00')
  await page.locator('#max_party_size_per_rsvp').fill('10')
  await page.getByRole('button', { name: 'Create Event' }).click()

  await expect(page).toHaveURL(/\/rsvp\/admin\/events\/[^/]+$/)
  const eventUrl = page.url()
  const slug = (await page.locator('dt:has-text("Slug") + dd code').textContent())?.trim()
  expect(slug).toBeTruthy()

  const dashboardAxe = await scanA11y(page)
  expect(dashboardAxe.violations, JSON.stringify(dashboardAxe.violations, null, 2)).toEqual([])

  // ── Publish event ───────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Publish Event' }).click()
  await expect(page.locator('.badge-published')).toBeVisible()

  // ── Guest: load public form, run accessibility scan, submit RSVP ──────────
  await page.goto(`/rsvp/${slug}`)
  await expect(page.locator('h1')).toHaveText(eventTitle)

  const formAxe = await scanA11y(page)
  expect(formAxe.violations, JSON.stringify(formAxe.violations, null, 2)).toEqual([])

  await page.locator('#name').fill('Ada Lovelace')
  await page.locator('#email').fill(`ada-${runId}@example.test`)
  await page.locator('#adults').fill('2')
  const dietaryRow = page.locator('.dietary-row').first()
  await dietaryRow.locator('select[name="dietary_kind[]"]').selectOption('vegetarian')
  await dietaryRow.locator('input[name="dietary_value[]"]').fill('No red meat')
  await page.locator('#notes').fill('Looking forward to it!')
  await page.locator('#rsvp-form button[type=submit]').click()

  // ── Thank-you page ──────────────────────────────────────────────────────
  await expect(page).toHaveURL(/\/rsvp\/thank-you\?rid=/)
  await expect(page.locator('.confirmation-badge')).toBeVisible()
  await expect(page.locator('.summary')).toContainText('Ada Lovelace')
  await expect(page.locator('.summary')).toContainText('vegetarian')

  const thankYouAxe = await scanA11y(page)
  expect(thankYouAxe.violations, JSON.stringify(thankYouAxe.violations, null, 2)).toEqual([])

  // ── Guest edits their RSVP via the thank-you page's edit link ─────────────
  await page.getByRole('link', { name: /Edit/i }).click()
  await expect(page.locator('.edit-banner')).toBeVisible()
  await page.locator('#notes').fill('Updated: bringing a plus-one snack to share.')
  await page.getByRole('button', { name: /Save Changes/i }).click()
  await expect(page).toHaveURL(/\/rsvp\/thank-you\?rid=/)
  await expect(page.locator('.summary')).toContainText('Ada Lovelace')

  // ── Admin: view and edit the RSVP from the dashboard ───────────────────────
  await page.goto('/rsvp/admin/events')
  await page.getByRole('link', { name: eventTitle }).click()
  await page.getByRole('link', { name: /^RSVPs/ }).click()
  await expect(page.locator('table')).toContainText('Ada Lovelace')

  await page.getByRole('link', { name: 'Edit' }).click()
  await page.locator('textarea[name="notes"]').fill('Admin note: seated at table 4.')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.locator('.success')).toContainText('RSVP updated')

  // ── Admin: export CSV and JSON (links live on the event detail page) ───────
  await page.goto(eventUrl)
  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Export CSV' }).click(),
  ])
  expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/)

  const jsonResponse = await page.request.get(
    (await page.getByRole('link', { name: 'Export JSON' }).getAttribute('href')) ?? '',
  )
  expect(jsonResponse.ok()).toBeTruthy()
  const exported = await jsonResponse.json()
  expect(Array.isArray(exported) ? exported : exported.rsvps).toBeTruthy()
})
