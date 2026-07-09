# Quick Task 260708-uot: Full Project Review → recommendations.md

**Created:** 2026-07-09
**Mode:** quick (inline execution — review task requires full-context judgment)

## Objective

Perform a detailed, complete review of RSVPex — idea, architecture, implementation, and CI/CD — and write all findings and recommendations to `recommendations.md` at the repo root.

## Tasks

### Task 1: Full-repo reconnaissance
- **Files:** read-only pass over `app/src/**` (all 40 modules), `app/migrations/`, `app/wrangler.jsonc`, test configs, `.github/workflows/*`, `static-web/`, `.planning/*`, root workspace configs
- **Action:** trace every route, middleware, domain function, queue/cron handler; verify claimed behaviors against code (e.g. Hono `parseBody` bracket-key handling verified against `node_modules/hono/dist/utils/body.js`)
- **Done:** all source files read; findings list assembled with file:line evidence

### Task 2: Write recommendations.md
- **Files:** `recommendations.md` (new, repo root)
- **Action:** severity-ranked findings (ship blockers → correctness → security → performance → CI/CD → product/docs) with concrete remediation for each
- **Verify:** every finding cites a file/line; no speculative claims without a "verify" note
- **Done:** recommendations.md committed

### Task 3: GSD bookkeeping
- **Files:** `260708-uot-SUMMARY.md`, `.planning/STATE.md`
- **Action:** summary + STATE.md Quick Tasks Completed row; atomic commits
- **Done:** artifacts committed via gsd-tools
