# StarkyStar Coding Standards (Final v3)
**Last updated:** 2025-08-23

These standards govern how we write, structure, and review code across mobile (React Native) and backend (Appwrite Functions).

---

## 1. Language & Style
- **TypeScript** everywhere (strict mode).
- **No `any`** allowed. Use `unknown` or generics with constraints if necessary.
- **Prettier** for formatting; **ESLint** for rules. Code must pass both.
- **Conventional Commits** enforced for all commits.

## 2. Naming Conventions
- **Files & folders**: `kebab-case` (e.g. `task-create-edit.tsx`).
- **React components**: `PascalCase` (e.g. `TaskCard`).
- **Hooks**: `useX` prefix.
- **Types/Interfaces**: `PascalCase` with suffix (`Props`, `Dto`).
- **Constants/Enums**: `SCREAMING_SNAKE_CASE`.

## 3. Documentation & Examples
- Every exported function requires JSDoc.
- Include **refs to requirement IDs** in comments (e.g. `// Refs MVP-PARENT-01`).

## 4. Testing Standards
- **Unit tests**: ≥80% coverage overall, **100% for critical logic**.
- **Integration/E2E tests**: ≥50% for core flows using Detox/RTL.
- **Accessibility audits** in CI (axe + WCAG AA).
- **Manual beta**: all merged features tested via TestFlight with families.

## 5. Dependencies
- **Pin major versions** (e.g., React Native ≥0.74).
- **Run `npm audit` in CI**, fix high vulnerabilities before merge.
- **Quarterly review** of dependencies.

## 6. Security Gates
- **No secrets** in repo; use Appwrite secrets.
- **Snyk scans** in CI for vulns.
- **Annual COPPA/privacy audit** by CTO.

## 7. Definition of Done (DoD)
- Code + tests merged via PR.
- All CI checks pass (lint, type, tests, coverage, security).
- Docs updated (README for screen/component, changelog entry).
- Risks/rollback plan in PR template completed.
- Privacy impact reviewed for child-facing features.

---

## 8. Evolution
- If **team >5**, introduce **dedicated QA** and **accessibility champion** roles.
- Quarterly review of coding standards by CTO.
