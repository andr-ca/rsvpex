# Quickstart: RSVPex Landing Page Setup & Development

**Version**: 1.0.0
**Date**: 2025-10-25
**Purpose**: Step-by-step guide to set up development environment, build the landing page, and deploy to Cloudflare Pages

---

## Prerequisites

Before starting, ensure you have:

- **Code editor**: VS Code, Sublime Text, or similar
- **Git**: Installed and configured
- **GitHub account**: For repository hosting
- **Browser**: Chrome, Firefox, Safari, or Edge (for testing)
- **Accounts to create** (all free):
  - Web3Forms: https://web3forms.com
  - Cloudflare Pages: https://pages.cloudflare.com
  - Mailchimp: https://mailchimp.com (for beta launch emails)
  - Cloudflare Analytics: https://cloudflare.com (optional)

---

## Project Setup (5 minutes)

### 1. Clone Repository
```bash
git clone <repository-url>
cd static-web
git checkout 001-landing-page  # Feature branch
```

### 2. Project Structure
```
static-web/
├── index.html              # Main landing page (TO CREATE)
├── thank-you.html          # Success page (TO CREATE)
├── css/
│   ├── main.css           # Primary styles (TO CREATE)
│   └── critical.css       # Above-the-fold CSS (TO CREATE)
├── js/
│   └── main.js            # Form validation & enhancements (TO CREATE)
├── images/
│   ├── hero/              # Hero SVG illustration (TO CREATE)
│   ├── icons/             # Benefit icons (TO CREATE)
│   └── favicon/           # Icons and favicon (TO CREATE)
├── .env.sample            # Environment template (EDIT)
├── .env                   # Local environment (CREATE FROM SAMPLE)
├── robots.txt             # SEO (TO CREATE)
├── sitemap.xml            # SEO sitemap (TO CREATE)
├── README.md              # Project documentation (EDIT)
└── specs/                 # Feature specification & plan (REFERENCE ONLY)
    └── 001-landing-page/
        ├── spec.md
        ├── plan.md
        ├── research.md
        ├── data-model.md
        ├── contracts/
        │   ├── form-contract.md
        │   └── meta-tags-contract.md
        └── quickstart.md (this file)
```

### 3. Environment Setup

Create `.env` file from `.env.sample`:

```bash
cp .env.sample .env
```

Edit `.env` and fill in values:

```env
# Web3Forms Configuration
WEB3FORMS_ACCESS_KEY=abc123xyz789  # Get from https://web3forms.com

# Cloudflare Analytics (optional)
CLOUDFLARE_TOKEN=your_token_here

# Domain Configuration
DOMAIN=rsvpex.com
SITE_URL=https://rsvpex.com

# Contact Information
CONTACT_EMAIL=hello@rsvpex.com
```

**How to get keys**:

**Web3Forms**:
1. Go to https://web3forms.com
2. Sign up (free)
3. Copy "Access Key" from dashboard
4. Paste in `.env` as `WEB3FORMS_ACCESS_KEY`

**Cloudflare Analytics** (optional):
1. Add domain to Cloudflare (free tier)
2. Go to Analytics → Web Analytics
3. Copy token from script
4. Paste in `.env` as `CLOUDFLARE_TOKEN`

---

## Content Gathering (Required Before Coding)

Collect from marketing team:

- [ ] Headline (60 chars max) - *Example: "RSVP Management, Coming Soon"*
- [ ] Subheadline (120 chars max) - *Example: "Simple event RSVP management..."*
- [ ] 4-5 benefit titles & descriptions (50 chars + 100 words each)
- [ ] Footer contact email
- [ ] Social media links (if any)
- [ ] OG preview image (1200x630px, <500KB)
- [ ] Twitter preview image (1200x675px, <500KB)

**REFERENCE**: See [data-model.md](data-model.md) for content structure

---

## Development Steps (2-3 hours)

### Step 1: Create HTML Structure (30 minutes)

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RSVPex - RSVP Management Coming Soon</title>
  <meta name="description" content="Simple event RSVP management is coming soon. Join our waitlist for early access.">
  <link rel="canonical" href="https://rsvpex.com">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="RSVPex - RSVP Management Coming Soon">
  <meta property="og:description" content="Simple event RSVP management is coming soon.">
  <meta property="og:image" content="https://rsvpex.com/images/og-preview.png">
  <meta property="og:url" content="https://rsvpex.com">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="RSVPex - RSVP Management Coming Soon">
  <meta name="twitter:description" content="Simple event RSVP management is coming soon.">
  <meta name="twitter:image" content="https://rsvpex.com/images/twitter-preview.png">
  <meta name="twitter:site" content="@rsvpex">

  <!-- Theme -->
  <meta name="theme-color" content="#FF6B6B">

  <!-- Favicon -->
  <link rel="icon" href="/images/favicon/favicon.ico">
  <link rel="apple-touch-icon" href="/images/favicon/apple-touch-icon.png">

  <!-- Styles (critical CSS inlined, main CSS deferred) -->
  <style>
    /* Inlined critical CSS - see critical.css for template */
  </style>
  <link rel="stylesheet" href="/css/main.css">

  <!-- Analytics (Cloudflare - cookie-free) -->
  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "YOUR_TOKEN"}'></script>

  <!-- Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "RSVPex",
    "description": "Event RSVP management coming soon",
    "applicationCategory": "BusinessApplication",
    "url": "https://rsvpex.com"
  }
  </script>
</head>
<body>
  <header class="header">
    <div class="container">
      <div class="logo">RSVPex</div>
    </div>
  </header>

  <main>
    <!-- Hero Section -->
    <section class="hero">
      <div class="container">
        <div class="hero-content">
          <h1>RSVP Management, Coming Soon</h1>
          <p class="hero-subheadline">Simple event RSVP management is coming soon...</p>

          <!-- Email Signup Form -->
          <form action="https://api.web3forms.com/submit" method="POST" class="signup-form" id="waitlist-form">
            <input type="hidden" name="access_key" value="">
            <input type="hidden" name="redirect" value="/thank-you.html">
            <input type="hidden" name="subject" value="New Beta Sign-up">

            <div class="form-group">
              <label for="email">Email Address</label>
              <input type="email" id="email" name="email" placeholder="your@email.com" required>
              <span class="error" id="email-error" role="alert" hidden></span>
            </div>

            <div class="form-group">
              <label for="name">Name (Optional)</label>
              <input type="text" id="name" name="name" placeholder="Your name" maxlength="100">
            </div>

            <div class="form-group checkbox">
              <label>
                <input type="checkbox" name="subscribe_newsletter" value="yes">
                Keep me updated about the beta launch
              </label>
            </div>

            <input type="checkbox" name="botcheck" style="display: none;">

            <button type="submit" class="btn btn-primary">Join the Waitlist</button>
          </form>
        </div>

        <!-- Hero Illustration (SVG) -->
        <div class="hero-visual">
          <svg class="hero-illustration" viewBox="0 0 200 200" role="img" aria-labelledby="hero-title">
            <title id="hero-title">People celebrating an event</title>
            <!-- SVG content here -->
          </svg>
        </div>
      </div>
    </section>

    <!-- Benefits Section -->
    <section class="benefits">
      <div class="container">
        <h2>Why RSVPex?</h2>

        <div class="benefits-grid">
          <!-- Benefit Card 1 -->
          <div class="benefit-card">
            <svg class="benefit-icon" viewBox="0 0 24 24" aria-hidden="true">
              <!-- Icon SVG -->
            </svg>
            <h3>Easy Guest Tracking</h3>
            <p>Know exactly who's coming, who's maybe, and who hasn't responded yet...</p>
          </div>

          <!-- Add 3-5 total benefit cards following same pattern -->
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="container">
        <p>Questions? <a href="mailto:hello@rsvpex.com">Get in touch</a></p>
        <div class="social-links">
          <a href="https://twitter.com/rsvpex">Twitter</a>
          <a href="https://linkedin.com/company/rsvpex">LinkedIn</a>
        </div>
        <div class="legal">
          <a href="/privacy.html">Privacy Policy</a>
        </div>
        <p class="copyright">© 2025 RSVPex. All rights reserved.</p>
      </div>
    </footer>
  </main>

  <!-- Form handling & enhancements -->
  <script src="/js/main.js"></script>
</body>
</html>
```

**REFERENCE**: Full HTML requirements in [data-model.md](data-model.md) and [form-contract.md](contracts/form-contract.md)

### Step 2: Create CSS (45 minutes)

Create `css/main.css` - mobile-first responsive stylesheet:

**Key principles**:
- Mobile-first base styles (no media queries for 320px+)
- Media queries for larger screens (`@media (min-width: ...`)
- CSS custom properties for colors, spacing
- Inline critical CSS in `<head>` for performance
- No unnecessary animations

**Basic structure**:
```css
/* Variables */
:root {
  --color-primary: #FF6B6B;
  --color-text: #1a1a1a;
  --color-bg: #ffffff;
  --spacing: 1rem;
  --max-width: 1200px;
}

/* Reset */
* { margin: 0; padding: 0; box-sizing: border-box; }

/* Base styles */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg);
}

.container { max-width: var(--max-width); margin: 0 auto; padding: 0 1rem; }

/* Hero section */
.hero { padding: 4rem 0; text-align: center; }
.hero h1 { font-size: 2rem; margin-bottom: 1rem; line-height: 1.2; }
.hero p { font-size: 1.125rem; margin-bottom: 2rem; }

/* Form styles */
.signup-form { max-width: 400px; margin: 0 auto; }
.form-group { margin-bottom: 1rem; text-align: left; }
.form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
input[type="email"], input[type="text"] {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}
input:focus { outline: 2px solid var(--color-primary); }
.btn { padding: 0.75rem 1.5rem; font-size: 1rem; border: none; cursor: pointer; }
.btn-primary { background: var(--color-primary); color: white; border-radius: 4px; }

/* Benefits grid */
.benefits-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; }
@media (min-width: 600px) { .benefits-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 900px) { .benefits-grid { grid-template-columns: repeat(3, 1fr); } }

.benefit-card { padding: 1.5rem; }
.benefit-icon { width: 48px; height: 48px; margin-bottom: 1rem; }

/* Footer */
.footer { background: #f5f5f5; padding: 2rem 0; margin-top: 4rem; text-align: center; }
.footer a { color: var(--color-primary); text-decoration: none; }
```

**PERFORMANCE CHECKLIST**:
- [ ] No render-blocking resources
- [ ] Critical CSS inlined (<14KB)
- [ ] Main CSS deferred
- [ ] Focus styles visible
- [ ] Mobile touch targets ≥44px

### Step 3: Create JavaScript (30 minutes)

Create `js/main.js` - form validation and progressive enhancements:

```javascript
'use strict';

// Form validation
const form = document.getElementById('waitlist-form');
const emailInput = document.getElementById('email');
const emailError = document.getElementById('email-error');

if (form) {
  emailInput.addEventListener('blur', validateEmail);
  form.addEventListener('submit', handleSubmit);
}

function validateEmail() {
  const email = emailInput.value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email) {
    showError(emailInput, emailError, 'Email is required');
    return false;
  }

  if (!emailRegex.test(email)) {
    showError(emailInput, emailError, 'Please enter a valid email address');
    return false;
  }

  clearError(emailInput, emailError);
  return true;
}

function handleSubmit(e) {
  if (!validateEmail()) {
    e.preventDefault();
    return false;
  }
  // Allow form to submit to Web3Forms
}

function showError(input, errorEl, message) {
  input.classList.add('input--error');
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError(input, errorEl) {
  input.classList.remove('input--error');
  errorEl.hidden = true;
}

// Analytics: Track form submission (optional)
// plausible('Signup', {props: {method: 'email-form'}});
```

**Requirements**:
- [ ] Works without JavaScript (form submits via HTML)
- [ ] ES6+ syntax (no transpilation)
- [ ] No uncaught errors
- [ ] File size <10KB

### Step 4: Add SVG Assets (30 minutes)

#### Hero Illustration:
1. Go to https://undraw.co
2. Search: "events" or "celebration"
3. Customize color to brand color
4. Download as SVG
5. Optimize: https://jakearchibald.github.io/svgomg/
6. Save to `images/hero/event-celebration.svg`
7. Inline in HTML (hero section)

#### Benefit Icons:
1. Go to https://heroicons.com
2. Download 4-5 icons (calendar, users, bell, check, etc.)
3. Optimize each with SVGOMG
4. Save to `images/icons/`
5. Inline in HTML (benefit cards)

#### Favicon:
1. Create simple favicon (text or mark)
2. Generate: https://realfavicongenerator.net
3. Download: favicon.ico, favicon-32x32.png, apple-touch-icon.png
4. Save to `images/favicon/`
5. Reference in HTML

**File size targets**:
- Hero SVG: <30KB
- Each icon: <5KB
- Total: <50KB

### Step 5: Create Success Page (10 minutes)

Create `thank-you.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thanks for Joining! - RSVPex</title>
  <meta name="description" content="Thank you for joining the RSVPex beta waitlist.">
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>
  <header class="header">
    <div class="container">
      <div class="logo">RSVPex</div>
    </div>
  </header>

  <main class="thank-you">
    <div class="container">
      <h1>Thank you for joining the waitlist! 🎉</h1>
      <p>We'll notify you as soon as RSVPex launches.</p>
      <p>In the meantime, keep an eye on your email for updates and early access opportunities.</p>
      <a href="/" class="btn btn-primary">← Back to home</a>
    </div>
  </main>

  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "YOUR_TOKEN"}'></script>
</body>
</html>
```

### Step 6: Create SEO Files (10 minutes)

Create `robots.txt`:
```
User-agent: *
Allow: /

Sitemap: https://rsvpex.com/sitemap.xml
```

Create `sitemap.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://rsvpex.com</loc>
    <lastmod>2025-10-25</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://rsvpex.com/thank-you.html</loc>
    <lastmod>2025-10-25</lastmod>
    <priority>0.5</priority>
  </url>
</urlset>
```

---

## Testing (30 minutes)

### Performance
```bash
# Open DevTools (F12) → Lighthouse tab
# Run audit → Target ≥90 all categories
```

### Functional
- [ ] Form submits and redirects to thank-you
- [ ] Email validation catches invalid emails
- [ ] Emails arrive in inbox
- [ ] Form works without JavaScript
- [ ] No console errors

### Cross-Browser
- [ ] Chrome, Firefox, Safari, Edge (desktop)
- [ ] iOS Safari (iPhone 12)
- [ ] Android Chrome

### Accessibility
- [ ] Tab through form fields
- [ ] Test with screen reader
- [ ] 4.5:1 color contrast
- [ ] All images have alt text

### SEO
- [ ] Meta tags present
- [ ] Open Graph preview correct
- [ ] Twitter Card correct
- [ ] No HTML errors

---

## Deployment to Cloudflare Pages

### Step 1: Push to GitHub

```bash
git add .
git commit -m "feat: build landing page with email signup form"
git push origin 001-landing-page
```

### Step 2: Connect to Cloudflare Pages

1. Go to https://dash.cloudflare.com
2. Select your domain (or add new domain)
3. Go to **Pages** → Create project
4. Connect GitHub → Select your repository
5. Configure build:
   - **Production branch**: `001-landing-page` (or `main` if merging)
   - **Build command**: (leave empty - no build needed)
   - **Build output directory**: `/` (root, where index.html is)
   - **Environment variables**: (see Step 3)
6. Click "Save and Deploy"

### Step 3: Set Environment Variables

In Cloudflare Pages project settings → Environment:

```
WEB3FORMS_ACCESS_KEY=abc123xyz789
CLOUDFLARE_TOKEN=your_token
```

**Note**: These are optional - you can also hardcode them in HTML since they're not secrets.

### Step 4: Add Custom Domain (Optional)

1. Pages project → Custom domain
2. Add your domain (e.g., rsvpex.com)
3. Update DNS records as instructed
4. HTTPS automatic

### Step 5: Verify Deployment

1. Visit https://rsvpex.com (or Cloudflare-provided URL)
2. Verify Lighthouse score ≥90
3. Test form submission
4. Check console for errors

---

## Email Collection Workflow

### Setup Mailchimp (One-time, 5 minutes)

1. Sign up: https://mailchimp.com (free tier: 500 contacts)
2. Create audience: "RSVPex Beta Waitlist"
3. Copy audience ID (from Settings)

### Weekly Email Collection

**Every week or at 50+ signups**:

1. Check Web3Forms inbox for submissions
2. View emails from `noreply@web3forms.com`
3. Select all → Download as CSV (Gmail)
4. Go to Mailchimp → Audience → Import
5. Upload CSV
6. Map email field
7. Enable "Update if exists" (prevents duplicates)
8. Import

### At Beta Launch

1. Mailchimp → Create Campaign
2. Select audience: "RSVPex Beta Waitlist"
3. Write launch announcement
4. Send
5. Track opens/clicks

---

## Post-Deployment Checklist

- [ ] Domain resolves, HTTPS works
- [ ] Lighthouse ≥90 in production
- [ ] Form submissions still arrive
- [ ] Thank-you page loads
- [ ] Social preview works (test sharing)
- [ ] Analytics showing traffic
- [ ] Mailchimp set up and ready for imports

---

## Maintenance

### Weekly
- [ ] Check Web3Forms inbox
- [ ] Export to Mailchimp if >50 signups

### Monthly
- [ ] Run new Lighthouse audit
- [ ] Check for broken links
- [ ] Review analytics (Cloudflare dashboard)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Form doesn't submit | Check access key in env, verify Web3Forms action URL |
| Email not in inbox | Check spam folder, verify submit button was clicked |
| Page slow (Lighthouse <90) | Compress images, optimize SVGs, check file sizes |
| Mobile form broken | Verify viewport meta tag, test on real device |
| Domain not resolving | Check Cloudflare DNS records, wait 24-48 hours |

---

## Resources

**Design/SVG**:
- Icons: https://heroicons.com
- Illustrations: https://undraw.co
- SVG Optimization: https://jakearchibald.github.io/svgomg/

**Hosting**:
- Cloudflare Pages: https://pages.cloudflare.com (recommended)
- Deploy from GitHub, auto-deploys on push

**Forms**:
- Web3Forms: https://web3forms.com

**Email**:
- Mailchimp: https://mailchimp.com (free tier: 500 contacts)

**Tools**:
- Lighthouse: DevTools → Lighthouse
- HTML Validator: https://validator.w3.org
- Meta Tester: https://og.tool
- Favicon: https://realfavicongenerator.net

---

## Success Metrics

Target by launch:
- ✅ Lighthouse: ≥90 (all categories)
- ✅ Email signup rate: >10% of visitors
- ✅ Load time: <2 seconds on 4G
- ✅ Mobile: Fully functional on 375px width
- ✅ Accessibility: WCAG 2.1 AA compliant

**Post-launch**:
- Track signups in Mailchimp
- Prepare beta product
- Send launch announcement
