# Content Data Model: RSVPex Landing Page

**Phase**: 1 (Design & Structure)
**Date**: 2025-10-25
**Purpose**: Define content structure, sections, and form schema for landing page

## Page Structure Overview

```
index.html
├── <header>
│   ├── Logo/Branding
│   └── Navigation (minimal, hero section CTA focus)
├── <main>
│   ├── Hero Section
│   │   ├── Headline
│   │   ├── Subheadline
│   │   ├── Email signup form
│   │   └── Hero illustration (SVG)
│   ├── Benefits/Features Section
│   │   ├── Section heading (h2)
│   │   ├── Benefit cards (4-5 items)
│   │   │   ├── Icon (SVG)
│   │   │   ├── Title
│   │   │   └── Description
│   │   └── Use case callout
│   ├── Social Proof Section (Optional)
│   │   ├── Testimonial/statistic
│   │   └── Trust indicator
│   └── Footer
│       ├── Contact email
│       ├── Social links (optional)
│       ├── Privacy/legal links
│       └── Copyright
└── <script> Analytics & form handling
```

---

## Content Sections

### 1. Header/Navigation

**Purpose**: Establish brand identity, minimal navigation

**Components**:
- **Logo**: RSVPex branding (text or small mark)
- **Navigation**: Optional nav menu or just logo (hero CTA is primary call-to-action)
- **Sticky behavior**: Optional - header may stick on scroll to keep CTA accessible

**Content**:
```
Logo: "RSVPex" or branded mark
Nav: (Optional minimal nav - most users will scroll naturally)
```

**Acceptance Criteria** (from spec):
- Logo/branding visible within 1 second
- Brand consistent with full product
- No horizontal scroll on mobile (375px)

---

### 2. Hero Section (Above the Fold)

**Purpose**: Capture attention, communicate value proposition, capture email within <2 seconds

**Components**:

#### 2.1 Hero Headline
- **Content type**: Text (headline)
- **Character limit**: ~60 characters (fits on mobile)
- **Message**: Announces coming soon + value proposition
- **Example**: "RSVP Management, Coming Soon"
- **Acceptance criteria**: Communicates "coming soon" + solves RSVP problem, readable in <2 seconds on 4G

#### 2.2 Hero Subheadline
- **Content type**: Text (subheadline)
- **Character limit**: ~120 characters
- **Message**: Elaborates on value, creates excitement
- **Example**: "Simple event RSVP management. Beautiful guest experiences. Coming to your events soon."

#### 2.3 Hero Illustration
- **Content type**: SVG image
- **Size**: ~25KB optimized (meets performance budget)
- **Purpose**: Visual interest, shows modern aesthetic
- **Accessibility**: `alt="People celebrating an event with RSVPing on their devices"` or similar

#### 2.4 Email Signup Form
- **Purpose**: Primary call-to-action for email capture
- **Position**: Prominent, above the fold (mobile: within first viewport)
- **Form fields**:

| Field | Type | Required | Validation | Max Length |
|-------|------|----------|-----------|-----------|
| Email | email input | Yes | HTML5 email validation | 254 chars |
| Name | text input | No (optional) | Text, no special chars | 100 chars |
| Subscribe checkbox | checkbox | No | -- | -- |

- **Example HTML**:
```html
<form action="https://api.web3forms.com/submit" method="POST" class="signup-form">
  <input type="hidden" name="access_key" value="WILL_BE_SET_IN_ENV">

  <div class="form-group">
    <label for="email">Email Address</label>
    <input
      type="email"
      id="email"
      name="email"
      placeholder="your@email.com"
      required
      aria-required="true">
    <span class="error" id="email-error" hidden></span>
  </div>

  <div class="form-group">
    <label for="name">Name (Optional)</label>
    <input
      type="text"
      id="name"
      name="name"
      placeholder="Your name"
      maxlength="100">
  </div>

  <div class="form-group checkbox">
    <label for="subscribe">
      <input
        type="checkbox"
        id="subscribe"
        name="subscribe_newsletter"
        value="yes">
      Keep me updated about the beta launch
    </label>
  </div>

  <!-- Honeypot spam protection (hidden) -->
  <input type="checkbox" name="botcheck" style="display: none;">

  <!-- Success redirect -->
  <input type="hidden" name="redirect" value="/thank-you.html">
  <input type="hidden" name="subject" value="New Beta Sign-up">

  <button type="submit" class="btn-primary">Join the Waitlist</button>
</form>
```

**Acceptance Criteria** (from spec):
- Form validates email format before submission (FR-004)
- Form displays success message after submit (FR-005)
- Form displays error message on failure (FR-006)
- Form is fully functional on 375px mobile width (US1 scenario 7)
- Form works without JavaScript (progressive enhancement, FR-016)

---

### 3. Benefits/Features Section

**Purpose**: Help visitors understand what RSVPex will enable them to do

**Structure**: 4-5 benefit cards in grid layout (1 col mobile, 2-3 col tablet, 3+ col desktop)

**Benefit Cards** (each card contains):

| Element | Type | Content | Max Length |
|---------|------|---------|-----------|
| Icon | SVG | Heroicon (calendar, users, bell, etc.) | 3-4KB per icon |
| Title | h3 heading | Benefit name | ~50 chars |
| Description | Paragraph | User value (not technical) | ~100 words |

**Example Benefit Card**:
```
Icon: Calendar/check icon (SVG)
Title: "Easy Guest Tracking"
Description: "Know exactly who's coming, who's maybe, and who hasn't responded yet.
             All in one beautiful dashboard that's easy to share with your co-host."
```

**Acceptance Criteria** (from spec):
- 3-5 key benefits displayed (FR-007)
- Benefits describe user value, not technical features (FR-008)
- Icons included with each benefit
- Responsive layout (1 col mobile, 2-3 col tablet/desktop)
- Mobile: benefits remain readable on 375px screen

**Content Topics** (suggested based on product):
1. Easy RSVP Management - Guest tracking, status overview
2. Beautiful Event Pages - Customizable, branded pages
3. Smart Invitations - Email invites, automated reminders
4. Data Export - CSV/JSON downloads, insights
5. Guest Details - Custom questions, preferences

---

### 4. Social Proof Section (Optional)

**Purpose**: Build trust and confidence before signup

**Options** (choose one based on what's available):

#### Option A: Testimonial Quote
```
"RSVPex made planning our wedding guest list so much easier.
 We knew exactly who was coming and could follow up easily."
— Sarah & John, Wedding Couple
```

#### Option B: Use Case Example
```
Used by: Wedding planners, Corporate event organizers, Birthday party hosts

Real example: "Our team used RSVPex for our 150-person company meeting.
              Setup took 10 minutes, and we had perfect attendance data."
```

#### Option C: Statistics
```
"10,000+ events managed" (once launched with real data)
or
"Join hundreds of event organizers planning their next event with RSVPex"
```

**Acceptance Criteria** (from spec):
- Trust indicator present (SC-011 business outcome)
- Not forced or inauthentic (avoid generic stock photos)
- Optional for MVP (P3 priority)

---

### 5. Footer

**Purpose**: Provide contact info, legal compliance, secondary navigation

**Components**:

| Element | Type | Required | Example |
|---------|------|----------|---------|
| Contact Email | Link | Yes | contact@rsvpex.com or founders email |
| Social Links | Links | No | Twitter, LinkedIn, etc. (if accounts exist) |
| Privacy Policy | Link | Yes (if collecting emails) | /privacy.html |
| Terms of Service | Link | Optional | /terms.html |
| Copyright | Text | Yes | © 2025 RSVPex. All rights reserved. |

**Example Footer HTML**:
```html
<footer class="footer">
  <div class="footer-content">
    <p>Questions? <a href="mailto:hello@rsvpex.com">Get in touch</a></p>
    <div class="social-links">
      <a href="https://twitter.com/rsvpex">Twitter</a>
      <a href="https://linkedin.com/company/rsvpex">LinkedIn</a>
    </div>
    <div class="legal">
      <a href="/privacy.html">Privacy Policy</a>
      <a href="/terms.html">Terms of Service</a>
    </div>
    <p class="copyright">© 2025 RSVPex. All rights reserved.</p>
  </div>
</footer>
```

**Acceptance Criteria** (from spec):
- Contact email address present (FR-014)
- Visible in footer area
- Links are keyboard accessible and properly marked

---

## Form Data Schema

### Email Signup Form Submission

**Form action**: `https://api.web3forms.com/submit`
**Method**: `POST`
**Content-Type**: `application/x-www-form-urlencoded` (standard form submission)

**Fields submitted to Web3Forms**:

| Field Name | Type | Required | Purpose | Validation |
|------------|------|----------|---------|-----------|
| `access_key` | hidden | Yes | Web3Forms API key | Configured in env |
| `email` | email | Yes | Subscriber email | HTML5 email validation |
| `name` | text | No | Subscriber name | Max 100 chars |
| `subscribe_newsletter` | hidden/checkbox | No | Newsletter preference | Checkbox value or N/A |
| `botcheck` | hidden checkbox | No | Spam protection (honeypot) | Must remain unchecked |
| `redirect` | hidden | Yes | Success page redirect | `/thank-you.html` |
| `subject` | hidden | Yes | Email subject in inbox | "New Beta Sign-up" |

**Example form submission data**:
```
access_key=abc123xyz789
&email=jane@example.com
&name=Jane Smith
&subscribe_newsletter=yes
&botcheck=
&redirect=https://rsvpex.com/thank-you.html
&subject=New Beta Sign-up
```

**Email received by owner** (example):
```
To: yourname@gmail.com
From: noreply@web3forms.com
Subject: New Beta Sign-up

Email: jane@example.com
Name: Jane Smith
Subscribe Newsletter: yes
Timestamp: 2025-10-25T14:30:00Z
```

### Success Page (thank-you.html)

**Purpose**: Confirm successful signup, set expectations

**Content**:
```
Headline: "Thank you for joining the waitlist!"
Subheadline: "We'll notify you as soon as RSVPex launches."
Message: "In the meantime, keep an eye on your email for updates and early access opportunities."
CTA: [Link back to home] or [Share on social]
```

---

## Meta Tags & SEO Data

### Page Meta Tags

```html
<!-- Required -->
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RSVPex - RSVP Management Coming Soon</title>
<meta name="description" content="Simple event RSVP management is coming soon. Join our waitlist for early access to beautiful, easy-to-use guest tracking.">

<!-- Open Graph (Facebook, LinkedIn, etc.) -->
<meta property="og:type" content="website">
<meta property="og:title" content="RSVPex - RSVP Management Coming Soon">
<meta property="og:description" content="Simple event RSVP management is coming soon. Join our waitlist for early access.">
<meta property="og:image" content="https://rsvpex.com/images/og-preview.png">
<meta property="og:url" content="https://rsvpex.com">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="RSVPex - RSVP Management Coming Soon">
<meta name="twitter:description" content="Simple event RSVP management is coming soon. Join our waitlist for early access.">
<meta name="twitter:image" content="https://rsvpex.com/images/twitter-preview.png">
<meta name="twitter:site" content="@rsvpex">

<!-- Additional SEO -->
<meta name="theme-color" content="#FF6B6B">
<link rel="canonical" href="https://rsvpex.com">
<link rel="icon" href="/images/favicon/favicon.ico">
```

### Structured Data (JSON-LD)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "RSVPex",
  "description": "Simple event RSVP management solution",
  "applicationCategory": "BusinessApplication",
  "status": "Coming Soon",
  "url": "https://rsvpex.com",
  "image": "https://rsvpex.com/images/og-preview.png",
  "author": {
    "@type": "Organization",
    "name": "RSVPex Team"
  }
}
</script>
```

---

## Content Inventory

**Required content to be provided**:
1. Headline (60 chars max)
2. Subheadline (120 chars max)
3. 4-5 benefit titles and descriptions (50 chars + 100 words each)
4. Footer contact email
5. OG/Twitter image preview (1200x630px recommended)
6. Optional: testimonial or use case
7. Optional: social media links

**Content source**: Marketing team (not in scope of implementation plan)
**Approval required**: Before development begins

---

## Responsive Breakpoints & Layout

**Mobile-first approach**:

| Breakpoint | Width | Layout Changes |
|-----------|-------|-----------------|
| Mobile | 320px-374px | Single column, full-width form, stacked benefits |
| Mobile (large) | 375px-599px | Single column, optimized touch targets (44×44px) |
| Tablet | 600px-899px | Two-column benefit cards, wider form |
| Desktop | 900px+ | Three-column benefit cards, multi-column layout |

**Touch target size**: All interactive elements ≥44×44px on mobile

---

## Accessibility Requirements

All content must support:
- **Screen readers**: Proper heading hierarchy (h1 hero, h2 sections, h3 benefits)
- **Keyboard navigation**: Tab through form, buttons, links
- **Color contrast**: Text 4.5:1 on background (WCAG AA)
- **Alt text**: "People celebrating an event while RSVPing on their devices" (hero)
- **Semantic HTML**: `<form>`, `<button>`, `<label>` properly used
- **ARIA labels**: Form error messages, loading states if async submit

---

## Next Steps (Implementation)

1. **Content approval**: Get marketing copy for headlines, benefits, etc.
2. **Design mockup**: Create visual design based on this structure
3. **HTML markup**: Build semantic HTML using this schema
4. **CSS styling**: Mobile-first responsive design per constitution
5. **Form integration**: Connect to Web3Forms with test submissions
6. **Testing**: Cross-browser, mobile device, accessibility testing
