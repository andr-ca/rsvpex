import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const requireReqTag = require('./eslint-rules/require-req-tag.cjs')

export default tseslint.config(
  // Base recommended rules
  eslint.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Prettier compat — disables conflicting rules
  eslintConfigPrettier,

  // Global ignores
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'migrations/**',
      'node_modules/**',
      '*.d.ts',
      'drizzle.config.ts',
      'eslint-rules/**',
      'playwright.config.ts',
    ],
  },

  // TypeScript source files
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Custom @req tag rule for domain/routes/handlers/middleware
  {
    files: [
      'src/domain/**/*.ts',
      'src/routes/**/*.ts',
      'src/handlers/**/*.ts',
      'src/middleware/**/*.ts',
    ],
    plugins: {
      rsvpex: {
        rules: {
          'require-req-tag': requireReqTag,
        },
      },
    },
    rules: {
      'rsvpex/require-req-tag': 'error',
    },
  },

  // Test files — relax some rules
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
