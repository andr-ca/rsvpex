# RSVPex Landing Page - Testing Guide

Complete testing checklist and procedures for the RSVPex landing page before deployment.

## Pre-Testing Setup

### 1. Get Web3Forms Access Key

1. Go to https://web3forms.com
2. Sign up or log in
3. Copy your Access Key from the dashboard
4. Edit `index.html` and replace the empty `access_key` value:
   ```html
   <input type="hidden" name="access_key" value="YOUR_KEY_HERE">
   ```

### 2. Start Local Server

From the project root directory:

```bash
# Using Python 3
python3 -m http.server 8000

# Or using Node.js http-server
npx http-server

# Or using PHP
php -S localhost:8000
```

Visit: **http://localhost:8000**

---

## Testing Checklist

### Functional Testing

- [ ] **Page Loads**: Homepage loads without errors in browser console
- [ ] **Header**: Logo displays and is visible at top of page
- [ ] **Hero Section**: Title and subtitle display correctly
- [ ] **Hero Image**: Calendar illustration loads and displays
- [ ] **Benefits Section**: All three benefit cards visible with icons
- [ ] **Footer**: Footer displays with links and social icons
- [ ] **Form Visible**: Email form appears in hero section

### Form Validation Testing

- [ ] **Empty Email Submission**: Try submitting without email → shows error
- [ ] **Invalid Email Format**: Try `invalidemail` → shows error
- [ ] **Valid Email Format**: `user@example.com` → no error shown
- [ ] **Optional Name Field**: Leave blank → form still validates
- [ ] **Name with 1 Char**: Enter name like `A` → shows error
- [ ] **Valid Name**: Enter `John Doe` → no error shown
- [ ] **Email Field Focus**: Tab into email field → blue focus ring visible
- [ ] **Real-time Validation**: Type valid email → error clears automatically
- [ ] **Honeypot Field**: Verify spam field is hidden (CSS `display: none`)

### Form Submission Testing

**With Web3Forms Access Key:**

1. Fill in email: `test@example.com`
2. Fill in name: `Test User` (optional)
3. Check "Keep me updated about the beta launch" (optional)
4. Click "Join the Waitlist"
5. Verify:
   - [ ] Form loading state shows (button text changes to "Joining...")
   - [ ] Page redirects to `/thank-you.html` after 2-3 seconds
   - [ ] Thank you page displays with success message
   - [ ] "Back to Home" link works

**Verify Email Receipt:**

- [ ] Check your email inbox (and spam folder)
- [ ] Confirm Web3Forms email arrives with submission details

### Responsive Design Testing

Test on each screen size:

#### Mobile (320px - 480px)
- [ ] No horizontal scroll
- [ ] Form fields stack vertically
- [ ] Text is readable without zoom
- [ ] Buttons are at least 44px tall (touch target)
- [ ] Tap input fields → keyboard appears
- [ ] Navigation/logo visible on mobile

#### Tablet (600px - 900px)
- [ ] Form max-width doesn't exceed 600px
- [ ] Hero section stacks content below image or side-by-side
- [ ] Benefits grid shows 2 columns
- [ ] All text readable at normal zoom

#### Desktop (900px+)
- [ ] Hero section shows image on right side
- [ ] Benefits grid shows 3 columns
- [ ] Form stays centered with good spacing
- [ ] All elements properly aligned

**Testing Tools:**
- Chrome DevTools: Press F12 → Toggle device toolbar (Ctrl+Shift+M)
- Real devices: Test on actual mobile phone/tablet if possible

### Accessibility Testing

#### Keyboard Navigation
- [ ] Tab through all interactive elements (form fields, buttons, links)
- [ ] Visible focus ring on all focused elements (blue outline)
- [ ] Can submit form using keyboard (Tab to button, Enter to submit)
- [ ] Links are keyboard accessible

#### Focus Indicators
- [ ] Email input: Clear blue focus ring when focused
- [ ] Submit button: Clear focus ring visible
- [ ] All links: Focus ring visible when tabbed to

#### Screen Reader Testing (Optional but Recommended)
- [ ] Page title announced correctly
- [ ] Headings announced (h1, h2, h3)
- [ ] Form labels read correctly before inputs
- [ ] Error messages announced to screen readers
- [ ] Hero image has alt text (calendar illustration)
- [ ] Social icons have aria-labels

#### Color Contrast
- [ ] Black text on white: High contrast ✓
- [ ] Primary color (#FF6B6B) on white: Check ratio ~4.5:1
- [ ] Error text (#d32f2f) on white: High contrast ✓

Test using: https://webaim.org/resources/contrastchecker/

### Performance Testing

#### Page Load Speed
- [ ] Page loads in under 2 seconds on 4G (DevTools throttling)
- [ ] CSS is inlined (no render-blocking external CSS)
- [ ] JavaScript is deferred (loaded after page content)
- [ ] SVG images load quickly

#### Browser DevTools Lighthouse

1. Open DevTools (F12)
2. Go to **Lighthouse** tab
3. Select: Desktop (or Mobile)
4. Click **Analyze page load**
5. Check scores (target: 90+ in each category):
   - [ ] Performance: 90+
   - [ ] Accessibility: 90+
   - [ ] Best Practices: 90+
   - [ ] SEO: 90+

### SEO Testing

#### Meta Tags
- [ ] Page title visible in browser tab: "RSVPex - RSVP Management Coming Soon"
- [ ] Meta description present in head
- [ ] Open Graph tags present (og:title, og:description, og:image, og:url)
- [ ] Twitter Card tags present

#### Test with Tools
- https://www.opengraph.xyz - Paste homepage URL, verify OG tags
- https://cards-dev.twitter.com/validator - Verify Twitter Card

#### Structured Data (JSON-LD)
- [ ] JSON-LD script tag present in HTML
- [ ] Type is "SoftwareApplication"
- [ ] Validate at: https://search.google.com/structured-data/testing-tool

#### SEO Validators
- [ ] robots.txt readable at `/robots.txt`
- [ ] sitemap.xml readable at `/sitemap.xml`
- [ ] Both contain correct URLs

### Cross-Browser Testing

Test on these browsers (if available):

- [ ] Chrome (latest) - Desktop
- [ ] Firefox (latest) - Desktop
- [ ] Safari (latest) - Desktop (macOS only)
- [ ] Edge (latest) - Desktop
- [ ] Safari - iOS (iPhone/iPad)
- [ ] Chrome - Android

Check for:
- Correct layout and styling
- Form submission works
- No console errors
- All assets load

### Image & Asset Testing

- [ ] Favicon displays in browser tab
- [ ] Hero SVG illustration displays correctly
- [ ] Benefit card SVG icons display
- [ ] Social icons display in footer
- [ ] All SVGs render without distortion

### Form Integration Testing (Critical)

**Before deployment, verify Web3Forms integration:**

1. Update access key in `index.html`
2. Test with real email address
3. Verify:
   - [ ] Form accepts submission
   - [ ] Redirect to thank-you.html works
   - [ ] Email arrives in your inbox within 2 minutes
   - [ ] Email contains form data

### No JavaScript Testing (Progressive Enhancement)

1. Open DevTools (F12)
2. Go to **Console** tab
3. Type: `navigator.javaScriptEnabled = false`
4. Or disable JavaScript in settings
5. Reload page
6. Test:
   - [ ] Form still visible and functional
   - [ ] Can fill and submit form (HTML5 validation)
   - [ ] Still redirects to thank-you.html

---

## Common Issues & Troubleshooting

### Form Won't Submit
- [ ] Check Web3Forms access key is set in HTML
- [ ] Check browser console for JavaScript errors (F12 → Console)
- [ ] Verify redirect URL: `/thank-you.html` is correct
- [ ] Try in incognito/private mode (bypasses extensions)

### Email Not Arriving
- [ ] Check spam/junk folder
- [ ] Check Web3Forms dashboard for submission record
- [ ] Verify access key is correct
- [ ] Try with different email address

### Page Layout Broken
- [ ] Clear browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)
- [ ] Check DevTools console for CSS errors
- [ ] Verify all CSS files are loading (Network tab)
- [ ] Check responsive design settings match CSS breakpoints

### Images Not Loading
- [ ] Check file paths are correct
- [ ] Verify SVG files exist in `/images/` directory
- [ ] Open Network tab in DevTools → check 404 errors
- [ ] Test in different browser

### JavaScript Errors
- [ ] Open Console tab (F12)
- [ ] Check for red error messages
- [ ] Verify `/js/main.js` is loading (Network tab)
- [ ] Test form validation still works

---

## Final Pre-Deployment Checklist

- [ ] All functional tests passing
- [ ] Responsive design tested on 3+ screen sizes
- [ ] Accessibility tested (keyboard nav, focus rings)
- [ ] Lighthouse scores 90+ (all categories)
- [ ] Form submission tested with real Web3Forms
- [ ] Cross-browser tested (minimum Chrome + Firefox)
- [ ] No console errors in DevTools
- [ ] SVG assets load correctly
- [ ] Meta tags verified with OpenGraph validator
- [ ] robots.txt and sitemap.xml accessible
- [ ] Thank-you page working correctly
- [ ] Git changes committed locally
- [ ] Ready for Cloudflare Pages deployment

---

## Test Results Template

Record your test results:

```
Date: YYYY-MM-DD
Tester: [Your Name]
Browser/Device: [Chrome 120 / iPhone 14 / etc]

Functionality: ✓ Pass / ✗ Fail
Responsiveness: ✓ Pass / ✗ Fail
Accessibility: ✓ Pass / ✗ Fail
Performance: ✓ Pass / ✗ Fail (Lighthouse score: ___)
SEO: ✓ Pass / ✗ Fail
Form Submission: ✓ Pass / ✗ Fail

Notes:
[Any issues or observations]
```

---

## Next Steps

After all tests pass:

1. **Commit to Git**: `git add . && git commit -m "Landing page implementation complete"`
2. **Deploy to Cloudflare**: Follow README.md deployment instructions
3. **Post-Deployment Tests**:
   - Visit live URL
   - Test form submission on live site
   - Check analytics are collecting data
   - Monitor email submissions

---

## Resources

- [Web3Forms Documentation](https://web3forms.com/docs)
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/)
- [WebAIM Accessibility](https://webaim.org/)
- [Google Structured Data Testing](https://search.google.com/structured-data/testing-tool)
- [OpenGraph Validator](https://www.opengraph.xyz)
