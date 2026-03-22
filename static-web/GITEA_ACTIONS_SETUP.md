# Gitea Actions CI/CD Setup Guide

Complete instructions for setting up continuous deployment with Gitea Actions to automatically deploy to Cloudflare Pages on pull requests and merges.

## Overview

The `.gitea/workflows/deploy.yml` workflow automates deployments:

- **Pull Requests**: Deploy to preview environment with unique staging URL
- **Merges**: Deploy to production at `rsvpex.com`
- **Status**: Automatic comments on PR with preview URL

## Prerequisites

1. **Gitea Repository Access**
   - Admin or maintainer permissions
   - Actions enabled in repository settings

2. **Cloudflare Account**
   - API token with Cloudflare Pages scope
   - Existing Pages project: `rsvpex-landing`

3. **Repository Secrets Configuration**
   - Need to add `CLOUDFLARE_API_TOKEN` to Gitea

---

## Step 1: Generate Cloudflare API Token

### Via Cloudflare Dashboard

1. Go to **https://dash.cloudflare.com/profile/api-tokens**
2. Click **Create Token**
3. Use template or create custom:
   - **Name**: `Gitea Actions Deploy`
   - **Permissions**:
     - Account → Cloudflare Pages → Edit
     - Zone → Cloudflare Pages → Edit
   - **Account Resources**: All accounts
   - **Zone Resources**: All zones
   - **TTL**: 12 months (or longer)
4. Click **Continue to summary**
5. Click **Create Token**
6. **Copy the token** (you won't see it again)

### Token Looks Like
```
WG7E8x3Qk5K_9x4y1z2a3b4c5d6e7f8g9h0i
```

---

## Step 2: Add Secret to Gitea Repository

### Method 1: Via Gitea Web Interface

1. Go to repository → **Settings**
2. Find **Actions** or **Secrets** section
3. Click **Add Secret** or **New Secret**
4. Fill in:
   - **Name**: `CLOUDFLARE_API_TOKEN`
   - **Value**: [Paste your Cloudflare API token from Step 1]
5. Click **Save** or **Create**

### Method 2: Via Gitea CLI (if available)

```bash
# Create secret via gitea-cli
gitea admin user change-password --username=<user> --password=<new-password>

# Or manually via web interface (Method 1 above)
```

### Verify Secret Added

1. Go back to repository Settings
2. Under Secrets, you should see: `CLOUDFLARE_API_TOKEN` (value hidden)

---

## Step 3: Enable Actions in Repository Settings

### Verify Actions Enabled

1. Repository → **Settings**
2. Look for **Actions** section
3. Ensure **Enable Actions** is checked
4. Optionally:
   - Set workflow approval (require approval for external PRs)
   - Configure runner options
   - Set retention policy

---

## Step 4: Test the Workflow

### Create a Test Pull Request

1. Create a new branch:
   ```bash
   git checkout -b test/gitea-actions
   ```

2. Make a small change (e.g., update comment in index.html):
   ```bash
   # Edit index.html
   git add index.html
   git commit -m "test: Gitea Actions workflow trigger"
   git push origin test/gitea-actions
   ```

3. Create Pull Request in Gitea

4. Watch the Actions:
   - Go to PR → **Checks** or **Actions** tab
   - Should see workflow running
   - Wait for completion (2-5 minutes)

### Verification

✅ **PR Deployment Preview**
- Workflow completes with green checkmark
- Comment appears on PR with preview URL
- Preview URL is accessible: `https://pr-XXX---rsvpex-landing.pages.dev`

✅ **Preview Works**
- Visit preview URL
- Page loads correctly
- Form is functional

### Merge to Production

If PR test was successful:

1. Click **Merge** on PR
2. Watch for deployment to production
3. Verify at **https://rsvpex.com**

---

## Workflow File Structure

### Location
```
.gitea/
└── workflows/
    └── deploy.yml
```

### Important: Gitea Actions vs GitHub Actions

⚠️ **This workflow uses Gitea Actions syntax**, not GitHub Actions. Key differences:

| Feature | GitHub Actions | Gitea Actions |
|---------|---|---|
| Checkout | `uses: actions/checkout@v3` | `git clone` + `git checkout` |
| Setup | `uses: actions/setup-node@v3` | Manual install via `apt` or download script |
| Context variables | `${{ github.event_name }}` | `${{ gitea.event_name }}` |
| Comment PR | `uses: actions/github-script@v6` | Direct API call with `curl` |
| Runner | `runs-on: ubuntu-latest` | `runs-on: ubuntu-latest` |

**Do NOT use GitHub Actions actions** (e.g., `actions/checkout@v3`) in this workflow. They will not work in Gitea Actions.

### Triggers

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches:
      - main
  push:
    branches:
      - main
```

**Explanation**:
- Runs on: PR creation, PR updates, pushes to main
- Does NOT run on: Comments, push to other branches

### Deployment Logic

```yaml
jobs:
  deploy:
    - Checkout code
    - Setup Node.js
    - Install Wrangler CLI
    - IF pull_request: Deploy to preview (staging)
    - IF push: Deploy to production
    - Comment PR with preview URL
```

---

## Monitoring Deployments

### In Gitea

1. Repository → **Actions** tab
2. View all workflow runs
3. Click run to see logs:
   - Checkout
   - Install Wrangler
   - Deploy output
   - Status (success/failed)

### On Cloudflare

1. Dashboard → **Pages**
2. Project: `rsvpex-landing`
3. Go to **Deployments**
4. View all deployment history
5. Rollback if needed

### In Pull Requests

- Comment automatically added with preview URL
- Links to live staging environment
- Updates on each push to PR

---

## Troubleshooting

### "Cannot find: node in PATH"

**Issue**: Workflow fails with "Cannot find: node in PATH"

**Root Cause**: The workflow was using GitHub Actions syntax (`actions/checkout@v3`, `actions/setup-node@v3`) which is incompatible with Gitea Actions.

**Solution**: ✅ The workflow has been updated to use Gitea Actions syntax. Key changes:
- Replaced `uses: actions/checkout@v3` with manual `git clone` + `git checkout`
- Replaced `uses: actions/setup-node@v3` with NodeSource repository setup script
- Changed context variables from `github.*` to `gitea.*`
- Changed PR commenting from GitHub script to direct Gitea API call with `curl`

**If you still see this error**:
1. Clear workflow cache and retry: Repository → Actions → click workflow → Re-run
2. Ensure `.gitea/workflows/deploy.yml` has been updated (check file contents)
3. Check that Node.js installation script runs without errors in logs

### Workflow Not Running

**Issue**: PR created but no workflow run appears

**Solutions**:
1. Check Actions enabled in repository settings
2. Verify `.gitea/workflows/deploy.yml` exists
3. Workflow file might have YAML syntax errors → check for red X
4. Check branch name matches trigger (must be `main`)

### Deployment Failed

**Issue**: Workflow runs but deployment fails

**Check logs for these errors**:

#### "Authentication failed"
```
Error: CLOUDFLARE_API_TOKEN not found or invalid
```

**Solution**:
- Verify secret added to repository: Settings → Secrets
- Check secret name exactly: `CLOUDFLARE_API_TOKEN`
- Regenerate Cloudflare API token if >1 year old

#### "Project not found"
```
Error: Project rsvpex-landing not found
```

**Solution**:
- Verify Cloudflare Pages project exists
- Check project name in workflow: `--project-name=rsvpex-landing`
- Ensure project is accessible with API token permissions

#### "Permission denied"
```
Error: Insufficient permissions to access this resource
```

**Solution**:
- Regenerate API token with correct scopes:
  - Account → Cloudflare Pages → Edit
  - Zone → Cloudflare Pages → Edit
- Ensure token hasn't expired

### Preview URL Not Accessible

**Issue**: Workflow succeeds but preview URL returns 404/error

**Solutions**:
1. Wait 2-3 minutes for deployment to propagate
2. Clear browser cache
3. Check Cloudflare Pages deployment status in dashboard
4. Verify file paths in HTML (relative paths work correctly)

### No Comment on PR

**Issue**: Workflow succeeds but no preview URL comment appears

**Solutions**:
1. Check GitHub/Gitea script permissions
2. Verify PR is not from a fork (permissions may be restricted)
3. Check Gitea issues/PRs settings allow comments
4. Review workflow logs for `Create comment` step

---

## Environment Variables (Optional)

### Current Configuration

The workflow uses these environment variables:

```yaml
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Optional Additions

If needed in future, you can add:

```yaml
env:
  CLOUDFLARE_ACCOUNT: ${{ secrets.CLOUDFLARE_ACCOUNT }}
  WEB3FORMS_ACCESS_KEY: ${{ secrets.WEB3FORMS_ACCESS_KEY }}
```

Then reference in workflow steps.

---

## Security Considerations

### API Token Safety

- ✅ Token stored as repository secret (encrypted in Gitea)
- ✅ Token only accessible during workflow runs
- ✅ Token never displayed in logs (masked automatically)
- ✅ Token not committed to git

### Best Practices

1. **Rotate tokens regularly**: Update every 6-12 months
2. **Use least privilege**: Only grant necessary scopes
3. **Monitor usage**: Check Cloudflare API logs for unusual activity
4. **Revoke if needed**: Delete from Cloudflare + Gitea if compromised

---

## Updating the Workflow

### To Change Deployment Logic

Edit `.gitea/workflows/deploy.yml`:

```bash
# Edit file
nano .gitea/workflows/deploy.yml

# Commit changes
git add .gitea/workflows/deploy.yml
git commit -m "ci: Update deployment workflow"
git push
```

Changes take effect on next PR/push.

### Common Customizations

**Change deployment branch**:
```yaml
branches:
  - main
  - production  # Add another branch
  - 001-landing-page
```

**Add more jobs** (e.g., testing):
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run test  # Add your test command

  deploy:
    needs: test  # Require test to pass first
    runs-on: ubuntu-latest
    # ... deployment steps
```

**Add manual approval**:
```yaml
environment:
  name: production
  # Requires manual approval from maintainers
```

---

## Disabling the Workflow

### Temporarily Disable

```yaml
# Add to top of deploy.yml:
on:
  pull_request:
    types: [opened]
  # Remove 'push' section
```

### Permanently Disable

```bash
# Delete workflow file
rm .gitea/workflows/deploy.yml
git add .gitea/workflows/
git commit -m "ci: Disable Gitea Actions deployment"
git push
```

Or rename to `.disabled`:
```bash
mv .gitea/workflows/deploy.yml .gitea/workflows/deploy.yml.disabled
```

---

## Support & Debugging

### Gitea Actions Documentation
- Gitea Actions Docs: https://gitea.com/gitea/act_runner

### Cloudflare Wrangler
- Wrangler CLI Docs: https://developers.cloudflare.com/workers/wrangler/

### Common Issues
- Check workflow file for YAML syntax errors
- Verify secret name and value
- Check Cloudflare API token scopes
- Review Gitea Actions logs for detailed errors

---

## Next Steps

After setup is complete:

1. ✅ Create test PR → Verify preview deployment
2. ✅ Merge PR → Verify production deployment
3. ✅ Monitor deployments in Gitea Actions tab
4. ✅ Update team about automated deployments

**Automated deployment is now active!** 🚀

---

## Quick Reference

| Task | Location |
|------|----------|
| Edit workflow | `.gitea/workflows/deploy.yml` |
| View workflow runs | Repository → Actions |
| Add secrets | Repository → Settings → Secrets |
| Check deployments | https://dash.cloudflare.com → Pages |
| View PR preview | PR → Actions comment with link |
| Rollback deployment | Cloudflare dashboard → Deployments |

---

Questions? Refer to `DEPLOYMENT.md` or contact hello@rsvpex.com
