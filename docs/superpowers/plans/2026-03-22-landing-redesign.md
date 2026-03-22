# RSVPex Landing Page Redesign + CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current red-accent landing page with the approved "Warm Minimal" design, add a working Web3Forms waitlist form (with access key injected at deploy time), and wire up GitHub Actions to deploy to Cloudflare Pages with PR previews.

**Architecture:** Vanilla HTML/CSS/JS with no build step. CSS lives in `css/main.css` using custom properties; JS lives in `js/main.js` for form handling only. GitHub Actions injects the Web3Forms key via `sed` at deploy time so the key is never in source.

**Tech Stack:** HTML5, CSS3, ES6+, Web3Forms API, Wrangler CLI, GitHub Actions, Cloudflare Pages

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Rewrite | `static-web/index.html` | Full page markup — nav, hero, pillars, footer, form with `{{WEB3FORMS_ACCESS_KEY}}` placeholder |
| Rewrite | `static-web/css/main.css` | All styles — custom properties, layout, typography, responsiveness, reduced-motion |
| Rewrite | `static-web/js/main.js` | Form validation, submit UX (loading state, error display, redirect) |
| Rewrite | `static-web/thank-you.html` | Confirmation page matching visual style |
| Update | `static-web/.env.sample` | Document `WEB3FORMS_ACCESS_KEY` variable |
| Create | `.github/workflows/deploy.yml` | GitHub Actions — production + PR preview deploys, PR comment |

`static-web/wrangler.toml` is unchanged.

---

## Task 1: CSS foundation and design tokens

**Files:**
- Rewrite: `static-web/css/main.css`

- [ ] **Step 1: Wipe the existing stylesheet**

Open `static-web/css/main.css` and replace its entire contents with the reset and custom properties block below. Do not keep any existing rules — the old design (red primary, white bg, social links, benefits grid) is completely replaced.

```css
/* ==========================================================================
   RSVPex — Warm Minimal
   ========================================================================== */

/* ---------- Reset ---------- */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  background: var(--cream);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}

/* ---------- Tokens ---------- */
:root {
  --cream:      #f7f4ef;
  --ink:        #1a1a1a;
  --terracotta: #b5895a;
  --muted:      #7a6a5a;
  --subtle:     #9a8878;
  --border:     #e0d8ce;
  --card-bg:    #fff;
  --pill-bg:    #e8e0d5;
  --max-w:      1100px;
}
```

- [ ] **Step 2: Add navigation styles**

Append to `css/main.css`:

```css
/* ---------- Nav ---------- */
.site-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--cream);
  border-bottom: 1px solid var(--border);
  padding: 1.2rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav-wordmark {
  font-family: system-ui, -apple-system, sans-serif;
  font-weight: 800;
  font-size: 1rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink);
  text-decoration: none;
}

.nav-wordmark span { color: var(--terracotta); }

.nav-pill {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  background: var(--pill-bg);
  padding: 0.3rem 0.7rem;
  border-radius: 20px;
}
```

- [ ] **Step 3: Add hero layout styles**

Append to `css/main.css`:

```css
/* ---------- Hero ---------- */
.hero {
  max-width: var(--max-w);
  margin: 0 auto;
  padding: 4rem 2rem 2rem;
  display: grid;
  grid-template-columns: 1fr;
  gap: 3rem;
  align-items: center;
}

@media (min-width: 900px) {
  .hero { grid-template-columns: 1fr 1fr; }
}

.hero-eyebrow {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--terracotta);
  margin-bottom: 1rem;
}

.hero-headline {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.8rem;
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 1.15;
  color: var(--ink);
  margin-bottom: 1rem;
}

@media (min-width: 900px) {
  .hero-headline { font-size: 2.4rem; }
}

@media (min-width: 600px) {
  .hero-headline { font-size: 2.1rem; }
}

.hero-rule {
  width: 40px;
  height: 2px;
  background: var(--terracotta);
  margin-bottom: 1.2rem;
}

.hero-subheadline {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 0.85rem;
  color: #6b5d50;
  line-height: 1.7;
  margin-bottom: 2rem;
}
```

- [ ] **Step 4: Add form styles**

Append to `css/main.css`:

```css
/* ---------- Waitlist form ---------- */
.waitlist-form { margin-bottom: 0.6rem; }

.form-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}

.form-field { flex: 1; }

.form-field label {
  display: block;
  font-size: 0.78rem;
  color: var(--muted);
  margin-bottom: 0.3rem;
}

.form-field input[type="email"],
.form-field input[type="text"] {
  width: 100%;
  padding: 0.6rem 0.8rem;
  border: 1.5px solid var(--border);
  border-radius: 4px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 0.8rem;
  background: var(--card-bg);
  color: var(--ink);
}

@media (prefers-reduced-motion: no-preference) {
  .form-field input[type="email"],
  .form-field input[type="text"] {
    transition: border-color 0.15s;
  }
}

.form-field input:focus {
  outline: 2px solid var(--terracotta);
  outline-offset: 2px;
  border-color: var(--terracotta);
}

.form-field input[aria-invalid="true"] {
  border-color: #c0392b;
}

.field-error {
  display: block;
  font-size: 0.7rem;
  color: #c0392b;
  margin-top: 0.25rem;
}

.btn-submit {
  background: var(--ink);
  color: var(--cream);
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.6rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  min-height: 44px;
  align-self: flex-end;
}

.btn-submit:focus {
  outline: 2px solid var(--terracotta);
  outline-offset: 2px;
}

.btn-submit:disabled {
  background: var(--muted);
  cursor: not-allowed;
}

.form-disclaimer {
  font-size: 0.68rem;
  color: var(--subtle);
}

.form-submit-error {
  font-size: 0.75rem;
  color: #c0392b;
  margin-top: 0.4rem;
}
```

- [ ] **Step 5: Add decorative card styles**

Append to `css/main.css`:

```css
/* ---------- Hero card ---------- */
.hero-card-wrap {
  display: none; /* hidden on mobile */
  position: relative;
  align-items: center;
  justify-content: center;
  min-height: 220px;
}

@media (min-width: 900px) {
  .hero-card-wrap { display: flex; }
}

.hero-card-circle {
  position: absolute;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: var(--pill-bg);
  top: 0;
  right: 0;
  pointer-events: none;
}

.hero-card {
  position: relative;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1.2rem;
  width: 210px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.07);
}

.hero-card-event-label {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--terracotta);
  margin-bottom: 0.6rem;
}

.hero-card-count {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.8rem;
  color: var(--ink);
  font-style: italic;
  margin-bottom: 0.8rem;
}

.hero-card-rows {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.8rem;
}

.hero-card-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 0.68rem;
  color: var(--muted);
}

.hero-card-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-green      { background: #4a7c59; }
.dot-amber      { background: #c8a97a; }
.dot-terracotta { background: var(--terracotta); }

.hero-card-row--attending { color: #4a7c59; }

.hero-card-footer {
  border-top: 1px solid var(--border);
  padding-top: 0.6rem;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 0.65rem;
  color: var(--terracotta);
}
```

- [ ] **Step 6: Add pillars section styles**

Append to `css/main.css`:

```css
/* ---------- Pillars ---------- */
.pillars {
  max-width: var(--max-w);
  margin: 1rem auto 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  border-top: 1px solid var(--border);
}

@media (min-width: 900px) {
  .pillars { grid-template-columns: repeat(5, 1fr); }
}

.pillar {
  text-align: center;
  padding: 1.5rem 1rem;
}

/* Border-left on columns 2+ (desktop) */
@media (min-width: 900px) {
  .pillar + .pillar { border-left: 1px solid var(--border); }
}

/* On mobile 2-col: border-left on even columns, border-top on rows 2+ */
@media (max-width: 899px) {
  .pillar:nth-child(2n) { border-left: 1px solid var(--border); }
  .pillar:nth-child(n+3) { border-top: 1px solid var(--border); }
  /* Centre last item if odd count */
  .pillar:last-child:nth-child(odd) {
    grid-column: 1 / -1;
    border-left: none;
  }
}

.pillar svg { margin-bottom: 0.6rem; }

.pillar-label {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink);
  margin-bottom: 0.35rem;
}

.pillar-desc {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 0.65rem;
  color: var(--muted);
  line-height: 1.5;
}
```

- [ ] **Step 7: Add footer styles**

Append to `css/main.css`:

```css
/* ---------- Footer ---------- */
.site-footer {
  border-top: 1px solid var(--border);
  padding: 1.2rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.footer-copy,
.footer-links {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 0.65rem;
  color: var(--subtle);
}

.footer-links a {
  color: var(--subtle);
  text-decoration: none;
}

.footer-links a:hover { text-decoration: underline; }
.footer-links a:focus {
  outline: 2px solid var(--terracotta);
  outline-offset: 2px;
}
```

- [ ] **Step 8: Add utility and accessibility styles**

Append to `css/main.css`:

```css
/* ---------- Utilities ---------- */
[hidden] { display: none !important; }

/* Visually hidden (for screen readers only) */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 9: Commit**

```bash
git add static-web/css/main.css
git commit -m "style: rewrite css with warm minimal design tokens and layout"
```

---

## Task 2: index.html markup

**Files:**
- Rewrite: `static-web/index.html`

Reference the approved mockup at `.superpowers/brainstorm/2648384-1774179608/layout-v3.html` for exact SVG paths and copy.

- [ ] **Step 1: Replace the full contents of index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RSVPex — RSVP Management Coming Soon</title>
  <meta name="description" content="Beautiful RSVP management for events that matter. Dietary restrictions, gift registries, and guest lists — self-hosted and private.">
  <link rel="canonical" href="https://rsvpex.com">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="RSVPex — RSVP Management Coming Soon">
  <meta property="og:description" content="Beautiful RSVP management for events that matter. Self-hosted and private.">
  <meta property="og:url" content="https://rsvpex.com">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="RSVPex — RSVP Management Coming Soon">
  <meta name="twitter:description" content="Beautiful RSVP management for events that matter. Self-hosted and private.">

  <!-- Theme -->
  <meta name="theme-color" content="#b5895a">

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="/images/favicon/favicon.svg">
  <link rel="icon" type="image/x-icon" href="/images/favicon/favicon.ico">

  <!-- Styles -->
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>

  <!-- NAV -->
  <header>
    <nav class="site-nav" aria-label="Site navigation">
      <a href="/" class="nav-wordmark" aria-label="RSVPex home">RSVP<span>EX</span></a>
      <span class="nav-pill" aria-label="Coming soon">Coming Soon</span>
    </nav>
  </header>

  <main>
    <!-- HERO -->
    <section class="hero" aria-labelledby="hero-headline">

      <!-- Left: text + form -->
      <div class="hero-content">
        <p class="hero-eyebrow">Event RSVP Management</p>
        <h1 class="hero-headline" id="hero-headline">
          Every guest.<br>
          <em>Every detail.</em><br>
          Perfectly tracked.
        </h1>
        <div class="hero-rule" role="presentation"></div>
        <p class="hero-subheadline">
          Beautiful RSVP management for events that matter — dietary restrictions,
          gift registries, and guest lists, all in one place. Self-hosted and private.
        </p>

        <form
          action="https://api.web3forms.com/submit"
          method="POST"
          class="waitlist-form"
          id="waitlist-form"
          novalidate
        >
          <!-- Web3Forms config — access_key injected at deploy time -->
          <input type="hidden" name="access_key" value="{{WEB3FORMS_ACCESS_KEY}}">
          <input type="hidden" name="redirect" value="/thank-you.html">
          <input type="hidden" name="subject" value="New Waitlist Sign-up">

          <!-- Honeypot -->
          <input type="checkbox" name="botcheck" style="display:none" tabindex="-1" aria-hidden="true">

          <div class="form-row">
            <div class="form-field">
              <label for="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="your@email.com"
                required
                aria-required="true"
                aria-describedby="email-error"
                autocomplete="email"
              >
              <span class="field-error" id="email-error" role="alert" hidden></span>
            </div>

            <div class="form-field">
              <label for="name">Name <span class="sr-only">(optional)</span><span aria-hidden="true"> (Optional)</span></label>
              <input
                type="text"
                id="name"
                name="name"
                placeholder="Your name"
                maxlength="100"
                aria-describedby="name-error"
                autocomplete="name"
              >
              <span class="field-error" id="name-error" role="alert" hidden></span>
            </div>

            <button type="submit" class="btn-submit" id="submit-btn">
              Join Waitlist
            </button>
          </div>

          <span class="form-submit-error" id="form-error" role="alert" hidden></span>
        </form>

        <p class="form-disclaimer">No spam. Unsubscribe any time.</p>
      </div>

      <!-- Right: decorative RSVP card (hidden on mobile) -->
      <div class="hero-card-wrap" aria-hidden="true">
        <div class="hero-card-circle"></div>
        <div class="hero-card" role="presentation">
          <p class="hero-card-event-label">Summer Garden Party</p>
          <p class="hero-card-count">42 guests confirmed</p>
          <div class="hero-card-rows">
            <div class="hero-card-row hero-card-row--attending">
              <span class="hero-card-dot dot-green"></span>
              Sarah &amp; Tom — Attending (2)
            </div>
            <div class="hero-card-row">
              <span class="hero-card-dot dot-amber"></span>
              Dietary: <em>gluten-free (1)</em>
            </div>
            <div class="hero-card-row">
              <span class="hero-card-dot dot-terracotta"></span>
              Gift registry linked
            </div>
          </div>
          <p class="hero-card-footer">View full guest list →</p>
        </div>
      </div>

    </section>

    <!-- PILLARS -->
    <section class="pillars" aria-label="Features">

      <!-- 1: Beautiful Invites -->
      <div class="pillar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b5895a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <polyline points="2,4 12,13 22,4"/>
        </svg>
        <p class="pillar-label">Beautiful Invites</p>
        <p class="pillar-desc">Custom RSVP pages guests enjoy filling out</p>
      </div>

      <!-- 2: Live Tracking -->
      <div class="pillar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b5895a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
        </svg>
        <p class="pillar-label">Live Tracking</p>
        <p class="pillar-desc">Responses arrive in real time</p>
      </div>

      <!-- 3: Dietary Needs -->
      <div class="pillar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b5895a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M12 2a10 10 0 0 1 0 20"/>
          <path d="M12 2a10 10 0 0 0 0 20"/>
          <path d="M2 12h20"/>
          <path d="M12 2c-2.5 3-4 6-4 10s1.5 7 4 10"/>
          <path d="M12 2c2.5 3 4 6 4 10s-1.5 7-4 10"/>
        </svg>
        <p class="pillar-label">Dietary Needs</p>
        <p class="pillar-desc">Collect restrictions per guest, export for catering</p>
      </div>

      <!-- 4: Gift Registry -->
      <div class="pillar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b5895a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <polyline points="20 12 20 22 4 22 4 12"/>
          <rect x="2" y="7" width="20" height="5"/>
          <line x1="12" y1="22" x2="12" y2="7"/>
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
        </svg>
        <p class="pillar-label">Gift Registry</p>
        <p class="pillar-desc">Link your registry — shown after guests confirm</p>
      </div>

      <!-- 5: Your Data, Private -->
      <div class="pillar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b5895a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <p class="pillar-label">Your Data, Private</p>
        <p class="pillar-desc">Self-hosted. No third-party storage.</p>
      </div>

    </section>
  </main>

  <!-- FOOTER -->
  <footer class="site-footer">
    <p class="footer-copy">© 2026 RSVPex</p>
    <p class="footer-links">
      <a href="mailto:hello@rsvpex.com">hello@rsvpex.com</a>
      &nbsp;·&nbsp;
      <a href="/privacy.html">Privacy</a>
    </p>
  </footer>

  <script src="/js/main.js" defer></script>
</body>
</html>
```

- [ ] **Step 2: Verify the placeholder is present**

Run:
```bash
grep -c '{{WEB3FORMS_ACCESS_KEY}}' static-web/index.html
```
Expected output: `1`

- [ ] **Step 3: Commit**

```bash
git add static-web/index.html
git commit -m "feat: rewrite index.html with warm minimal design"
```

---

## Task 3: Form JS

**Files:**
- Rewrite: `static-web/js/main.js`

- [ ] **Step 1: Replace main.js with form handler**

```js
'use strict';

(function () {
  const form = document.getElementById('waitlist-form');
  if (!form) return;

  const emailInput = document.getElementById('email');
  const nameInput  = document.getElementById('name');
  const submitBtn  = document.getElementById('submit-btn');
  const emailError = document.getElementById('email-error');
  const nameError  = document.getElementById('name-error');
  const formError  = document.getElementById('form-error');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setError(input, errorEl, message) {
    input.setAttribute('aria-invalid', 'true');
    errorEl.textContent = message;
    errorEl.removeAttribute('hidden');
  }

  function clearError(input, errorEl) {
    input.removeAttribute('aria-invalid');
    errorEl.textContent = '';
    errorEl.setAttribute('hidden', '');
  }

  function validate() {
    let valid = true;

    const email = emailInput.value.trim();
    if (!email) {
      setError(emailInput, emailError, 'Email address is required.');
      valid = false;
    } else if (!EMAIL_RE.test(email)) {
      setError(emailInput, emailError, 'Please enter a valid email address.');
      valid = false;
    } else {
      clearError(emailInput, emailError);
    }

    const name = nameInput.value.trim();
    if (name && name.length < 2) {
      setError(nameInput, nameError, 'Name must be at least 2 characters.');
      valid = false;
    } else {
      clearError(nameInput, nameError);
    }

    return valid;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    formError.setAttribute('hidden', '');

    if (!validate()) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      const data = new FormData(form);
      const res  = await fetch(form.action, { method: 'POST', body: data });

      if (res.ok) {
        window.location.href = '/thank-you.html';
      } else {
        throw new Error('Server error ' + res.status);
      }
    } catch (err) {
      formError.textContent = 'Something went wrong. Please try again.';
      formError.removeAttribute('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Join Waitlist';
    }
  });
}());
```

- [ ] **Step 2: Commit**

```bash
git add static-web/js/main.js
git commit -m "feat: rewrite form handler with validation and submit UX"
```

---

## Task 4: Thank-you page

**Files:**
- Rewrite: `static-web/thank-you.html`

- [ ] **Step 1: Replace thank-you.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're on the list — RSVPex</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/svg+xml" href="/images/favicon/favicon.svg">
  <link rel="stylesheet" href="/css/main.css">
  <style>
    .thankyou-wrap {
      max-width: 480px;
      margin: 6rem auto;
      padding: 0 2rem;
    }
  </style>
</head>
<body>

  <header>
    <nav class="site-nav" aria-label="Site navigation">
      <a href="/" class="nav-wordmark" aria-label="RSVPex home">RSVP<span>EX</span></a>
      <span class="nav-pill" aria-label="Coming soon">Coming Soon</span>
    </nav>
  </header>

  <main>
    <div class="thankyou-wrap">
      <p class="hero-eyebrow">Waitlist</p>
      <h1 class="hero-headline">You're on the list.</h1>
      <div class="hero-rule" role="presentation"></div>
      <p class="hero-subheadline">
        Thanks for joining! We'll be in touch when RSVPex launches.
      </p>
      <a href="/" style="font-size:0.85rem; color:#b5895a; text-decoration:none;">← Back to home</a>
    </div>
  </main>

  <footer class="site-footer">
    <p class="footer-copy">© 2026 RSVPex</p>
    <p class="footer-links">
      <a href="mailto:hello@rsvpex.com">hello@rsvpex.com</a>
      &nbsp;·&nbsp;
      <a href="/privacy.html">Privacy</a>
    </p>
  </footer>

</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add static-web/thank-you.html
git commit -m "feat: rewrite thank-you page with warm minimal style"
```

---

## Task 5: .env.sample

**Files:**
- Update: `static-web/.env.sample`

- [ ] **Step 1: Update .env.sample**

Replace (or create) `static-web/.env.sample` with:

```
# Web3Forms access key — get yours at https://web3forms.com
# This value is injected into index.html at deploy time by GitHub Actions.
# Never commit the real value.
WEB3FORMS_ACCESS_KEY=your_web3forms_access_key_here
```

- [ ] **Step 2: Commit**

```bash
git add static-web/.env.sample
git commit -m "docs: document WEB3FORMS_ACCESS_KEY in .env.sample"
```

---

## Task 6: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Write the workflow file**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Wrangler
        run: npm install -g wrangler

      - name: Inject Web3Forms key
        run: |
          sed -i "s/{{WEB3FORMS_ACCESS_KEY}}/${{ secrets.WEB3FORMS_ACCESS_KEY }}/g" static-web/index.html

      - name: Deploy (Production — push to main)
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        run: wrangler pages deploy static-web --project-name=rsvpex-landing --branch=main
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      - name: Deploy (PR Preview)
        if: github.event_name == 'pull_request'
        run: wrangler pages deploy static-web --project-name=rsvpex-landing --branch=pr-${{ github.event.pull_request.number }}
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      - name: Comment PR with preview URL
        if: github.event_name == 'pull_request'
        uses: peter-evans/create-or-update-comment@v4
        with:
          issue-number: ${{ github.event.pull_request.number }}
          body: |
            **Preview deployed:**
            https://pr-${{ github.event.pull_request.number }}.rsvpex-landing.pages.dev

            This preview updates automatically on each push to this PR.
```

- [ ] **Step 3: Verify the sed injection step uses correct placeholder**

The `sed` command substitutes `{{WEB3FORMS_ACCESS_KEY}}` in `static-web/index.html`. Cross-check that `index.html` (from Task 2) contains that exact string — not a different placeholder format.

```bash
grep '{{WEB3FORMS_ACCESS_KEY}}' static-web/index.html
```
Expected: one match on the hidden `access_key` input line.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add GitHub Actions workflow for Cloudflare Pages deploy"
```

---

## Task 7: End-to-end smoke test (manual)

No automated test runner exists for a static site. These are manual verification steps.

- [ ] **Step 1: Local browser check — visual**

Open `static-web/index.html` directly in a browser (file:// or a local server via `python3 -m http.server 8080 --directory static-web`).

Verify:
- Background is cream (`#f7f4ef`), not white
- Wordmark shows `RSVP` in black, `EX` in terracotta
- "Coming Soon" pill appears top-right
- Hero headline is serif, italic on "Every detail."
- Terracotta divider rule appears below headline
- RSVP card visible on desktop width (≥900px), hidden on narrow viewport
- Five pillars display in a row at desktop, 2-column grid on mobile
- Footer shows copyright left, email and privacy link right

- [ ] **Step 2: Local browser check — form validation**

Submit the form with an empty email field. Verify:
- Error message appears below email input
- Page does not navigate away

Submit with invalid email (e.g. `notanemail`). Verify:
- Error message appears: "Please enter a valid email address."

Submit with a 1-character name (e.g. `A`). Verify:
- Error appears below name field

Submit with valid email only. Verify:
- Button shows "Sending…" and is disabled (briefly, until response or error)

- [ ] **Step 3: Check placeholder is NOT in source before deploy**

```bash
grep 'WEB3FORMS_ACCESS_KEY' static-web/index.html
```

Expected: one match showing `{{WEB3FORMS_ACCESS_KEY}}` (the placeholder, not a real key). If a real key is found, stop — the key was hardcoded and must be removed.

- [ ] **Step 4: Verify GitHub secrets are configured**

In the GitHub repo (`andr-ca/rsvpex`), confirm these three secrets exist under Settings → Secrets and Variables → Actions:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `WEB3FORMS_ACCESS_KEY`

If any are missing, add them before pushing. The workflow will silently inject an empty string for missing secrets, breaking the form.

- [ ] **Step 5: Push to a branch and open a PR**

```bash
git checkout -b feat/landing-redesign
git push origin feat/landing-redesign
```

Open a PR against `main` on GitHub. Verify:
- GitHub Actions workflow starts
- Deploy step completes without error
- Bot comment appears on the PR with preview URL `https://pr-<N>.rsvpex-landing.pages.dev`
- Preview URL loads the redesigned page with working styles

- [ ] **Step 6: Merge to main and verify production**

After PR is approved and merged, verify the production deploy job runs and `https://rsvpex.com` (or the Cloudflare Pages production URL) shows the new design.

---

## Required GitHub Secrets

Before running the workflow, configure these in the repo (Settings → Secrets → Actions):

| Secret | Where to get it |
|--------|----------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token (Pages:Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar on any zone page |
| `WEB3FORMS_ACCESS_KEY` | The existing key `123b2260-0578-4fc4-8f03-6b9f4134d327` (currently hardcoded in old index.html) |

The `CLOUDFLARE_ACCOUNT_ID` is new — the existing Gitea workflow did not use it. Wrangler requires it when authenticating with a scoped API token.
