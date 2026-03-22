# Contract: Email Signup Form

**Version**: 1.0.0
**Date**: 2025-10-25
**Purpose**: Define the form interface, validation, and submission contract

## Form Endpoint

**Service**: Web3Forms
**URL**: `https://api.web3forms.com/submit`
**Method**: `POST`
**Content-Type**: `application/x-www-form-urlencoded`

---

## Form Fields

### Required Fields

#### 1. access_key
- **Type**: Hidden input
- **Required**: Yes
- **Value**: Web3Forms API access key (from `.env`)
- **Validation**: Non-empty string
- **Purpose**: Authenticates form submission with Web3Forms

```html
<input type="hidden" name="access_key" value="your_access_key_here">
```

#### 2. email
- **Type**: Email input
- **Required**: Yes
- **Validation**: HTML5 email validation + regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- **Max length**: 254 characters
- **Placeholder**: "your@email.com"
- **Error message**: "Please enter a valid email address"
- **Accessibility**: `<label>Email Address</label>` with `for="email"` and `aria-required="true"`

```html
<label for="email">Email Address</label>
<input
  type="email"
  id="email"
  name="email"
  required
  aria-required="true"
  placeholder="your@email.com"
  maxlength="254"
  title="Enter a valid email address">
```

#### 3. redirect
- **Type**: Hidden input
- **Required**: Yes
- **Value**: `/thank-you.html` (absolute or relative URL)
- **Purpose**: Page to display after successful form submission
- **Validation**: Valid URL path

```html
<input type="hidden" name="redirect" value="/thank-you.html">
```

#### 4. subject
- **Type**: Hidden input
- **Required**: Yes
- **Value**: `"New Beta Sign-up"`
- **Purpose**: Email subject line in admin inbox
- **Validation**: Non-empty string, max 100 chars

```html
<input type="hidden" name="subject" value="New Beta Sign-up">
```

### Optional Fields

#### 5. name
- **Type**: Text input
- **Required**: No
- **Validation**: Text only, no special characters (alphanumeric + spaces/hyphens)
- **Max length**: 100 characters
- **Placeholder**: "Your name"
- **Error message**: "Name can only contain letters, numbers, spaces, and hyphens"

```html
<label for="name">Name (Optional)</label>
<input
  type="text"
  id="name"
  name="name"
  placeholder="Your name"
  maxlength="100"
  pattern="^[a-zA-Z0-9\s\-']*$"
  title="Name can contain letters, numbers, spaces, hyphens, and apostrophes">
```

#### 6. subscribe_newsletter
- **Type**: Checkbox
- **Required**: No
- **Value**: `"yes"` when checked
- **Purpose**: User preference to receive newsletter updates
- **Validation**: Checkbox state (can be checked or unchecked)

```html
<input
  type="checkbox"
  id="subscribe"
  name="subscribe_newsletter"
  value="yes">
<label for="subscribe">Keep me updated about the beta launch</label>
```

### Spam Protection

#### 7. botcheck (Honeypot)
- **Type**: Checkbox
- **Required**: No (hidden from user)
- **Validation**: MUST remain unchecked
- **Purpose**: Spam detection - bots often fill all fields including hidden ones
- **Implementation**: Hidden with CSS `display: none` (not `visibility: hidden`)

```html
<input
  type="checkbox"
  name="botcheck"
  style="display: none;">
```

**Validation logic**: If `botcheck` is checked, server-side validation should fail or submission should be silently discarded

---

## Form Submission Process

### Client-Side Validation

**Validation sequence** (before form submission):

1. **Email field**:
   - Check if empty → show error: "Email is required"
   - Check if matches email regex → show error: "Please enter a valid email"
   - Valid email → enable submit button

2. **Name field** (optional):
   - If filled, check pattern → show error if invalid
   - If empty, skip validation

3. **Botcheck field**:
   - Client-side: Do not validate (just don't check it)
   - Server-side (Web3Forms): Rejects if checked

4. **Submit button**:
   - Enabled only if email is valid
   - Show loading state: `aria-busy="true"` on form

**HTML5 Validation**:
- Use built-in HTML5 validation (no custom validation library needed per vanilla-first)
- Set `required` attribute on required fields
- Use `type="email"` for browser email validation
- Use `pattern` attribute for custom validation
- Display `:invalid` styles via CSS

### Server-Side Response

**Web3Forms Success** (HTTP 200):
- Form submission accepted
- Redirect to `redirect` field value (e.g., `/thank-you.html`)
- Email sent to configured inbox

**Web3Forms Failure** (HTTP 400/500):
- Form submission rejected
- Return to form with error message
- Show: "There was a problem submitting the form. Please try again."
- Log error for debugging

### Progressive Enhancement

**Without JavaScript**:
- Form submits via standard HTML form submission
- Page redirects to thank-you page
- Email delivered to inbox
- Honeypot spam protection still works

**With JavaScript** (optional enhancement):
- Prevent default form submission
- Validate before posting
- Show inline error messages
- Display loading spinner
- Handle response without page redirect
- Show success message inline

---

## Form Attributes & Styling

### Form Element
```html
<form
  action="https://api.web3forms.com/submit"
  method="POST"
  class="signup-form"
  id="waitlist-form"
  role="form"
  aria-label="Beta waitlist signup form">
  <!-- form fields -->
</form>
```

### Input Group Styling
```html
<div class="form-group">
  <label for="email">Email Address <span class="required" aria-label="required">*</span></label>
  <input type="email" id="email" name="email" ... required>
  <span class="error" id="email-error" role="alert" hidden></span>
  <span class="hint">We'll never share your email</span>
</div>
```

### Validation States

**CSS Classes**:
- `.form-group--error`: When field is invalid
- `.form-group--success`: When field is valid
- `.input--error`: Error styling on input
- `.error`: Error message text (color: red/error color)
- `.success`: Success message text

**Error Display**:
- Hidden by default: `hidden` attribute or `display: none`
- Shown on invalid submission or field blur
- Linked to input via `aria-describedby`

```html
<input
  type="email"
  id="email"
  name="email"
  aria-describedby="email-error"
  ... >
<span class="error" id="email-error" role="alert" hidden>
  Please enter a valid email address
</span>
```

---

## Email Received in Inbox

**From**: `noreply@web3forms.com`
**To**: Email configured in Web3Forms dashboard
**Subject**: "New Beta Sign-up" (from `subject` field)

**Email body format**:
```
Email: jane@example.com
Name: Jane Smith
Subscribe Newsletter: yes
Submission Time: 2025-10-25 14:30:00 UTC
IP Address: 192.0.2.1
User Agent: Mozilla/5.0...
```

---

## Email Collection Workflow Integration

### Gmail Filter Setup
1. Rule: `from:noreply@web3forms.com`
2. Action: Label "RSVPex Beta Signups"
3. Archive or keep in inbox (user preference)

### Mailchimp Import
1. Weekly: Export emails from Gmail as CSV
2. Mailchimp → Import contacts
3. Map email field
4. Enable "Update if exists" (prevents duplicate adds)

### CSV Export Example
```
Email,Name
jane@example.com,Jane Smith
john@example.com,John Doe
sarah@example.com,Sarah Johnson
```

---

## Testing Contract

### Valid Submissions

**Test case 1: Minimal (email only)**
- Email: `test@example.com`
- Name: (empty)
- Subscribe: (unchecked)
- Expected: Success, redirect to thank-you.html, email in inbox

**Test case 2: Full submission**
- Email: `jane@example.com`
- Name: `Jane Smith`
- Subscribe: ✓ (checked)
- Expected: Success, email in inbox shows all fields

**Test case 3: Duplicate email**
- Submit same email twice in sequence
- Expected: Both submissions accepted (no client-side dedup), both emails in inbox
  - Note: Deduplication happens later in Mailchimp import

### Invalid Submissions

**Test case 4: No email**
- Email: (empty)
- Expected: Form validation error, form does not submit

**Test case 5: Invalid email format**
- Email: `notanemail`
- Expected: Form validation error "Please enter a valid email"

**Test case 6: Bot detection (honeypot)**
- Check botcheck field (should never happen with valid user)
- Expected: Web3Forms silently fails or returns error

**Test case 7: Mobile submission**
- Device: iPhone 12 (375px width)
- Touch form fields, type email, tap submit
- Expected: Keyboard closes, form submits, thank-you page displays

### Accessibility Testing

**Test case 8: Keyboard navigation**
- Tab through all form fields
- Shift+Tab to go backwards
- Expected: Focus visible on each field and button

**Test case 9: Screen reader**
- Use NVDA/JAWS/VoiceOver
- Read form
- Expected: All labels announced, error messages announced with role="alert"

---

## Environment Variables

**Required**:
```
WEB3FORMS_ACCESS_KEY=your_access_key_here
```

**How to get**:
1. Sign up at web3forms.com
2. Copy access key from dashboard
3. Add to `.env` file
4. Reference in HTML template via build process or inline script

**Security note**: Access key is public-safe (not a secret token), can be embedded in HTML

---

## Success Page (thank-you.html)

**Purpose**: Confirm successful signup

**Content**:
```html
<h1>Thanks for joining the waitlist!</h1>
<p>We'll notify you as soon as RSVPex launches.</p>
<p>In the meantime, keep an eye on your email for updates.</p>
<a href="/">← Back to home</a>
```

**Requirements**:
- Accessible (proper heading hierarchy, semantic HTML)
- Mobile responsive
- Load quickly
- Include meta tags (same as main page)
