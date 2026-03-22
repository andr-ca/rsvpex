# Design Spec: RSVPex Landing Page Redesign + GitHub Actions CI/CD

**Date:** 2026-03-22
**Status:** Approved
**Requirements covered:** SITE-01–09, FORM-01–07, CICD-01–07

---

## Overview

Replace the current red-accent landing page with a "Warm Minimal" single-page coming-soon site. The page collects waitlist emails via Web3Forms and deploys automatically to Cloudflare Pages via GitHub Actions. No build step — vanilla HTML/CSS/JS only.

---

## 1. Visual Design

### Palette and Typography

| Token | Value | Use |
|---|---|---|
| `--cream` | `#f7f4ef` | Page background |
| `--ink` | `#1a1a1a` | Primary text, button background |
| `--terracotta` | `#b5895a` | Accents, eyebrow labels, rule divider, icon stroke |
| `--muted` | `#7a6a5a` | Secondary text (subheadline body) |
| `--subtle` | `#9a8878` | Tertiary text (disclaimer, footer) |
| `--border` | `#e0d8ce` | All rule lines, card borders |
| `--card-bg` | `#fff` | RSVP card background |
| `--pill-bg` | `#e8e0d5` | "Coming Soon" pill background |

Headlines: `Georgia, 'Times New Roman', serif`, weight 400, letter-spacing `-0.01em`.
Body and UI: `system-ui, -apple-system, sans-serif`.

No emoji anywhere. All icons are inline SVG, `stroke="#b5895a"`, `stroke-width="1.5"`, `fill="none"`, 24×24 viewBox.

### Reduced-Motion

All transitions and animations must be wrapped in `@media (prefers-reduced-motion: no-preference)`. Default state is static.

---

## 2. Page Structure

Single HTML file (`index.html`). Three semantic sections:

```
<header>  — sticky nav bar
<main>
  <section.hero>    — headline + form (left), RSVP card mock (right)
  <section.pillars> — five feature pillars
</main>
<footer>
```

### 2.1 Navigation Bar

- Sticky, `position: sticky; top: 0; z-index: 100`
- Background `#f7f4ef`, bottom border `1px solid #e0d8ce`
- Left: wordmark `RSVP<span style="color:#b5895a">EX</span>` — `system-ui`, weight 800, uppercase, letter-spacing `0.1em`
- Right: "Coming Soon" pill — `font-size: 0.7rem`, uppercase, background `#e8e0d5`, border-radius `20px`, padding `0.3rem 0.7rem`

### 2.2 Hero Section

Two-column grid on desktop (≥900px); single column on mobile.

**Left column (text + form):**
- Eyebrow label: `"Event RSVP Management"` — system-ui, `0.65rem`, uppercase, letter-spacing `0.18em`, terracotta
- H1: `"Every guest. Every detail. Perfectly tracked."` — serif, `2.4rem` desktop / `1.8rem` mobile, weight 400. The phrase *Every detail.* is wrapped in `<em>` (italic)
- Terracotta rule: `40px × 2px`, `background: #b5895a`, margin below h1
- Subheadline `<p>`: "Beautiful RSVP management for events that matter — dietary restrictions, gift registries, and guest lists, all in one place. Self-hosted and private." — system-ui, `0.85rem`, `#6b5d50`, `line-height: 1.7`
- Waitlist form (see Section 3)
- Disclaimer: "No spam. Unsubscribe any time." — `0.68rem`, `#9a8878`

**Right column (decorative card):**
- Decorative circle: `180px × 180px`, `background: #e8e0d5`, `border-radius: 50%`, positioned `top: 0; right: 0` behind card
- Card: white background, `border: 1px solid #e0d8ce`, `border-radius: 8px`, `box-shadow: 0 4px 20px rgba(0,0,0,0.07)`, `width: 210px`
- Card content (static, decorative — not interactive):
  - Terracotta label: `"Summer Garden Party"`
  - Italic line: `"42 guests confirmed"`
  - Row 1 (green dot): `"Sarah & Tom — Attending (2)"`
  - Row 2 (amber dot): `"Dietary: gluten-free (1)"`
  - Row 3 (terracotta dot): `"Gift registry linked"`
  - Footer link: `"View full guest list →"` in terracotta
- Card is hidden on mobile (≤ 899px) via `display: none`

### 2.3 Pillars Section

Five equal-width columns. `border-top: 1px solid #e0d8ce`, columns 2–5 have `border-left: 1px solid #e0d8ce`.

On mobile: 2 columns (2-2-1 wrapping grid or two-row with centred last item).

Each pillar: inline SVG icon (terracotta, 24×24), uppercase label (`0.65rem`, weight 700, `#1a1a1a`), description text (`0.65rem`, `#7a6a5a`).

| Pillar | Icon (Heroicons-style path) | Label | Description |
|---|---|---|---|
| 1 | Envelope / email | Beautiful Invites | Custom RSVP pages guests enjoy filling out |
| 2 | Activity / waveform | Live Tracking | Responses arrive in real time |
| 3 | Globe / meridians | Dietary Needs | Collect restrictions per guest, export for catering |
| 4 | Gift box | Gift Registry | Link your registry — shown after guests confirm |
| 5 | Padlock | Your Data, Private | Self-hosted. No third-party storage. |

Exact SVG paths are defined in the approved mockup (`layout-v3.html`); use those verbatim.

### 2.4 Footer

One row, `display: flex; justify-content: space-between`. Padding `1.2rem 2rem`. `border-top: 1px solid #e0d8ce`.

- Left: `© 2026 RSVPex` — `0.65rem`, `#9a8878` (use current year 2026; the approved mockup shows 2025 but the spec date is 2026)
- Right: `hello@rsvpex.com · Privacy` — `0.65rem`, `#9a8878` with `<a>` tags

---

## 3. Waitlist Form

Inline in the hero left column. Posts to `https://api.web3forms.com/submit`.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `access_key` | hidden | yes | Value injected at deploy time from `WEB3FORMS_ACCESS_KEY` env var via GitHub Actions (never hardcoded in source) |
| `redirect` | hidden | yes | `/thank-you.html` |
| `subject` | hidden | yes | `"New Waitlist Sign-up"` |
| `email` | email | yes | Label `"Email"`, placeholder `"your@email.com"` |
| `name` | text | no | Label `"Name (Optional)"` |
| `botcheck` | checkbox | — | Hidden honeypot, `display: none` |

### Validation (client-side, before submit)

- Email: required, valid format (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
- Name: optional; if provided, minimum 2 characters
- On error: show inline error message below field, add `aria-invalid="true"` and `aria-describedby` pointing to error element
- Error elements exist in DOM always (for screen readers); hidden via `[hidden]` attribute, not CSS `display:none`

### Submit behaviour

- Button shows "Sending…" and is `disabled` during submission
- On success: `window.location.href = '/thank-you.html'`
- On error: display generic error message below the button, re-enable button

### Accessibility

- All inputs have visible `<label>` elements (not placeholder-only)
- `aria-required="true"` on email
- `aria-describedby` links input to its error span
- Focus ring: `outline: 2px solid #b5895a; outline-offset: 2px` (not suppressed)
- Submit button `min-height: 44px`

---

## 4. Thank-You Page (`thank-you.html`)

Matches visual style: same nav, cream background, terracotta accents. No form. Links back to home.

**Content:**
- Eyebrow label: `"Waitlist"` — same style as hero eyebrow
- Headline: `"You're on the list."` — serif h1
- Body: `"Thanks for joining! We'll be in touch when RSVPex launches."` — system-ui, muted colour
- Link: `"← Back to home"` — terracotta, links to `/`

---

## 5. CSS Architecture

Single external file: `css/main.css`. No inline styles except where semantically unavoidable (card absolute positioning).

Custom properties declared on `:root`:

```css
--cream: #f7f4ef;
--ink: #1a1a1a;
--terracotta: #b5895a;
--muted: #7a6a5a;
--subtle: #9a8878;
--border: #e0d8ce;
--card-bg: #fff;
--pill-bg: #e8e0d5;
```

Breakpoints: `min-width: 900px` for desktop two-column hero; `min-width: 600px` for intermediate font scaling. Mobile-first.

---

## 6. JS (`js/main.js`)

Vanilla ES6+. Single responsibility: form validation and submit UX. No framework, no bundler.

```
- Listen for form `submit` event (prevent default)
- Validate email and name
- If valid: disable button, set label to "Sending…", POST via fetch
- On fetch success (response.ok): redirect to thank-you page
- On fetch error: re-enable button, show error message
```

The `access_key` value is already in the hidden input from HTML; JS does not need to read it from env. The substitution happens at deploy time (see Section 7).

---

## 7. CI/CD: GitHub Actions

Workflow file: `.github/workflows/deploy.yml`. Triggers on:
- `push` to `main` → production deployment
- `pull_request` targeting `main` → preview deployment

### Required Secrets (GitHub repository secrets)

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Wrangler authentication |
| `CLOUDFLARE_ACCOUNT_ID` | Wrangler project scoping |
| `WEB3FORMS_ACCESS_KEY` | Injected into HTML at deploy time via `sed` substitution |

### Deployment Steps

1. `actions/checkout@v4`
2. `actions/setup-node@v4` (Node 20)
3. `npm install -g wrangler`
4. Inject Web3Forms key: `sed -i "s/{{WEB3FORMS_ACCESS_KEY}}/${{ secrets.WEB3FORMS_ACCESS_KEY }}/g" static-web/index.html`
5. On PR: `wrangler pages deploy static-web --project-name=rsvpex-landing --branch=pr-${{ github.event.pull_request.number }}`
6. On push to main: `wrangler pages deploy static-web --project-name=rsvpex-landing --branch=main`

### PR Comment

After preview deployment, post a comment on the PR using `peter-evans/create-or-update-comment` action with the preview URL `https://pr-<N>.rsvpex-landing.pages.dev`.

### Source HTML placeholder

`index.html` uses `{{WEB3FORMS_ACCESS_KEY}}` as the placeholder value in the hidden `access_key` input. `.env.sample` documents this variable. The actual key is never in source.

---

## 8. File Layout

```
static-web/
  index.html
  thank-you.html
  css/
    main.css
  js/
    main.js
  images/
    favicon/
      favicon.svg
      favicon.ico
  .env.sample
  wrangler.toml           (unchanged)
.github/
  workflows/
    deploy.yml
```

Files excluded from Cloudflare Pages deploy (already in `wrangler.toml`): `.git`, `.github`, `.gitignore`, `.env*`, `*.md`, `*.yml`, `wrangler.toml`, `node_modules`.

---

## 9. Accessibility Checklist

- [ ] WCAG 2.1 AA colour contrast on all text/background pairs
- [ ] All images have `alt` text (hero card is decorative — `role="presentation"` or no `<img>` tag)
- [ ] Focus-visible on all interactive elements
- [ ] Reduced-motion: no animations/transitions by default
- [ ] Form inputs labelled, errors announced via `aria-describedby`
- [ ] Keyboard-navigable in logical DOM order

---

## 10. Out of Scope (deferred to v2)

- Entrance animation on hero card (SITE-V2-01)
- Social share meta images (SITE-V2-02)
- Cloudflare Turnstile CAPTCHA
- Cloudflare Web Analytics token

---

## Reference

- Approved mockup: `.superpowers/brainstorm/2648384-1774179608/layout-v3.html`
- Existing Gitea workflow (reference only): `static-web/.gitea/workflows/deploy.yml`
- Requirements: `.planning/REQUIREMENTS.md` (SITE-01–09, FORM-01–07, CICD-01–07)
