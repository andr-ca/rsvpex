# Contract: Meta Tags & SEO

**Version**: 1.0.0
**Date**: 2025-10-25
**Purpose**: Define all meta tags, structured data, and SEO requirements

---

## Core Meta Tags

### Character Set
```html
<meta charset="UTF-8">
```
**Purpose**: Specify document encoding (UTF-8 for international character support)
**Required**: Yes
**Location**: First element in `<head>`

### Viewport
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```
**Purpose**: Enable responsive design, prevent mobile zoom override
**Required**: Yes
**Attributes**:
- `width=device-width`: Width matches device viewport
- `initial-scale=1.0`: Default zoom level (no zoom on load)
- `user-scalable=yes`: Allow user zoom (accessibility)

### Page Title
```html
<title>RSVPex - RSVP Management Coming Soon</title>
```
**Purpose**: Browser tab title, search result headline
**Required**: Yes
**Constraints**:
- Length: 30-60 characters (optimal for search results)
- Must include primary keyword (e.g., "RSVP Management")
- Should indicate product status ("Coming Soon")
- Format**: "[Product] - [Tagline/Description]"

**Examples**:
- ✅ "RSVPex - RSVP Management Coming Soon"
- ✅ "RSVPex - Event RSVP Made Simple"
- ❌ "Welcome to our website" (too generic)
- ❌ "RSVPex - The most amazing event management platform that will revolutionize how you..." (too long)

### Meta Description
```html
<meta name="description" content="Simple event RSVP management is coming soon. Join our waitlist for early access to beautiful, easy-to-use guest tracking. Weddings, corporate events, and more.">
```
**Purpose**: Search result snippet, social media preview fallback
**Required**: Yes (critical for SEO)
**Constraints**:
- Length: 120-160 characters (optimal for Google search results)
- Must include call-to-action ("Join", "Early access", etc.)
- Should mention key benefits (RSVP, guest tracking)
- Include primary keywords naturally

**Examples**:
- ✅ "Simple event RSVP management is coming soon. Join our waitlist for early access..."
- ✅ "Easy event RSVP management solution. Track guests, send invitations, manage responses."
- ❌ "This is our website" (too generic, no CTA)
- ❌ "Simple event RSVP management is coming soon. Join our waitlist for early access to beautiful, easy-to-use guest tracking solution for weddings..." (too long)

### Theme Color
```html
<meta name="theme-color" content="#FF6B6B">
```
**Purpose**: Browser UI color on mobile (Chrome, Edge)
**Required**: No (enhancement)
**Constraints**:
- Value: Hex color matching brand primary color
- Used in browser chrome on Android
- Should match header/brand color

---

## Open Graph (Facebook, LinkedIn, Pinterest)

### og:type
```html
<meta property="og:type" content="website">
```
**Purpose**: Content type for social sharing
**Value**: `website` (this is a coming-soon page, not article/product)
**Required**: Yes

### og:title
```html
<meta property="og:title" content="RSVPex - RSVP Management Coming Soon">
```
**Purpose**: Title when shared on Facebook/LinkedIn
**Constraints**:
- Length: Same as page title (30-60 chars)
- Can be identical to page `<title>`
- Must be compelling for social sharing

### og:description
```html
<meta property="og:description" content="Simple event RSVP management is coming soon. Join our waitlist for early access to beautiful, easy-to-use guest tracking.">
```
**Purpose**: Description in social media preview
**Constraints**:
- Length: Same as meta description (120-160 chars)
- Can be identical to page meta description
- Include CTA for social engagement

### og:image
```html
<meta property="og:image" content="https://rsvpex.com/images/og-preview.png">
```
**Purpose**: Image shown when page is shared on Facebook/LinkedIn
**Constraints**:
- Dimensions: **1200x630px** (recommended) or **600x315px** (minimum)
- Format: PNG or JPG (JPG for smaller file size)
- File size: <500KB (optimized)
- Content: Hero visual, product logo, compelling design
- Path: Absolute URL (must include domain)

**Image requirements**:
- Design mockup showing hero section or product concept
- Include RSVPex branding/logo
- Use brand colors
- Text overlay: "RSVP Management Coming Soon" or similar
- Ensure clear visibility when sized down

**Asset example**:
```
File: /images/og-preview.png
Size: 1200x630px
Content: Hero section visual with text overlay
Format: PNG (or JPG for <100KB)
```

### og:url
```html
<meta property="og:url" content="https://rsvpex.com">
```
**Purpose**: Canonical URL for social sharing
**Constraints**:
- Must be absolute URL (include domain)
- No query parameters or fragments
- Must be publicly accessible

---

## Twitter Card

### twitter:card
```html
<meta name="twitter:card" content="summary_large_image">
```
**Purpose**: Twitter preview format
**Value**: `summary_large_image` (large image format, most engaging)
**Options**:
- `summary_large_image`: Hero image + text (recommended)
- `summary`: Small image + text
- `app`: Twitter app card

### twitter:title
```html
<meta name="twitter:title" content="RSVPex - RSVP Management Coming Soon">
```
**Purpose**: Title in Twitter preview
**Constraints**:
- Length: 70 characters (Twitter truncates longer titles)
- Can be same as og:title

### twitter:description
```html
<meta name="twitter:description" content="Simple event RSVP management is coming soon. Join our waitlist for early access.">
```
**Purpose**: Description in Twitter preview
**Constraints**:
- Length: 200 characters (Twitter allows more than Facebook)
- Include CTA for engagement

### twitter:image
```html
<meta name="twitter:image" content="https://rsvpex.com/images/twitter-preview.png">
```
**Purpose**: Image shown in Twitter preview
**Constraints**:
- Dimensions: **1200x675px** (16:9 aspect ratio, optimal for Twitter)
- Format: PNG or JPG
- File size: <500KB
- Can be same as og:image but ideally optimized for 16:9

### twitter:site
```html
<meta name="twitter:site" content="@rsvpex">
```
**Purpose**: Twitter handle for attribution
**Constraints**:
- Format: @username (no URL)
- Only if official RSVPex Twitter account exists
- Optional if account not yet active

---

## Canonical URL

### Canonical Link
```html
<link rel="canonical" href="https://rsvpex.com">
```
**Purpose**: Prevent duplicate content issues, specify preferred URL
**Constraints**:
- Must be absolute URL (include domain and protocol)
- No query parameters (unless query defines unique content)
- Points to main page (`/` root)
- Important for SEO (tells search engines what's canonical)

---

## Favicon & App Icons

### Favicon
```html
<link rel="icon" href="/images/favicon/favicon.ico" type="image/x-icon">
<link rel="shortcut icon" href="/images/favicon/favicon.ico" type="image/x-icon">
```
**Purpose**: Icon in browser tab, bookmarks
**Constraints**:
- Format: ICO (for broad compatibility), SVG (modern), or PNG
- Size: 16x16px (minimum), 32x32px (recommended)
- File size: <10KB

### Apple Touch Icon
```html
<link rel="apple-touch-icon" href="/images/favicon/apple-touch-icon.png">
```
**Purpose**: Icon on iOS home screen, iPad
**Constraints**:
- Dimensions: 180x180px (retina display support)
- Format: PNG
- File size: <50KB
- Background: Solid color (icon will be rounded automatically)

### Microsoft Tile
```html
<meta name="msapplication-TileColor" content="#FF6B6B">
<meta name="msapplication-TileImage" content="/images/favicon/mstile-144x144.png">
```
**Purpose**: Windows 10+ Start menu tile icon
**Constraints**:
- Dimensions: 144x144px (minimum)
- Format: PNG
- Color: Brand primary color
- File size: <50KB

---

## Structured Data (JSON-LD)

### Software Application Schema
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "RSVPex",
  "description": "Event RSVP management solution coming soon",
  "applicationCategory": "BusinessApplication",
  "offers": {
    "@type": "Offer",
    "price": "TBD",
    "priceCurrency": "USD"
  },
  "status": "Coming Soon",
  "url": "https://rsvpex.com",
  "image": {
    "@type": "ImageObject",
    "url": "https://rsvpex.com/images/og-preview.png",
    "width": 1200,
    "height": 630
  },
  "author": {
    "@type": "Organization",
    "name": "RSVPex"
  }
}
</script>
```

**Purpose**: Help search engines understand page content
**Constraints**:
- Must be valid JSON (validate at schema.org)
- Include key product information
- Help with rich snippets in search results

**Alternative: Organization Schema** (if including team/contact info):
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "RSVPex",
  "url": "https://rsvpex.com",
  "logo": "https://rsvpex.com/images/logo.png",
  "description": "Event RSVP management solution coming soon",
  "contact": {
    "@type": "ContactPoint",
    "contactType": "Customer Service",
    "email": "hello@rsvpex.com"
  }
}
</script>
```

---

## Analytics & Tracking

### Cloudflare Web Analytics
```html
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "YOUR_TOKEN"}'></script>
```
**Location**: In `<head>` or before `</body>`
**Constraints**:
- Replace `YOUR_TOKEN` with actual Cloudflare token
- Defer loading to not block page render
- Cookie-free (GDPR compliant)

### Additional Analytics (Optional)
```html
<!-- Google Analytics 4 (if added later) -->
<!-- <script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script> -->
```

**Note**: Keep script count under 3 (constitution requirement)
- Script 1: Cloudflare Analytics
- Script 2: Web3Forms
- Script 3: Reserve for future use

---

## Complete Head Section Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Character Set & Viewport -->
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Primary Metadata -->
  <title>RSVPex - RSVP Management Coming Soon</title>
  <meta name="description" content="Simple event RSVP management is coming soon. Join our waitlist for early access.">
  <link rel="canonical" href="https://rsvpex.com">

  <!-- Open Graph (Social Media) -->
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

  <!-- Brand & Theme -->
  <meta name="theme-color" content="#FF6B6B">
  <meta name="brand-color" content="#FF6B6B">

  <!-- Favicon & Icons -->
  <link rel="icon" href="/images/favicon/favicon.ico" type="image/x-icon">
  <link rel="apple-touch-icon" href="/images/favicon/apple-touch-icon.png">
  <meta name="msapplication-TileColor" content="#FF6B6B">
  <meta name="msapplication-TileImage" content="/images/favicon/mstile-144x144.png">

  <!-- Stylesheets -->
  <link rel="stylesheet" href="/css/main.css">
  <link rel="stylesheet" href="/css/critical.css">

  <!-- Preload Critical Resources -->
  <link rel="preload" href="/fonts/system-font" as="font">

  <!-- Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "RSVPex",
    "description": "Event RSVP management solution coming soon",
    "applicationCategory": "BusinessApplication",
    "url": "https://rsvpex.com",
    "status": "Coming Soon"
  }
  </script>

  <!-- Analytics (Cookie-free) -->
  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "YOUR_TOKEN"}'></script>
</head>
<body>
  <!-- Page content -->
</body>
</html>
```

---

## Testing & Validation

### Meta Tag Testing

**Tool 1: Facebook Sharing Debugger**
- URL: https://developers.facebook.com/tools/debug/
- Enter page URL
- Verify: og:title, og:description, og:image render correctly

**Tool 2: Twitter Card Validator**
- URL: https://cards-dev.twitter.com/validator
- Enter page URL
- Verify: twitter:card shows preview correctly

**Tool 3: Google Rich Results Test**
- URL: https://search.google.com/test/rich-results
- Enter page URL
- Verify: Structured data is valid, no errors

**Tool 4: W3C Markup Validator**
- URL: https://validator.w3.org/
- Enter page URL or HTML
- Verify: No meta tag errors or warnings

### SEO Checklist

- [ ] Page title is 30-60 characters
- [ ] Meta description is 120-160 characters
- [ ] og:image is 1200x630px and <500KB
- [ ] twitter:image is 1200x675px
- [ ] og:url and canonical URL match
- [ ] Structured data validates with no errors
- [ ] Favicon displays in browser tab
- [ ] Apple touch icon works on iOS
- [ ] All images have alt text
- [ ] Page title and description include primary keyword
- [ ] CTA visible in meta description

---

## Environment Variables

**Required**:
```
CLOUDFLARE_TOKEN=your_cloudflare_token_here
WEB3FORMS_ACCESS_KEY=your_web3forms_key_here
DOMAIN=rsvpex.com
```

**How to use in templates**:
- Build process: Replace `{{ DOMAIN }}` with env value
- Or: Insert directly in HTML if static site generator used
