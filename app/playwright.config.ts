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
  // Start wrangler dev server before tests
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:8787',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 30000,
  // },
})
