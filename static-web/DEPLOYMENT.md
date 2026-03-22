# RSVPex Landing Page - Deployment Guide

Complete step-by-step instructions for deploying the RSVPex landing page to Cloudflare Pages using the Wrangler CLI.

## Prerequisites

Before deploying, ensure you have:

1. **Cloudflare Account**
   - Free tier available at https://dash.cloudflare.com
   - Can host unlimited pages projects

2. **Wrangler CLI Installed**
   ```bash
   npm install -g wrangler
   ```

   Verify installation:
   ```bash
   wrangler --version
   ```

3. **Authenticated with Cloudflare**
   ```bash
   wrangler login
   ```
   - Opens browser to authenticate
   - Generates local credentials

4. **Web3Forms Access Key**
   - Sign up at https://web3forms.com
   - Get your Access Key from dashboard
   - Update in `index.html` before deploying

---

## Pre-Deployment Checklist

Before deploying, verify:

- [ ] Web3Forms access key is configured in `index.html`
- [ ] All local testing passed (see TESTING.md)
- [ ] Git changes committed: `git log -1 --oneline`
- [ ] `.env` file exists locally (not committed)
- [ ] `.gitignore` prevents accidental secret commits

---

## Deployment Option 1: Quick Deploy (Development)

### For Testing/Staging

```bash
# From project root directory
wrangler pages deploy . --project-name=rsvpex-landing
```

This creates a unique preview URL:
```
https://[random]rsvpex-landing.[account].pages.dev
```

Useful for:
- Testing before setting up custom domain
- Sharing staging preview with team
- Multiple test deployments

---

## Deployment Option 2: Production Deploy (Recommended)

### Step 1: Initial Deployment

```bash
wrangler pages deploy . --project-name=rsvpex-landing
```

The system will:
1. Upload all files from current directory
2. Create project on Cloudflare Pages
3. Assign subdomain: `https://rsvpex-landing.[account].pages.dev`
4. Provide deployment URL

### Step 2: Connect Custom Domain

After successful initial deployment, connect your custom domain:

#### Via Wrangler CLI:
```bash
# List available projects
wrangler pages list

# Get project details
wrangler pages project list --project-name=rsvpex-landing
```

#### Via Cloudflare Dashboard:

1. Go to https://dash.cloudflare.com
2. Select **Pages** from left sidebar
3. Click **rsvpex-landing** project
4. Go to **Settings** → **Domains & Verification**
5. Click **Add Custom Domain**
6. Enter your domain: `rsvpex.com`
7. Follow DNS instructions:
   - Update nameservers to Cloudflare (if using them)
   - Or add CNAME record pointing to Pages subdomain

#### DNS Configuration for Existing Domain:

If using existing registrar (like GoDaddy, NameCheap):

**Option A: Use Cloudflare Nameservers**
1. Update domain registrar to Cloudflare nameservers:
   - `parker.ns.cloudflare.com`
   - `ruby.ns.cloudflare.com`
2. Add domain in Cloudflare Dashboard
3. Add custom domain in Pages settings

**Option B: CNAME Record**
1. In your registrar's DNS settings
2. Create CNAME record:
   - Name: `rsvpex`
   - Value: `rsvpex-landing.[account].pages.dev`
3. Add custom domain in Pages settings

### Step 3: Verify Deployment

Check deployment status:

```bash
# List recent deployments
wrangler pages deployments list --project-name=rsvpex-landing

# Output shows:
# ID | Created      | Status   | Environment | URL
# ---|--------------|----------|-------------|-----
# 1  | 2 hours ago  | active   | production  | https://rsvpex.com
```

Visit your custom domain:
```
https://rsvpex.com
```

---

## Deployment Option 3: With Environment Variables

For storing sensitive data (optional):

### Create wrangler.toml (Optional)

In project root:

```toml
name = "rsvpex-landing"
pages_build_output_dir = "."

[env.production]
vars = { DOMAIN = "rsvpex.com", ENV = "production" }

[env.staging]
vars = { DOMAIN = "staging.rsvpex.com", ENV = "staging" }
```

### Set Secrets (Optional)

Store Web3Forms key in Cloudflare:

```bash
# Set Web3Forms access key
wrangler pages secret put WEB3FORMS_ACCESS_KEY --project-name=rsvpex-landing

# Prompt will ask you to enter the secret value
# Paste your Web3Forms Access Key

# Verify secrets are set
wrangler pages secret list --project-name=rsvpex-landing
```

**Note**: For static sites, Web3Forms access key can be public (it's meant for client-side use). You can also hardcode it in `index.html` directly.

---

## Deployment Option 4: Continuous Deployment via Gitea

### Setup Gitea Actions (CI/CD)

Create `.gitea/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches:
      - main
      - 001-landing-page

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Deploy to Cloudflare Pages
        run: |
          npm install -g wrangler
          wrangler pages deploy . --project-name=rsvpex-landing

        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

```

### Configure Gitea Secrets

1. Go to repository settings
2. Find **Secrets** section
3. Add `CLOUDFLARE_API_TOKEN`:
   - Get token from https://dash.cloudflare.com/profile/api-tokens
   - Scopes needed: **Cloudflare Pages**
   - Add to Gitea secrets

Now every git push will auto-deploy!

### Automatic PR Preview Deployments

The workflow also automatically deploys pull requests to preview environments:

**On PR creation**:
```
1. Workflow runs automatically
2. Deploys to staging: https://pr-XXX---rsvpex-landing.pages.dev
3. Comments PR with preview URL
4. Reviewers can test live changes
```

**On PR merge**:
```
1. Workflow runs again
2. Deploys to production: https://rsvpex.com
3. Zero-downtime deployment
```

### For Complete Setup Instructions

See **`GITEA_ACTIONS_SETUP.md`** for step-by-step guide:
- Generating Cloudflare API token
- Adding repository secrets to Gitea
- Testing the workflow
- Monitoring deployments
- Troubleshooting

---

## Post-Deployment Verification

After deployment, verify everything works:

### 1. Page Loads
```bash
curl -I https://rsvpex.com
```

Should return `200 OK` status

### 2. Form Works
- Visit https://rsvpex.com
- Fill in email form
- Submit and verify redirect to thank-you page

### 3. Email Arrives
- Check inbox for Web3Forms submission confirmation
- Verify form data was captured

### 4. Assets Load
- Open DevTools (F12)
- Go to **Network** tab
- Refresh page
- Verify all files load (no 404 errors)
- Check:
  - CSS file: `/css/main.css`
  - JS file: `/js/main.js`
  - SVG images: `/images/hero/calendar-illustration.svg`
  - Favicon: `/images/favicon/favicon.svg`

### 5. Performance Check
- Go to **Performance** tab in DevTools
- Run Lighthouse audit
- Target: 90+ in all categories
- Screenshot results

### 6. Analytics Setup
Update Cloudflare Web Analytics token in `index.html`:

```html
<script defer src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token": "YOUR_TOKEN_HERE"}'></script>
```

Get token from:
1. Cloudflare Dashboard → Web Analytics
2. Create new site
3. Copy token
4. Update `index.html`
5. Redeploy

---

## Monitoring & Updates

### View Deployment Logs

```bash
# Check if page is accessible
curl -v https://rsvpex.com

# View recent builds
wrangler pages deployments list --project-name=rsvpex-landing

# View specific deployment details
wrangler pages deployment view <deployment-id> --project-name=rsvpex-landing
```

### Making Updates

After making code changes:

```bash
# 1. Test locally
python3 -m http.server 8000

# 2. Commit changes
git add .
git commit -m "Update: [description of changes]"

# 3. Deploy
wrangler pages deploy . --project-name=rsvpex-landing

# 4. Verify deployment
# Visit https://rsvpex.com and test
```

---

## Troubleshooting

### Deployment Failed

**Error: "Authentication failed"**
```bash
# Re-authenticate with Cloudflare
wrangler logout
wrangler login
```

**Error: "Project not found"**
```bash
# Check project name
wrangler pages list

# Verify project exists
wrangler pages deployments list --project-name=rsvpex-landing
```

### Page Not Loading

**Blank page or 404**
1. Check files uploaded: `wrangler pages deployments list`
2. Verify index.html exists in deployment
3. Clear browser cache (Ctrl+Shift+Delete)

**CSS not loading**
1. Check CSS file path: `/css/main.css`
2. Verify file exists in deployment
3. Check DevTools Network tab for 404s

**Form not submitting**
1. Verify Web3Forms access key is set
2. Check browser console for errors (F12)
3. Verify form action URL: `https://api.web3forms.com/submit`

### Custom Domain Not Resolving

**DNS not working after 24 hours**
1. Verify DNS records in Cloudflare Dashboard
2. Clear local DNS cache:
   ```bash
   # Windows
   ipconfig /flushdns

   # macOS
   sudo dscacheutil -flushcache

   # Linux
   sudo systemctl restart systemd-resolved
   ```
3. Use online DNS checker: https://dnschecker.org

**SSL Certificate Not Issued**
- Cloudflare automatically issues SSL (can take 15 minutes)
- Wait 24 hours before troubleshooting
- Check Cloudflare Dashboard for SSL status

---

## Rollback Procedure

If deployment has issues:

### View Previous Deployments

```bash
wrangler pages deployments list --project-name=rsvpex-landing
```

Shows list with deployment IDs and timestamps

### Rollback to Previous Deployment

```bash
# Make note of previous deployment ID
# Revert by deploying the previous version from git

# Option 1: Checkout previous commit
git log  # Find commit hash
git checkout <commit-hash>
git checkout 001-landing-page  # Return to current

# Option 2: Deploy from git history
git revert HEAD  # Creates new commit that undoes changes
git push
wrangler pages deploy . --project-name=rsvpex-landing
```

---

## Performance Optimization

### Cloudflare Cache Settings

In Cloudflare Dashboard → rsvpex.com:

1. **Caching**
   - Set cache level: **Cache Everything**
   - Browser cache TTL: **1 month**

2. **Speed**
   - Enable **Rocket Loader** for JS (optional)
   - Enable **Brotli** compression

3. **Security**
   - Enable **Always Use HTTPS**
   - Minimum TLS version: **1.2**

### Monitoring

Set up monitoring:
1. Cloudflare Dashboard → Analytics
2. Check:
   - Requests per day
   - Cache hit ratio
   - Performance metrics
3. Set alerts for:
   - High error rate (5xx errors)
   - Unusual traffic spikes

---

## Domain Expiration & Renewal

- [ ] Monitor domain expiration date
- [ ] Set calendar reminder for renewal
- [ ] Maintain auto-renewal in registrar settings
- [ ] Keep Cloudflare nameservers updated

---

## Support & Resources

- **Cloudflare Pages Docs**: https://developers.cloudflare.com/pages/
- **Wrangler CLI**: https://developers.cloudflare.com/workers/wrangler/
- **Web3Forms Docs**: https://web3forms.com/docs
- **Cloudflare Support**: https://support.cloudflare.com

---

## Deployment Checklist

Before going live:

- [ ] Wrangler CLI installed (`wrangler --version`)
- [ ] Authenticated with Cloudflare (`wrangler login`)
- [ ] Web3Forms access key configured in `index.html`
- [ ] Git changes committed
- [ ] Local testing passed (see TESTING.md)
- [ ] Project deployed: `wrangler pages deploy . --project-name=rsvpex-landing`
- [ ] Custom domain configured in Cloudflare
- [ ] DNS updated and propagated
- [ ] Live URL loads without errors
- [ ] Form submission tested on live site
- [ ] Email received from Web3Forms
- [ ] Lighthouse audit scores 90+
- [ ] Analytics configured (optional)
- [ ] Monitoring set up (optional)

---

## Next Steps (Post-Launch)

1. **Monitor Daily** (first week)
   - Check visitor count
   - Monitor form submissions
   - Watch for errors

2. **Weekly Tasks**
   - Export emails from Web3Forms
   - Import to Mailchimp
   - Review analytics trends

3. **Before Beta Launch**
   - Export all emails from Mailchimp
   - Prepare launch announcement
   - Send beta access emails

---

**Status**: Ready for deployment to Cloudflare Pages ✓

Questions? Refer to README.md or contact hello@rsvpex.com
