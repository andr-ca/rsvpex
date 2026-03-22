# Deploy RSVPex Now - Quick Start

Complete these steps to deploy to Cloudflare Pages in 5 minutes.

## Step 1: Install Wrangler CLI (One-time Setup)

```bash
npm install -g wrangler
```

Verify installation:
```bash
wrangler --version
```

## Step 2: Authenticate with Cloudflare

```bash
wrangler login
```

This opens your browser to authenticate. Approve access and close the browser.

## Step 3: Update Web3Forms Access Key

**Critical**: Before deploying, update your Web3Forms access key in `index.html`:

```bash
# Edit index.html
nano index.html
# Or use your preferred editor

# Find this line (around line 371):
# <input type="hidden" name="access_key" value="">

# Replace with your key from https://web3forms.com:
# <input type="hidden" name="access_key" value="YOUR_KEY_HERE">
```

## Step 4: Deploy to Cloudflare Pages

```bash
# From project root directory
wrangler pages deploy . --project-name=rsvpex-landing
```

Wait for deployment to complete. You'll see:
```
✓ Uploading... [####################] 100%
✓ Success! Your site was deployed!

URL: https://[random].rsvpex-landing.[account].pages.dev
```

## Step 5: Verify Deployment

1. Visit the provided URL
2. Test form submission
3. Verify thank-you page appears
4. Check browser console (F12) for errors

## Step 6: Setup Custom Domain (Optional but Recommended)

Once verified, add your custom domain:

### Via Cloudflare Dashboard:
1. Go to https://dash.cloudflare.com
2. Click **Pages**
3. Select **rsvpex-landing**
4. Go to **Settings** → **Domains**
5. Add custom domain: `rsvpex.com`
6. Follow DNS instructions

### Or via CLI:
```bash
# List projects
wrangler pages list

# View current deployments
wrangler pages deployments list --project-name=rsvpex-landing
```

## That's It!

Your landing page is now live.

### What's Next?

- **Monitor submissions**: Check Web3Forms inbox for email signups
- **Export emails**: Use Mailchimp to deduplicate and manage contacts
- **Update analytics**: Add Cloudflare Web Analytics token to track visitors

### Troubleshooting

**Wrangler not found?**
```bash
npm install -g wrangler
```

**Authentication error?**
```bash
wrangler logout
wrangler login
```

**Form not submitting?**
- Check Web3Forms access key is set in `index.html`
- Verify it's the correct key from https://web3forms.com

**Need more details?**
- See `DEPLOYMENT.md` for comprehensive guide
- See `TESTING.md` for testing procedures
- See `README.md` for overall documentation

---

**Git commit for deployment:**
```bash
# All changes should be committed:
git log --oneline | head -1
```

**Current status**: ✓ Ready to deploy

For questions: hello@rsvpex.com
