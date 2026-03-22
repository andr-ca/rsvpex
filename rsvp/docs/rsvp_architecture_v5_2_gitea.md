
# RSVP Micro‑Site — Architecture Document (v5.2, **Gitea‑first CI/CD + coverage & traceability**)

_Last updated: 2025‑10‑01_

## What changed (v5.2 vs v5.1)
- **Testing:** CI now enforces **≥80% unit coverage** overall and **100% coverage for “critical” code** paths via a second, filtered coverage run.
- **CI YAML:** Added **Vitest coverage** steps and artifact upload for `lcov.info`.
- **Docs/Traceability:** Code must include **JSDoc refs to Requirement IDs** and **ADR IDs**; ESLint/JSdoc rules added to Standards. CI will fail if missing.
- All other content from v5.1 remains (Gitea‑first workflows, Proxmox runner, Tunnel, etc.).

---

## 1) Testing & Quality (updates)

### 1.1 Coverage policy
- **Overall**: ≥ **80%** lines/branches/functions on unit tests.
- **Critical modules** (e.g., capacity enforcement, token generation/validation, duplicate checks): **100%** coverage.
- Enforced in CI with **two** Vitest runs:
  1) **Global** coverage over the full codebase (thresholds at 80%).
  2) **Critical-only** coverage against `src/critical/**` (thresholds at 100%).

> Configure critical modules in `vitest.config.ts` via `process.env.CRITICAL_ONLY` flag (see example below).

### 1.2 Example vitest config (excerpt)
```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

const criticalOnly = process.env.CRITICAL_ONLY === '1';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: 'c8',
      reportsDirectory: criticalOnly ? 'coverage-critical' : 'coverage',
      reporter: ['text', 'lcov'],
      all: true,
      include: criticalOnly ? ['src/critical/**/*.{ts,tsx}'] : ['src/**/*.{ts,tsx}'],
      lines: criticalOnly ? 1.0 : 0.8,
      functions: criticalOnly ? 1.0 : 0.8,
      branches: criticalOnly ? 1.0 : 0.8,
      statements: criticalOnly ? 1.0 : 0.8,
    },
  },
});
```

---

## 2) Documentation & Traceability (updates)

### 2.1 JSDoc references
- Every exported function/class in domain and API layers must include **JSDoc** with:
  - `@req` — Requirement ID(s) (e.g., `@req R-10` for “Capacity lock tranx” from the requirements doc §10).
  - `@adr` — Architecture Decision Record ID (e.g., `@adr ADR-003` for “Tunnel+Access+Turnstile” or `ADR-006` for “Gitea‑first CI/CD”).

**Example**
```ts
/**
 * Computes remaining capacity and decides waitlist vs attending.
 * @req R-10  R-22
 * @adr ADR-001 ADR-008
 */
export function decidePlacement(...) { ... }
```

### 2.2 Linting rules
- Add `eslint-plugin-jsdoc` and enable:
  - `require-jsdoc` for exported symbols in `src/(domain|api)/**`
  - `jsdoc/check-tag-names` with **custom tags** allowed: `req`, `adr`
  - Optional: `jsdoc/require-description` for exported functions
- CI gate: ESLint must pass; missing `@req`/`@adr` fails the build.

---

## 3) CI/CD — Gitea (delta)

### 3.1 CI pipeline (updated)
Jobs (unchanged order), with **coverage steps** in `unit_tests`:
1) `lint_typecheck`
2) `unit_tests` — runs **two Vitest invocations**:
   - **Global**: `pnpm test -- --coverage`
   - **Critical**: `CRITICAL_ONLY=1 pnpm test -- --coverage`
   - Uploads `coverage/lcov.info` and `coverage-critical/lcov.info` artifacts.
3) `e2e_playwright` (Postgres/Redis services, migrations, a11y assertions)
4) `k6_load` (manual)
5) `deploy_selfhost` on tags

> See updated `.gitea/workflows/ci.yml` in the pack.

### 3.2 ADR references in code reviews
- Review checklist includes verifying `@req` & `@adr` presence for new/changed exported APIs.
- Link PRs to relevant ADR(s) in the description.

---

## 4) References
- Architecture: v5.1 (Gitea‑first) + this v5.2 updates
- Workflows: `.gitea/workflows/ci.yml` (coverage), `.gitea/workflows/deploy-selfhost.yml`
- Schema: `rsvp_schema_v5_3.sql` (latest)
- ADRs: ADR‑001..ADR‑009

