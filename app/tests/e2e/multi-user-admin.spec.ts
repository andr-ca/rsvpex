/**
 * E2E multi-user admin flow — validates the invite-based provisioning,
 * Owner/Editor role split, and admin-management UI (deactivate/reactivate/
 * promote/demote) added in quick task 260710-rkt, driven through a real
 * `wrangler dev` server (see playwright.config.ts webServer) rather than
 * unit/integration tests against `app.fetch()` directly — this is the only
 * layer that exercises the actual CSRF double-submit cookie flow, the
 * `confirm()` dialogs on the management buttons, and axe-core accessibility
 * scans on the new pages.
 *
 * Reuses the same bootstrap admin credentials as happy-path.spec.ts: the
 * one-time /rsvp/admin/setup route can only ever create a single admin
 * (409s after), so whichever spec runs first wins the bootstrap and this
 * test just logs in with the same fixed credentials either way — the
 * bootstrapped admin always gets role='owner' regardless of which spec
 * triggered it (adminSetup.ts).
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const ADMIN_EMAIL = 'e2e-admin@rsvpex.test'
const ADMIN_PASSWORD = 'E2eTestPassword123!'
const ADMIN_DISPLAY_NAME = 'E2E Admin'

/** Scoped to WCAG 2 A/AA — same scope as happy-path.spec.ts's scanA11y. */
function scanA11y(page: Page) {
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
}

async function loginAsOwner(page: Page) {
  // No-ops with a 409 if another spec already bootstrapped the one admin.
  await page.goto('/rsvp/admin/setup')
  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#display_name').fill(ADMIN_DISPLAY_NAME)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Create Admin Account' }).click()

  await page.goto('/rsvp/admin/login')
  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test('multi-user admin: invite, accept, role management', async ({ page, browser }) => {
  const runId = Date.now().toString(36)
  const editorEmail = `editor-${runId}@example.test`
  const editorPassword = 'InvitedEditorPassword123!'

  // ── Owner logs in ───────────────────────────────────────────────────────
  await loginAsOwner(page)

  // ── Admin list page: owner sees themselves, no self-action buttons ────────
  await page.goto('/rsvp/admin/admins')
  await expect(page.locator('table')).toContainText(ADMIN_EMAIL)
  const ownerRow = page.locator('tr', { hasText: ADMIN_EMAIL })
  await expect(ownerRow).toContainText('(self)')

  const adminListAxe = await scanA11y(page)
  expect(adminListAxe.violations, JSON.stringify(adminListAxe.violations, null, 2)).toEqual([])

  // ── Owner sends an invite for a new Editor ─────────────────────────────────
  await page.getByRole('link', { name: '+ Invite New Admin' }).click()
  await expect(page).toHaveURL(/\/admins\/invite$/)

  const inviteFormAxe = await scanA11y(page)
  expect(inviteFormAxe.violations, JSON.stringify(inviteFormAxe.violations, null, 2)).toEqual([])

  await page.locator('#email').fill(editorEmail)
  await page.locator('#role').selectOption('editor')
  await page.getByRole('button', { name: 'Send Invite' }).click()

  await expect(page.locator('h1')).toHaveText('Invite Sent')
  const inviteUrl = (await page.locator('code').textContent())?.trim()
  expect(inviteUrl).toContain('/rsvp/admin/invite/accept?token=')

  // ── Invited editor accepts, in a fresh session (no owner cookies) ─────────
  const editorContext = await browser.newContext()
  const editorPage = await editorContext.newPage()

  await editorPage.goto(inviteUrl!)
  await expect(editorPage.locator('h1')).toHaveText('Set Up Your Admin Account')

  const acceptFormAxe = await scanA11y(editorPage)
  expect(acceptFormAxe.violations, JSON.stringify(acceptFormAxe.violations, null, 2)).toEqual([])

  await editorPage.locator('#password').fill(editorPassword)
  await editorPage.getByRole('button', { name: 'Create Account' }).click()
  await expect(editorPage).toHaveURL(/\/login\?invite=success/)

  // ── Editor logs in, has dashboard access but not admin-management access ──
  await editorPage.locator('#email').fill(editorEmail)
  await editorPage.locator('#password').fill(editorPassword)
  await editorPage.getByRole('button', { name: 'Log In' }).click()
  await expect(editorPage).not.toHaveURL(/\/login/)

  await expect(editorPage.goto('/rsvp/admin/events')).resolves.toBeTruthy()

  const forbidden = await editorPage.goto('/rsvp/admin/admins')
  expect(forbidden?.status()).toBe(403)

  await editorContext.close()

  // ── Owner promotes the editor to Owner ─────────────────────────────────────
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('/rsvp/admin/admins')
  const editorRow = page.locator('tr', { hasText: editorEmail })
  await expect(editorRow).toContainText('editor')
  await editorRow.getByRole('button', { name: 'Promote' }).click()

  await expect(page).toHaveURL(/\/admins$/)
  await expect(page.locator('tr', { hasText: editorEmail })).toContainText('owner')

  // ── Owner demotes them back to Editor ──────────────────────────────────────
  await page.locator('tr', { hasText: editorEmail }).getByRole('button', { name: 'Demote' }).click()
  await expect(page.locator('tr', { hasText: editorEmail })).toContainText('editor')

  // ── Owner deactivates the editor; their session is immediately killed ─────
  const editorSessionContext = await browser.newContext()
  const editorSessionPage = await editorSessionContext.newPage()
  await editorSessionPage.goto('/rsvp/admin/login')
  await editorSessionPage.locator('#email').fill(editorEmail)
  await editorSessionPage.locator('#password').fill(editorPassword)
  await editorSessionPage.getByRole('button', { name: 'Log In' }).click()
  await expect(editorSessionPage).not.toHaveURL(/\/login/)

  await page
    .locator('tr', { hasText: editorEmail })
    .getByRole('button', { name: 'Deactivate' })
    .click()
  await expect(page.locator('tr', { hasText: editorEmail })).toContainText('○ Inactive')

  const killedSession = await editorSessionPage.goto('/rsvp/admin/events')
  expect(killedSession?.url()).toMatch(/\/login/)
  await editorSessionContext.close()

  // ── Owner reactivates the editor ────────────────────────────────────────
  await page
    .locator('tr', { hasText: editorEmail })
    .getByRole('button', { name: 'Reactivate' })
    .click()
  await expect(page.locator('tr', { hasText: editorEmail })).toContainText('✓ Active')
})
