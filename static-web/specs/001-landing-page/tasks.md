---
description: "Task list for RSVPex landing page implementation"
---

# Tasks: RSVPex Landing Page

**Input**: Design documents from `/specs/001-landing-page/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Root: `/` (where index.html lives)
- Styles: `css/main.css`, `css/critical.css`
- Scripts: `js/main.js`
- Images: `images/hero/`, `images/icons/`, `images/favicon/`
- Root files: `robots.txt`, `sitemap.xml`, `thank-you.html`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project structure: `/`, `css/`, `js/`, `images/hero/`, `images/icons/`, `images/favicon/`
- [ ] T002 Create `.env.sample` with required variables: WEB3FORMS_ACCESS_KEY, CLOUDFLARE_TOKEN, DOMAIN, CONTACT_EMAIL
- [ ] T003 [P] Create `.gitignore` with patterns for `.env`, `*.log`, `.DS_Store`, `node_modules/` (if needed)
- [ ] T004 [P] Create `robots.txt` with sitemap reference and allow all user-agents
- [ ] T005 [P] Create `sitemap.xml` with URLs: `/` (priority 1.0) and `/thank-you.html` (priority 0.5)
- [ ] T006 Create `README.md` with setup instructions, prerequisites, and deployment guide

**Checkpoint**: Project structure ready - can start developing user stories in parallel

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core HTML/CSS foundation that MUST be complete before user story implementations

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T007 Create base `index.html` with proper doctype, meta tags (charset, viewport, title, description, canonical)
- [ ] T008 [P] Add Open Graph meta tags to `index.html` (og:title, og:description, og:image, og:url)
- [ ] T009 [P] Add Twitter Card meta tags to `index.html` (twitter:card, twitter:title, twitter:description, twitter:image)
- [ ] T010 [P] Add structured data (JSON-LD) to `index.html` for SoftwareApplication schema
- [ ] T011 [P] Add semantic HTML structure: `<header>`, `<main>`, section stubs, `<footer>` to `index.html`
- [ ] T012 [P] Add favicon references to `index.html` (`<link rel="icon">`, `<link rel="apple-touch-icon">`)
- [ ] T013 [P] Add analytics script reference to `index.html` for Cloudflare Web Analytics (defer loading)
- [ ] T014 Create `css/main.css` with mobile-first base styles: variables, reset, typography, container utilities
- [ ] T015 [P] Create `css/critical.css` with above-the-fold critical styles (header, hero section skeleton)
- [ ] T016 Inline `css/critical.css` into `<style>` tag in `index.html` head
- [ ] T017 Add deferred `<link rel="stylesheet" href="/css/main.css">` to `index.html` head
- [ ] T018 [P] Create `js/main.js` with strict mode and form validation functions (validateEmail, showError, clearError)
- [ ] T019 [P] Create `thank-you.html` with proper meta tags, heading, confirmation message, and back link

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - First Impression & Email Capture (Priority: P1) 🎯 MVP

**Goal**: Visitors see clear headline announcing coming-soon product and can capture their email in hero section above the fold

**Independent Test**: Load homepage, read headline, submit valid email, see confirmation message on thank-you page, verify email behavior works without JavaScript

### Acceptance Criteria for US1:
1. ✅ Hero headline visible and readable within 2 seconds on 4G (FR-001, FR-002)
2. ✅ Email form visible above fold (FR-003)
3. ✅ Form validates email format before submission (FR-004)
4. ✅ Form displays success message or redirects to thank-you (FR-005)
5. ✅ Form displays error messages for invalid inputs (FR-006)
6. ✅ Form is keyboard accessible (FR-015)
7. ✅ Form works without JavaScript (FR-016)
8. ✅ Form integrates with Web3Forms (FR-017)

### Implementation for User Story 1

- [ ] T020 Create hero section HTML structure: `<section class="hero">` with heading, subheading, form container stubs in `index.html`
- [ ] T021 Add hero headline `<h1>` with placeholder text to `index.html`
- [ ] T022 Add hero subheadline `<p>` with placeholder text to `index.html`
- [ ] T023 Create email signup form in `index.html` with:
  - `<form action="https://api.web3forms.com/submit" method="POST">`
  - Hidden inputs: `access_key`, `redirect`, `subject`
  - Email input with HTML5 validation and placeholder
  - Optional name input
  - Optional subscribe checkbox
  - Hidden honeypot field (`botcheck`)
  - Submit button with class `btn btn-primary`
- [ ] T024 [P] Add form group styling to `css/main.css`: `.form-group`, `input[type="email"]`, `input[type="text"]`, `.btn`, `.btn-primary`
- [ ] T025 [P] Add form focus styles to `css/main.css` for keyboard accessibility: `input:focus`, `button:focus`
- [ ] T026 [P] Add form error display styles to `css/main.css`: `.error`, `.input--error`, `[hidden]`
- [ ] T027 Add form JavaScript validation to `js/main.js`:
  - Email blur validation (validateEmail function)
  - Form submit handler
  - Error message display/clear
  - Attach event listeners to form elements
- [ ] T028 [P] Create hero section styles in `css/main.css`:
  - `.hero` container: padding, text alignment
  - `h1` typography: font size (2rem mobile), line-height, margin
  - `.hero-subheadline`: font size, margin, color
  - `.hero-content`: flex container for form layout
- [ ] T029 [P] Update critical CSS in `css/critical.css` to include hero section above-fold styles
- [ ] T030 Test email form submission without JavaScript (disable JS in DevTools, submit form, verify redirect works)
- [ ] T031 Test email validation catches invalid formats (empty email, missing @, etc.)
- [ ] T032 Test form accessibility: tab through fields, verify focus indicators visible, test with screen reader simulator

**Checkpoint**: User Story 1 complete and independently testable. Email capture form fully functional.

---

## Phase 4: User Story 2 - Value Understanding (Priority: P2)

**Goal**: Visitors see 3-5 benefit cards with icons explaining RSVPex value proposition, improving conversion quality

**Independent Test**: Scroll through page, see benefits section with cards, each card readable with icon and description

### Acceptance Criteria for US2:
1. ✅ Benefits section visible below hero (FR-007)
2. ✅ 3-5 benefit cards with icons and descriptions (FR-007, FR-008)
3. ✅ Each card describes user value, not technical features (FR-008)
4. ✅ Icons visible and appropriate (meets design requirements)
5. ✅ Responsive layout: 1 col mobile, 2-3 cols tablet/desktop (FR-009)
6. ✅ Text readable and accessible (FR-010, FR-015)

### Implementation for User Story 2

- [ ] T033 Create benefits section HTML structure in `index.html`:
  - `<section class="benefits">` with heading `<h2>Why RSVPex?</h2>`
  - `.benefits-grid` container
  - 3-5 benefit card stubs with class `.benefit-card`
- [ ] T034 [P] Create benefit card HTML for each card in `index.html`:
  - Card title `<h3>`
  - Card description `<p>`
  - SVG icon placeholder with `aria-hidden="true"`
- [ ] T035 [P] Download and optimize SVG icons from Heroicons (4-5 icons total) to `images/icons/`
- [ ] T036 Inline SVG icons into benefit cards in `index.html` (copy SVG content into each card)
- [ ] T037 [P] Add benefits section styles to `css/main.css`:
  - `.benefits` section: padding, background
  - `h2` typography: font size, margin, alignment
  - `.benefits-grid`: CSS Grid with responsive columns
    - Mobile (default): `grid-template-columns: 1fr`
    - Tablet (@media min-width: 600px): `grid-template-columns: repeat(2, 1fr)`
    - Desktop (@media min-width: 900px): `grid-template-columns: repeat(3, 1fr)`
  - `.benefit-card`: padding, background, border, shadow
  - `.benefit-icon`: width, height, margin, color
  - Benefit card headings and text styles
- [ ] T038 [P] Update critical CSS for benefits grid skeleton (if above fold on larger screens)
- [ ] T039 Test benefits section responsive layout on mobile (375px), tablet (600px), desktop (900px+)
- [ ] T040 Test icon visibility and accessibility (alt text via aria-hidden, semantic structure)
- [ ] T041 Test text contrast and readability (WCAG AA 4.5:1 for body text)

**Checkpoint**: User Story 2 complete. Benefits section fully functional and responsive.

---

## Phase 5: User Story 3 - Secondary Contact (Priority: P3)

**Goal**: Footer provides contact email and optional social links for visitors who prefer direct communication

**Independent Test**: Scroll to footer, find contact email address and optional social links, email link is functional

### Acceptance Criteria for US3:
1. ✅ Footer visible at page bottom (FR-014)
2. ✅ Contact email address present and clickable (FR-014)
3. ✅ Optional social media links (if accounts exist)
4. ✅ Legal links (privacy policy) if required
5. ✅ Copyright notice present
6. ✅ Footer styled appropriately and accessible

### Implementation for User Story 3

- [ ] T042 Create footer HTML structure in `index.html`:
  - `<footer class="footer">` with container
  - Contact section: text + email link `<a href="mailto:...">`
  - Optional `.social-links` with placeholder links
  - Optional `.legal` with links to /privacy.html, /terms.html
  - Copyright notice: `© 2025 RSVPex`
- [ ] T043 [P] Add footer styles to `css/main.css`:
  - `.footer`: background, padding, text-align, margin-top
  - `.footer a`: color (primary), text-decoration
  - `.social-links`: flex layout, spacing
  - `.legal`: flex layout, spacing
  - `.copyright`: font size, color
- [ ] T044 [P] Add footer to critical CSS if above fold on small screens
- [ ] T045 Test footer layout responsive on mobile and desktop
- [ ] T046 Test email link opens email client with proper `mailto:` link
- [ ] T047 Test footer accessibility: link focus states, semantic HTML

**Checkpoint**: User Story 3 complete. Footer fully functional with contact information.

---

## Phase 6: Visual Assets & Polish

**Purpose**: Add illustrations, optimize images, ensure performance

- [ ] T048 Download hero illustration from unDraw.co (search "events" or "celebration"), customize color to brand
- [ ] T049 Optimize hero SVG illustration with SVGOMG (target <30KB)
- [ ] T050 Create hero visual section HTML in `index.html`: `<div class="hero-visual">` with SVG placeholder
- [ ] T051 Inline optimized hero SVG into `index.html` hero section with proper accessibility attributes
- [ ] T052 [P] Create favicon files (16x16, 32x32, 180x180 PNG) or SVG favicon
- [ ] T053 [P] Optimize favicon files and save to `images/favicon/`
- [ ] T054 Verify favicon references in `index.html` point to correct paths
- [ ] T055 Create OG preview image (1200x630px, <500KB) showing hero section or product concept
- [ ] T056 [P] Create Twitter preview image (1200x675px, <500KB) for social sharing
- [ ] T057 [P] Save preview images to `images/` and reference in meta tags (verify full URLs in HTML)
- [ ] T058 [P] Add hero illustration styles to `css/main.css`:
  - `.hero-visual`: flex container, sizing
  - `.hero-illustration`: width, height, max-width
  - Responsive adjustments for mobile vs desktop
- [ ] T059 Test image loading and display on all breakpoints
- [ ] T060 Verify image file sizes are within performance budget (<100KB total for visuals)

**Checkpoint**: Visual assets complete and optimized.

---

## Phase 7: Performance & Accessibility Validation

**Purpose**: Ensure Lighthouse ≥90 and WCAG 2.1 AA compliance

- [ ] T061 Run W3C HTML validator on `index.html`, fix any errors
- [ ] T062 [P] Run W3C CSS validator on `css/main.css`, fix any errors
- [ ] T063 Run Lighthouse audit on full page via DevTools, verify:
  - Performance: ≥90
  - Accessibility: ≥90
  - Best Practices: ≥90
  - SEO: ≥90
- [ ] T064 Test page load time on simulated 4G network (target <2 seconds for hero content)
- [ ] T065 [P] Test keyboard navigation: tab through all interactive elements (form inputs, buttons, links)
- [ ] T066 [P] Test with screen reader: NVDA (Windows) or VoiceOver (Mac), verify:
  - Headings announced with correct hierarchy (h1, h2, h3)
  - Form labels associated with inputs
  - Error messages announced with role="alert"
  - Icon purpose clear (aria-hidden for decorative, aria-label for meaningful)
- [ ] T067 [P] Test color contrast with Lighthouse DevTools, verify 4.5:1 for body text
- [ ] T068 Test page functionality without JavaScript:
  - Disable JS in DevTools
  - Load page
  - Verify hero content visible
  - Submit form
  - Verify redirect to thank-you.html
- [ ] T069 Test on multiple browsers:
  - Chrome (desktop)
  - Firefox (desktop)
  - Safari (desktop)
  - Edge (desktop)
  - Safari on iOS (iPhone 12 or similar)
  - Chrome on Android (Pixel or similar)
- [ ] T070 Test on multiple viewport widths:
  - Mobile: 320px (small phone)
  - Mobile: 375px (standard phone)
  - Tablet: 600px (landscape tablet)
  - Desktop: 900px (small desktop)
  - Desktop: 1200px+ (standard desktop)
  - Verify no horizontal scroll on any viewport
  - Verify touch targets ≥44×44px on mobile

**Checkpoint**: Full validation passed. Page meets all constitution and spec requirements.

---

## Phase 8: SEO & Meta Tags Verification

**Purpose**: Verify all SEO requirements met before deployment

- [ ] T071 Verify page title in `index.html` (30-60 chars, includes primary keyword)
- [ ] T072 Verify meta description (120-160 chars, includes CTA)
- [ ] T073 Verify canonical URL matches expected domain
- [ ] T074 Verify Open Graph meta tags:
  - og:type: website
  - og:title: compelling for social sharing
  - og:description: matches meta description
  - og:image: 1200x630px, path correct
  - og:url: full domain URL
- [ ] T075 Verify Twitter Card meta tags:
  - twitter:card: summary_large_image
  - twitter:title: <70 chars
  - twitter:description: <200 chars
  - twitter:image: 1200x675px
  - twitter:site: @handle (if account exists)
- [ ] T076 Test Open Graph preview with Facebook Debugger (https://developers.facebook.com/tools/debug/)
- [ ] T077 Test Twitter Card with Twitter Card Validator (https://cards-dev.twitter.com/validator)
- [ ] T078 Verify JSON-LD structured data is valid (use https://schema.org validator or Google Rich Results Test)
- [ ] T079 Verify robots.txt allows all and references sitemap.xml
- [ ] T080 Verify sitemap.xml is valid XML with correct URLs and priorities

**Checkpoint**: All SEO requirements verified.

---

## Phase 9: Form Integration Testing

**Purpose**: Verify Web3Forms integration works end-to-end

- [ ] T081 Verify `.env.sample` has WEB3FORMS_ACCESS_KEY placeholder
- [ ] T082 Set WEB3FORMS_ACCESS_KEY in `.env` file (create .env from .env.sample)
- [ ] T083 Verify form action URL is correct: `https://api.web3forms.com/submit`
- [ ] T084 Verify form hidden inputs are present:
  - `access_key` with value from env (or hardcoded for testing)
  - `redirect` with value `/thank-you.html`
  - `subject` with value `New Beta Sign-up`
  - `botcheck` honeypot field (hidden)
- [ ] T085 Test form submission with valid email:
  - Submit form
  - Verify redirect to `/thank-you.html`
  - Check inbox for email from `noreply@web3forms.com`
  - Verify email contains submitted email address
- [ ] T086 Test form submission with invalid email formats:
  - Missing @ symbol
  - Missing domain
  - Verify error message displays client-side
  - Verify form does not submit
- [ ] T087 Test form submission without email:
  - Try to submit empty form
  - Verify error message displays
  - Verify form does not submit
- [ ] T088 Test form honeypot (botcheck field):
  - Manually set botcheck to checked
  - Verify Web3Forms rejects submission (or silently fails)
- [ ] T089 Test optional name field:
  - Submit with email + name
  - Verify name appears in received email
  - Submit with email only
  - Verify form accepts submission without name
- [ ] T090 Test optional subscribe checkbox:
  - Submit with checked
  - Verify "yes" appears in received email
  - Submit without checking
  - Verify checkbox state handled correctly

**Checkpoint**: Form integration complete and tested.

---

## Phase 10: Analytics Setup (Optional)

**Purpose**: Configure Cloudflare Web Analytics (free tier)

- [ ] T091 Verify Cloudflare token in `.env` or determine if analytics needed
- [ ] T092 Add Cloudflare Analytics script to `index.html` and `thank-you.html`:
  - `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "YOUR_TOKEN"}'></script>`
- [ ] T093 [P] Replace `YOUR_TOKEN` placeholder with actual token from Cloudflare
- [ ] T094 [P] Deploy to Cloudflare Pages (or test server)
- [ ] T095 Verify analytics dashboard shows page visits and events (may take 5-10 minutes to appear)
- [ ] T096 Test goal tracking: submit form, verify "Signup" event appears in analytics

**Checkpoint**: Analytics optional but configured if enabled.

---

## Phase 11: Deployment Preparation

**Purpose**: Prepare for Cloudflare Pages deployment

- [ ] T097 Commit all files to feature branch `001-landing-page`:
  - `git add .`
  - `git commit -m "feat: complete RSVPex landing page with email capture form"`
- [ ] T098 [P] Create or update `.gitignore` with patterns for `.env`, `*.log`, `.DS_Store`
- [ ] T099 [P] Verify `.env` file is in `.gitignore` (do not commit secrets)
- [ ] T100 Verify all required files present in repository:
  - `index.html`, `thank-you.html`, `css/main.css`, `css/critical.css`, `js/main.js`
  - `images/hero/`, `images/icons/`, `images/favicon/`
  - `robots.txt`, `sitemap.xml`, `README.md`
  - `.env.sample` (with placeholder keys)
- [ ] T101 [P] Update `README.md` with deployment instructions for Cloudflare Pages
- [ ] T102 [P] Verify no sensitive information (API keys, tokens) in committed code

**Checkpoint**: Code ready for deployment.

---

## Phase 12: Deployment & Launch

**Purpose**: Deploy to Cloudflare Pages and verify live

- [ ] T103 Push feature branch to GitHub: `git push origin 001-landing-page`
- [ ] T104 Connect GitHub repository to Cloudflare Pages (if not already connected)
- [ ] T105 Create Cloudflare Pages project:
  - Select repository and `001-landing-page` branch
  - Build command: (leave empty)
  - Build output directory: `/` (root)
  - Deploy
- [ ] T106 Set environment variables in Cloudflare Pages project settings:
  - `WEB3FORMS_ACCESS_KEY`
  - `CLOUDFLARE_TOKEN` (if using analytics)
- [ ] T107 Verify deployment succeeds (wait for build to complete, green checkmark)
- [ ] T108 Visit live site at Cloudflare-provided URL, verify:
  - Page loads
  - All content visible
  - Styles applied correctly
  - Images display
  - Form appears
- [ ] T109 Test form submission on live site:
  - Submit valid email
  - Verify redirect to thank-you page
  - Check inbox for Web3Forms email
- [ ] T110 Run Lighthouse audit on live site, verify ≥90 in all categories
- [ ] T111 [P] Share live URL with team for testing
- [ ] T112 [P] Create GitHub issue or PR for code review (if using PR workflow)

**Checkpoint**: Live deployment verified and working.

---

## Phase 13: Post-Launch Monitoring

**Purpose**: Monitor live site and fix any issues

- [ ] T113 Monitor Cloudflare Pages deployment logs for errors (first 24 hours)
- [ ] T114 Check analytics dashboard: verify visitor count, page views, bounce rate
- [ ] T115 Monitor Web3Forms inbox: verify emails arriving for form submissions
- [ ] T116 Test form submission on live site daily (first week) to catch any issues
- [ ] T117 [P] Monitor browser console for JavaScript errors (test on real devices)
- [ ] T118 [P] Monitor Core Web Vitals in Cloudflare Analytics
- [ ] T119 Document any issues found and create GitHub issues for fixes
- [ ] T120 Share live site link with marketing team for traffic and promotion

**Checkpoint**: Live site monitored and operational.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - Can then proceed in parallel or sequential
  - Or sequentially in priority order (P1 → P2 → P3)
- **Visual Assets (Phase 6)**: Can start after Phase 3 (once hero structure exists)
- **Validation (Phase 7-10)**: Depends on all stories complete (Phase 5)
- **Deployment (Phase 11-13)**: Final phase after all validation

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Independent from US1
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Independent from US1/US2

### Within Each User Story

- HTML structure first (T020-T023, T033-T034, T042)
- Styling second (T024-T028, T037-T038, T043-T044)
- JavaScript/interaction third (T027, if applicable)
- Testing last (T030-T032, T039-T041, T045-T047)

### Parallel Opportunities

- **Setup Phase (Phase 1)**: T003-T006 can run in parallel
- **Foundational Phase (Phase 2)**: T008-T013 can run in parallel, T015-T017 can run in parallel
- **All User Stories (Phase 3-5)**: Can be worked on simultaneously by different people
- **Validation Phase (Phase 7)**: T065-T070 can run in parallel (cross-browser testing)
- **Deployment Phase (Phase 11-12)**: T098-T102 can run in parallel

---

## Parallel Example: User Story 1

```
Parallel task execution (developer A works on HTML, B works on CSS, C works on JS):

Developer A: T020, T021, T022, T023 (HTML structure)
Developer B: T024, T025, T026, T028, T029 (CSS styling)
Developer C: T027 (JavaScript validation)

All merge changes, then:
Shared: T030, T031, T032 (Testing - sequential, one person)
```

---

## Parallel Example: Validation Phase

```
Cross-browser testing (multiple testers):

Tester A: T065-T067 (Accessibility & contrast)
Tester B: T068 (No-JS testing)
Tester C: T069 (Multi-browser testing)
Tester D: T070 (Viewport/responsiveness testing)

All tests complete in parallel, results consolidated
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. Run Phase 7: Lighthouse validation
5. **STOP and VALIDATE**: Test US1 independently (form capture working)
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo (enhanced)
4. Add User Story 3 → Test independently → Deploy/Demo (complete)
5. Add Visual Assets → Deploy/Demo (final polish)
6. Each story adds value without breaking previous stories

### Parallel Team Strategy (Multiple Developers)

With 3 developers:

1. Dev 1 + Dev 2 + Dev 3: Complete Setup + Foundational together (Phase 1-2)
2. Once Foundational done:
   - Dev 1: User Story 1 (email form)
   - Dev 2: User Story 2 (benefits section)
   - Dev 3: User Story 3 (footer) + Visual Assets
3. Stories complete and integrate independently
4. All: Run validation (Phase 7) together
5. All: Deploy (Phase 12) together

---

## Notes

- [P] tasks = can run in parallel (different files, no dependencies)
- Each user story should be independently completable and testable
- Respect sequential dependencies within foundational phase
- Mark off completed tasks with [X] as you finish each one
- Commit changes after each logical group of tasks
- Stop at checkpoints to validate story independently
- For deployment: use Cloudflare Pages for free static hosting
- Form submissions: Web3Forms handles email delivery (no backend needed)
- Email collection: Export from Web3Forms inbox weekly to Mailchimp for beta launch
