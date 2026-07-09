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
            // wrangler.jsonc's `vars.ENVIRONMENT` is "production" (S-1 in
            // recommendations.md gates the test-secret bypasses above on
            // ENVIRONMENT !== 'production') — override it here so tests still
            // get the bypass instead of hitting real Turnstile/rate limits.
            ENVIRONMENT: 'test',
          },
        },
      }),
    ],
    test: {
      exclude: ['eslint-rules/**', 'node_modules/**'],
      setupFiles: ['./tests/apply-migrations.ts'],
      coverage: {
        // NOTE: Coverage instrumentation is not currently supported inside
        // @cloudflare/vitest-pool-workers (Workers runtime lacks node:inspector).
        // V8 and Istanbul providers both fail. These thresholds document the
        // project's coverage requirements for when the ecosystem adds support.
        // Track: https://github.com/cloudflare/workers-sdk/issues
        provider: 'v8',
        include: ['src/**/*.ts'],
        thresholds: {
          global: {
            statements: 80,
            branches: 80,
            functions: 80,
            lines: 80,
          },
          // 100% coverage on critical modules (TEST-02)
          'src/domain/capacity.ts': {
            statements: 100,
            branches: 100,
            functions: 100,
            lines: 100,
          },
          'src/domain/tokens.ts': {
            statements: 100,
            branches: 100,
            functions: 100,
            lines: 100,
          },
          'src/domain/duplicates.ts': {
            statements: 100,
            branches: 100,
            functions: 100,
            lines: 100,
          },
        },
      },
    },
  }
})
