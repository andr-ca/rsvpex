import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for RSVPex E2E tests.
 * @req TEST-01 TEST-02
 *
 * To run:
 *   1. Start local dev: npm run dev
 *   2. Run tests: npx playwright test
 *
 * Requires: @playwright/test, @axe-core/playwright
 * Install: npx playwright install chromium
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8787',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Applies local D1 migrations, then starts wrangler dev with the two vars
  // the E2E test needs overridden from wrangler.jsonc's committed
  // ENVIRONMENT=production (see middleware/turnstile.ts, middleware/rateLimit.ts —
  // S-1 in recommendations.md gates the test bypass on BOTH
  // TURNSTILE_SECRET_KEY=test-secret AND a non-production ENVIRONMENT).
  // Passed via --var (highest precedence) so this works in CI without a
  // checked-in .dev.vars file; a local .dev.vars still works for `npm run dev`.
  webServer: {
    command:
      'npm run migrate:local && wrangler dev --var TURNSTILE_SECRET_KEY:test-secret --var ENVIRONMENT:test',
    url: 'http://localhost:8787/rsvp/healthz',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
})
