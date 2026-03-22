# Deployment File Exclusions

This document explains which files are deployed to production and which are excluded.

## Configuration

Files are controlled by `wrangler.toml`:
- `exclude` - Files/patterns NOT deployed
- `include` - Files/patterns that ARE deployed (overrides exclude)

## Excluded Files

### Documentation (Not needed on live site)
```
*.md              # All markdown files (README, DEPLOYMENT, TESTING, etc.)
CLAUDE.md         # Development instructions
```

### Configuration & Secrets
```
.env              # Environment variables (NEVER deploy)
.env.sample       # Sample config (documentation only)
wrangler.toml     # Wrangler configuration
```

### Development Tools
```
.git/             # Git repository
.gitea/           # Gitea Actions workflows
.github/          # GitHub Actions (if any)
.gitignore        # Git ignore rules
.specify/         # Development tool configs
.claude/          # Claude development commands
specs/            # Feature specifications
```

### Package Management
```
package.json      # NPM configuration
package-lock.json # NPM lock file
pnpm-lock.yaml    # PNPM lock file
yarn.lock         # Yarn lock file
node_modules/     # Installed dependencies
```

### CI/CD Configuration
```
*.yml             # YAML config files
*.yaml            # YAML config files
```

## Included Files

These files ARE deployed to production:

### Web Pages
```
index.html        # Home page
thank-you.html    # Form submission confirmation
```

### Styles & Scripts
```
css/main.css      # Stylesheet
js/main.js        # JavaScript
images/           # Image assets
```

### SEO & Meta
```
robots.txt        # Search engine crawling rules
sitemap.xml       # Site map for indexing
```

## Why This Matters

### Security
- `.env` and `.env.sample` are NOT deployed (prevents secret exposure)
- `wrangler.toml` is NOT deployed (contains account info)

### Performance
- Markdown files reduce payload size (~50KB saved)
- Node modules excluded (not needed for static site)
- Specs/documentation not served to users

### User Experience
- Only necessary files are deployed
- Smaller deployment package
- Faster CDN distribution

## Adding New Exclusions

To exclude additional files from deployment:

1. Edit `wrangler.toml`
2. Add pattern to `exclude` array:
   ```toml
   exclude = [
     "*.backup",     # Exclude all backup files
     "temp/",        # Exclude temp directory
   ]
   ```
3. Commit and push
4. Next deployment will use new exclusions

## Verifying Deployed Files

To see what Wrangler will deploy:

```bash
# Dry-run deployment (shows files without uploading)
wrangler pages deploy . --dry-run --project-name=rsvpex-landing
```

## Questions

If you need to deploy additional files:
1. Add to `include` array in `wrangler.toml`
2. Or remove from `exclude` array
3. Test with `--dry-run` flag before production deployment
