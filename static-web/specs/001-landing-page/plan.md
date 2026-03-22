# Implementation Plan: RSVPex Landing Page

**Branch**: `001-landing-page` | **Date**: 2025-10-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-landing-page/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Create a coming-soon landing page for RSVPex, an RSVP management solution. The page announces the upcoming product and captures email addresses for beta testing waitlist. Primary goals: communicate value proposition within 2 seconds, collect emails with >10% conversion rate, achieve Lighthouse ≥90 across all metrics. The page must be fully responsive (320px-2560px), accessible (WCAG 2.1 AA), and work without JavaScript for core functionality.

## Technical Context

**Language/Version**: HTML5, CSS3, ES6+ JavaScript (no transpilation required)
**Primary Dependencies**: None (vanilla HTML/CSS/JS per constitution Principle V: Vanilla-First)
**Storage**: N/A (static page; email form submissions handled by third-party service)
**Testing**: W3C HTML/CSS validators, Lighthouse audits, manual cross-browser testing (Chrome, Firefox, Safari, Edge)
**Target Platform**: Static web hosting (Netlify, Vercel, GitHub Pages, or similar with CDN support)
**Project Type**: Single static website (no backend, no build process)
**Performance Goals**: <2s load time on 4G, Lighthouse Performance score ≥90, <5s on 3G
**Constraints**: Must work without JavaScript (progressive enhancement), no frameworks or build tools allowed, <3 external scripts total
**Scale/Scope**: Single-page site (~1500-2500 words content), expected traffic: hundreds to low thousands of visitors during pre-launch campaign

**Additional Technical Decisions Needed**:
- **Form Service**: NEEDS CLARIFICATION - Which email collection service to use (Formspree, Netlify Forms, Basin, or custom endpoint)?
- **Image Assets**: NEEDS CLARIFICATION - Will use illustrations, photos, or minimal graphics? Affects optimization strategy.
- **Font Loading**: NEEDS CLARIFICATION - System fonts only, or web fonts? If web fonts, which service (Google Fonts, self-hosted)?
- **Analytics**: NEEDS CLARIFICATION - Which analytics service if any (Google Analytics, Plausible, Fathom, none)?

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I: Performance-First ✅ PASS

- **Requirement**: Lighthouse scores ≥90, <2s load on 4G, optimized assets, inlined critical CSS, async JS
- **Compliance**: Spec requires SC-001 (<2s load), SC-002 (Lighthouse ≥90), FR-011 (2s load time). No frameworks or build overhead. Will inline critical CSS and defer non-critical resources.
- **Status**: COMPLIANT - No violations

### Principle II: Mobile-First Design ✅ PASS

- **Requirement**: Responsive CSS (Flexbox/Grid), ≥44×44px touch targets, no horizontal scroll, mobile-first approach
- **Compliance**: Spec requires FR-009 (320px-2560px responsive), user story acceptance criteria include mobile testing (375px screen). Will use mobile-first CSS with min-width media queries.
- **Status**: COMPLIANT - No violations

### Principle III: SEO Optimized ✅ PASS

- **Requirement**: Semantic HTML5, meta tags (title, description, OG, Twitter), structured data, sitemap, robots.txt, heading hierarchy, alt text
- **Compliance**: Spec requires FR-012 (semantic HTML), FR-013 (meta tags including OG/Twitter Cards), SC-014 (social previews work). Will add JSON-LD structured data, sitemap.xml, robots.txt.
- **Status**: COMPLIANT - No violations

### Principle IV: Clean & Sleek Design ✅ PASS

- **Requirement**: Visual hierarchy, deliberate whitespace, ≥16px typography, WCAG AA contrast (4.5:1), purposeful animations, brand consistency
- **Compliance**: Spec requires FR-010 (WCAG AA contrast), SC-007 (accessibility compliance), design must guide to CTA per user stories. Will respect prefers-reduced-motion.
- **Status**: COMPLIANT - No violations

### Principle V: Vanilla-First ✅ PASS

- **Requirement**: No frameworks, no preprocessors, no build tools, <3 external scripts, ES6+ allowed
- **Compliance**: Constitution explicitly mandates vanilla approach. Spec requires FR-016 (works without JS). Will use HTML5, CSS3 custom properties, ES6+ for progressive enhancement only. Expected external scripts: form service (1), optional analytics (1) = 2 total.
- **Status**: COMPLIANT - No violations

### Technical Standards Compliance

**HTML Requirements**: ✅ Will use HTML5 doctype, semantic elements, W3C validation (SC-008)
**CSS Requirements**: ✅ Will use Grid/Flexbox, mobile-first media queries, focus styles for keyboard nav
**JavaScript Requirements**: ✅ ES6+ with progressive enhancement, strict mode, graceful errors
**Accessibility Requirements**: ✅ WCAG 2.1 AA (FR-010, SC-007), keyboard navigation (FR-015), screen reader testing
**Asset Optimization**: ✅ Will compress images (<200KB), use WebP with fallbacks, lazy load below-fold, inline critical CSS

**GATE STATUS: ✅ PASSED - All constitution principles satisfied. Proceed to Phase 0 research.**

## Project Structure

### Documentation (this feature)

```text
specs/001-landing-page/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (N/A for static page, will document content structure)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (HTML form contract, meta tags spec)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
/
├── index.html           # Main landing page
├── css/
│   ├── main.css        # Primary stylesheet (mobile-first)
│   └── critical.css    # Critical above-the-fold CSS (for inlining)
├── js/
│   └── main.js         # Progressive enhancement (form validation, smooth scroll)
├── images/
│   ├── hero/           # Hero section images (WebP + fallback)
│   ├── icons/          # Benefit/feature icons (SVG preferred)
│   └── favicon/        # Favicon and app icons
├── .env.sample         # Environment variables template (form service keys)
├── robots.txt          # Search engine directives
├── sitemap.xml         # SEO sitemap
└── README.md           # Setup and deployment instructions
```

**Structure Decision**: Selected single static website structure (no src/ directory needed for simple HTML site). All files at repository root for easy static hosting deployment. CSS and JS organized in subdirectories for clarity. Images grouped by use case.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations detected. Table intentionally empty per constitution compliance.

---

## Phase 0 & Phase 1 Completion Summary

**✅ PLANNING COMPLETE**

### Deliverables Generated

| Document | Purpose | Status |
|----------|---------|--------|
| `research.md` | Phase 0 research, resolved all clarifications | ✅ Complete |
| `data-model.md` | Content structure, form schema | ✅ Complete |
| `contracts/form-contract.md` | Email form specification | ✅ Complete |
| `contracts/meta-tags-contract.md` | Meta tags & SEO specification | ✅ Complete |
| `quickstart.md` | Development & deployment guide | ✅ Complete |

### Technology Stack (Final)

| Component | Technology | Status |
|-----------|-----------|--------|
| Language | HTML5, CSS3, ES6+ JavaScript | ✅ No transpilation needed |
| Framework | None (Vanilla-First) | ✅ Constitution compliant |
| Form Service | Web3Forms | ✅ Free tier, no JS required |
| Email Delivery | Mailchimp | ✅ Free tier, 500 contacts |
| Analytics | Cloudflare Web Analytics | ✅ Free, cookie-free, 4.31 KB |
| Hosting | Cloudflare Pages | ✅ Free tier, auto-deploy from Git |
| Icons | Heroicons | ✅ MIT licensed, SVG |
| Illustrations | unDraw | ✅ MIT licensed, customizable |
| Fonts | System font stack | ✅ Zero latency |
| Total External Scripts | 2 (Cloudflare + Web3Forms) | ✅ Constitution limit: <3 |

### Constitution Re-Check (Post-Phase 1)

**All 5 core principles: ✅ PASS**

1. ✅ **Performance-First**: Lighthouse ≥90 target maintained through Phase 1 design
2. ✅ **Mobile-First Design**: Responsive breakpoints defined (320px, 600px, 900px)
3. ✅ **SEO Optimized**: Meta tags, structured data, sitemap defined
4. ✅ **Clean & Sleek Design**: SVG illustrations + icons, system fonts, WCAG AA contrast
5. ✅ **Vanilla-First**: No frameworks, no build tools, pure HTML/CSS/JS

**No violations introduced during Phase 1 design.**

---

## Deployment Strategy: Gitea Actions CI/CD

### Overview

Implement continuous deployment using Gitea Actions to automatically deploy to Cloudflare Pages on pull requests and merges.

**Benefits**:
- Automatic staging deployments on PR creation
- Preview URLs for testing before merge
- Production deployment on merge to main/001-landing-page
- No manual deployment steps required
- Integrated with existing Gitea workflow

### Workflow Configuration

**File**: `.gitea/workflows/deploy.yml`

**Triggers**:
- On PR creation/update → Deploy to staging preview URL
- On merge to `001-landing-page` or `main` → Deploy to production (`rsvpex.com`)

**Steps**:
1. Checkout repository code
2. Install Wrangler CLI globally
3. Deploy to Cloudflare Pages with unique preview domain
4. Add deployment comment to PR with preview URL

### Prerequisites for Gitea Actions

1. **Cloudflare API Token**
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Create token with scope: **Cloudflare Pages**
   - Add to Gitea repository secrets as `CLOUDFLARE_API_TOKEN`

2. **Web3Forms Access Key** (optional)
   - Add to Gitea secrets as `WEB3FORMS_ACCESS_KEY` if using secrets in workflow
   - Or hardcode in `index.html` (safe for Web3Forms)

3. **Gitea Repository Settings**
   - Enable Actions in repository settings
   - Configure repository secrets

### Deployment Matrix

| Trigger | Environment | URL | When |
|---------|-------------|-----|------|
| PR opened/updated | staging | `https://[pr-id].rsvpex-landing.[account].pages.dev` | Pull request received |
| Merge to main | production | `https://rsvpex.com` | Code merged to main branch |
| Merge to 001-landing-page | production | `https://rsvpex.com` | Code merged to feature branch (interim) |

### CI/CD Workflow Benefits

**For Development**:
- Test changes in live environment before merge
- Preview URL available immediately in PR
- No manual deployment steps
- Automatic rollback on failed deployment

**For Team Collaboration**:
- Review team can test on live preview URL
- No need to checkout and test locally
- Clear deployment status in PR

**For Production**:
- Safe merging: PR deployments don't affect production
- Automated production release: merge triggers live deployment
- Audit trail: All deployments tracked in Gitea Actions logs

### Workflow File Location

```
.gitea/
└── workflows/
    └── deploy.yml          # CI/CD configuration
```

**Structure follows Gitea Actions standards** (similar to GitHub Actions but for Gitea).

### Configuration Details

The workflow will:
1. Run on every PR and merge event
2. Install Wrangler CLI (global npm install)
3. Authenticate with Cloudflare using API token
4. Deploy to Pages with project name: `rsvpex-landing`
5. Post deployment URL to PR for preview

---

## Ready for Implementation

✅ **GATE PASSED**: All constitutional requirements verified post-planning.

✅ **CI/CD STRATEGY DEFINED**: Gitea Actions configured for automatic deployment to Cloudflare Pages.

Next phase: `/speckit.tasks` to generate actionable task list for development team.
