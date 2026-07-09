// app/eslint-rules/require-req-tag.test.cjs
const { RuleTester } = require('eslint')
const rule = require('./require-req-tag.cjs')
const tsParser = require('@typescript-eslint/parser')

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parser: tsParser,
  },
})

ruleTester.run('require-req-tag', rule, {
  valid: [
    {
      code: '/** @req CAP-01 */\nexport function checkCapacity() {}',
      filename: 'src/domain/capacity.ts',
    },
    {
      code: '/** @req SEC-01 */\nexport function generateToken() {}',
      filename: 'src/domain/tokens.ts',
    },
    {
      code: '/** @req ADMIN-01 */\nexport const requireAdmin = () => {}',
      filename: 'src/middleware/requireAdmin.ts',
    },
    {
      code: '/** @req PUB-01 */\nconst router = {};\nexport default router',
      filename: 'src/routes/rsvpForm.ts',
    },
    {
      code: 'export function helper() {}',
      filename: 'src/utils/helpers.ts',
    },
    {
      code: 'export type Foo = string',
      filename: 'src/domain/types.ts',
    },
    {
      code: 'export const HEADERS = ["a", "b"]',
      filename: 'src/domain/dataManagement.ts',
    },
  ],
  invalid: [
    {
      code: 'export function checkCapacity() {}',
      filename: 'src/domain/capacity.ts',
      errors: [{ messageId: 'missingReqTag' }],
    },
    {
      code: 'export const requireAdmin = () => {}',
      filename: 'src/middleware/requireAdmin.ts',
      errors: [{ messageId: 'missingReqTag' }],
    },
    {
      code: '/** Does something */\nexport function doThing() {}',
      filename: 'src/handlers/queue.ts',
      errors: [{ messageId: 'missingReqTag' }],
    },
    {
      code: 'const router = {};\nexport default router',
      filename: 'src/routes/rsvpForm.ts',
      errors: [{ messageId: 'missingReqTag' }],
    },
  ],
})

console.log('All require-req-tag tests passed!')
