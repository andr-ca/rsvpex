import { defineConfig } from 'vitest/config';

const criticalOnly = process.env.CRITICAL_ONLY === '1';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: 'c8',
      reporter: ['text', 'lcov'],
      all: true,
      reportsDirectory: criticalOnly ? 'coverage-critical' : 'coverage',
      include: criticalOnly ? ['src/critical/**/*.{ts,tsx}'] : ['src/**/*.{ts,tsx}'],
      lines: criticalOnly ? 1.0 : 0.8,
      functions: criticalOnly ? 1.0 : 0.8,
      branches: criticalOnly ? 1.0 : 0.8,
      statements: criticalOnly ? 1.0 : 0.8,
    },
  },
});
