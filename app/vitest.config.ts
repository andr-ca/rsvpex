import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// @ts-expect-error — Vite 8 overload ordering doesn't match async factory; runtime works correctly
export default defineConfig(async () => {
  const migrationsPath = path.join(__dirname, 'migrations')
  const migrations = await readD1Migrations(migrationsPath)

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // Test-only binding for migrations setup
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Bypass Turnstile verification in tests
            TURNSTILE_SECRET_KEY: 'test-secret',
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./tests/apply-migrations.ts'],
      coverage: {
        provider: 'v8',
        thresholds: {
          global: {
            statements: 80,
            branches: 80,
            functions: 80,
            lines: 80,
          },
        },
      },
    },
  }
})
