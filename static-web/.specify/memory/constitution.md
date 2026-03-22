<!--
SYNC IMPACT REPORT
==================
Version Change: INITIAL → 1.0.0
Change Type: Initial Constitution
Modified Principles: N/A (new constitution)
Added Sections: All sections (initial creation)
Removed Sections: N/A
Templates Status:
  ✅ plan-template.md - Reviewed (Constitution Check section aligned)
  ✅ spec-template.md - Reviewed (Requirements aligned with principles)
  ✅ tasks-template.md - Reviewed (Task structure supports all principles)
Follow-up TODOs: None
-->

# RSVPex Landing Page Constitution

## Core Principles

### I. Performance-First

**MUST** achieve Lighthouse scores ≥90 across all categories (Performance, Accessibility, Best Practices, SEO). Fast loading is non-negotiable.

- Initial page load MUST complete in <2 seconds on 4G networks
- Images MUST be optimized (WebP/AVIF with fallbacks, lazy loading)
- CSS MUST be minified; critical CSS MUST be inlined
- JavaScript MUST be deferred or async where possible
- Zero render-blocking resources allowed without explicit justification

**Rationale**: Landing pages have 3 seconds to capture attention. Performance directly impacts conversion rates and SEO rankings.

### II. Mobile-First Design

**MUST** design for mobile screens first, then progressively enhance for larger viewports. Mobile experience is the priority.

- Layouts MUST use responsive CSS (Flexbox, Grid, media queries)
- Touch targets MUST be ≥44×44px minimum
- Viewport meta tag MUST be configured correctly
- Horizontal scrolling MUST NOT occur on any viewport
- Test on actual mobile devices before deployment

**Rationale**: >60% of landing page traffic comes from mobile devices. Mobile-first ensures core experience works everywhere.

### III. SEO Optimized

**MUST** implement comprehensive SEO best practices. Discoverability is critical for a landing page.

- Semantic HTML5 tags MUST be used (header, main, nav, section, article, footer)
- Meta tags MUST include: title, description, Open Graph, Twitter Cards
- Structured data (JSON-LD) MUST be included for rich snippets
- Sitemap.xml and robots.txt MUST be present
- Heading hierarchy MUST be logical (single h1, proper nesting)
- Alt text MUST be descriptive for all images
- Canonical URLs MUST be specified

**Rationale**: SEO is the primary acquisition channel for organic traffic. Proper markup ensures visibility in search results and social shares.

### IV. Clean & Sleek Design

**MUST** maintain modern aesthetics with minimal visual clutter. Design serves the message.

- Visual hierarchy MUST guide users to primary CTA (Call-to-Action)
- White space MUST be used deliberately to improve readability
- Typography MUST be legible (≥16px base, appropriate line-height)
- Color contrast MUST meet WCAG AA standards (4.5:1 for body text)
- Animations MUST be purposeful, not decorative (respect prefers-reduced-motion)
- Brand consistency MUST be maintained (colors, fonts, tone)

**Rationale**: First impressions matter. Clean design builds trust and communicates professionalism, directly impacting conversion rates.

### V. Vanilla-First

**MUST** use pure HTML/CSS/JavaScript without frameworks or build tools. Simplicity over complexity.

- NO frameworks (React, Vue, Angular, etc.) allowed
- NO CSS preprocessors (Sass, Less) required—use CSS custom properties
- NO build tools (Webpack, Vite, Parcel) required—direct file editing
- Modern ES6+ JavaScript is allowed (supported by all evergreen browsers)
- External libraries require explicit justification and MUST be loaded from CDN
- Dependencies MUST be minimal (<3 external scripts total)

**Rationale**: Static landing pages don't need framework overhead. Vanilla approach ensures fast load times, easier maintenance, and zero build complexity.

## Technical Standards

### HTML Requirements

- **MUST** use HTML5 doctype and semantic elements
- **MUST** validate against W3C HTML validator (no errors)
- **MUST** include proper meta tags (charset, viewport, description)
- **MUST** use proper heading hierarchy (h1-h6)
- **SHOULD** use ARIA labels where semantic HTML is insufficient

### CSS Requirements

- **MUST** use modern CSS (Grid, Flexbox, Custom Properties)
- **MUST** be mobile-first (min-width media queries)
- **MUST** include focus styles for keyboard navigation
- **MUST** support print stylesheets if content is printable
- **SHOULD** use CSS custom properties for theming
- **AVOID** browser-specific hacks; use feature detection instead

### JavaScript Requirements

- **MUST** use ES6+ syntax (let/const, arrow functions, modules)
- **MUST** include progressive enhancement (work without JS)
- **MUST** handle errors gracefully (no uncaught exceptions)
- **MUST** use strict mode ('use strict')
- **SHOULD** use vanilla DOM APIs (querySelector, fetch, etc.)
- **AVOID** inline event handlers; use addEventListener

### Accessibility Requirements

- **MUST** meet WCAG 2.1 Level AA compliance
- **MUST** support keyboard navigation (tab order, focus management)
- **MUST** include skip-to-content links
- **MUST** test with screen readers (NVDA, JAWS, VoiceOver)
- **MUST** respect user preferences (prefers-reduced-motion, prefers-color-scheme)

### Asset Optimization

- **MUST** compress all images (target <200KB per image)
- **MUST** serve modern formats (WebP, AVIF) with fallbacks
- **MUST** use lazy loading for below-the-fold images
- **MUST** inline critical CSS (<14KB recommended)
- **SHOULD** use system fonts or preload custom fonts
- **SHOULD** implement font-display: swap for web fonts

## Development Workflow

### Version Control

- **MUST** use Git for version control
- **MUST** write descriptive commit messages (conventional commits encouraged)
- **MUST** create branches for new features/fixes
- **MUST** keep main branch deployable at all times

### Testing & Validation

- **MUST** validate HTML with W3C validator before commits
- **MUST** test on Chrome, Firefox, Safari, Edge
- **MUST** test on iOS Safari and Android Chrome
- **MUST** run Lighthouse audits (target ≥90 all categories)
- **MUST** verify accessibility with browser DevTools
- **SHOULD** test with actual screen readers
- **SHOULD** validate CSS with W3C CSS validator

### Deployment

- **MUST** use HTTPS only (no mixed content)
- **MUST** configure proper caching headers
- **MUST** enable compression (gzip/brotli)
- **MUST** include security headers (CSP, X-Frame-Options, etc.)
- **SHOULD** use a CDN for static assets
- **SHOULD** implement monitoring (uptime, performance)

### Documentation

- **MUST** document environment variables in .env.sample
- **MUST** maintain README with setup instructions
- **MUST** document any external dependencies
- **SHOULD** include inline comments for complex logic

## Governance

### Amendment Process

This constitution supersedes all other practices and preferences. Amendments require:

1. Documented rationale for the change
2. Impact assessment on existing code
3. Approval from project maintainers
4. Version bump according to semantic versioning (see below)

### Versioning Policy

Constitution versions follow semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR**: Backward-incompatible changes (e.g., removing a principle, changing core requirements)
- **MINOR**: New principles or sections added, expanded guidance
- **PATCH**: Clarifications, wording improvements, typo fixes

### Compliance

- All pull requests MUST verify compliance with these principles
- Code reviews MUST reference specific principles when suggesting changes
- Violations MUST be justified in writing before being accepted
- Regular audits SHOULD be conducted to ensure ongoing compliance

### Justification of Complexity

Any deviation from these principles (e.g., adding a framework, external dependency, or breaking a MUST requirement) requires:

1. **What**: Clear description of the violation
2. **Why**: Specific problem being solved
3. **Alternatives**: Why simpler approaches were rejected
4. **Impact**: Performance, maintenance, and complexity costs

**Version**: 1.0.0 | **Ratified**: 2025-10-25 | **Last Amended**: 2025-10-25
