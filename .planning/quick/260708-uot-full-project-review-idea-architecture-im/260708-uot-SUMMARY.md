# Quick Task 260708-uot — Summary

**Task:** Full project review (idea, architecture, implementation, CI/CD) → `recommendations.md`
**Completed:** 2026-07-09
**Executed:** inline (full-context review; no subagents)

## What was done

- Read every module in `app/src/` (~6,700 lines across 40 files), both migrations, wrangler.jsonc, worker types, vitest/playwright/eslint configs, all `.github/workflows/*`, the static marketing site (HTML/JS/wrangler.toml), and all `.planning/` documents.
- Verified non-obvious claims against ground truth: Hono `parseBody` bracket-key behavior checked in `node_modules/hono/dist/utils/body.js`; partial unique indexes confirmed in `migrations/0001_init.sql`; absence of `_csrf` in any rendered form confirmed by grep; orphaned features (`revokeToken`, `AUDIT_QUEUE`, `redactPii`/`buildDiff`) confirmed unused.
- Wrote `recommendations.md` (repo root): 7 ship blockers, 17 correctness issues, 16 security findings, 4 testing gaps, 8 CI/CD gaps, 5 planning-hygiene items, plus a 4-milestone prioritized action plan. Every finding carries file:line evidence.

## Headline findings

1. Cross-phase integration rot: Phase 10 CSRF blocks all admin forms; Phase 10 CSP blocks Phase 5 charts.
2. Public form ships a literal `TURNSTILE_SITE_KEY_PLACEHOLDER`; dietary fields silently dropped (`dietary_kind[]` vs `dietary_kind`); custom questions validated but never rendered.
3. No Worker deploy pipeline; `wrangler.jsonc` has PLACEHOLDER binding IDs and a secret shadowed by an empty var.
4. Guest PATCH bypasses all capacity/validation; event-edit form silently resets settings; timezone handling wrong end-to-end.
5. Coverage constraint unenforced; zero E2E tests; highest-ROI fix = one Playwright happy path.

## Artifacts

- `recommendations.md` (deliverable)
- `260708-uot-PLAN.md`, this summary
- STATE.md updated with Quick Tasks Completed row
