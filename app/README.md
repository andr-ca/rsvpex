# RSVPex — Worker App

Cloudflare Workers + D1 + Queues app implementing the RSVP form, admin dashboard, and
notification pipeline. See the repo root `CLAUDE.md` for full stack/architecture context.

## First deploy (one-time setup)

`wrangler.jsonc` ships with `PLACEHOLDER` resource IDs — the deploy workflow
(`.github/workflows/deploy-app.yml`) refuses to run until they're replaced.

1. **Provision Cloudflare resources:**
   ```bash
   wrangler d1 create rsvpex-db
   wrangler kv namespace create RATE_LIMIT_KV
   wrangler queues create rsvpex-notifications
   wrangler queues create rsvpex-notifications-dlq
   ```
   Copy the returned `database_id` / KV `id` into `wrangler.jsonc`.

2. **Set secrets** (never in `vars` — see the comment in `wrangler.jsonc` for why):
   ```bash
   wrangler secret put TURNSTILE_SECRET_KEY
   wrangler secret put RESEND_API_KEY
   wrangler secret put ADMIN_FROM_EMAIL
   wrangler secret put TWILIO_ACCOUNT_SID      # optional, only if SMS is used
   wrangler secret put TWILIO_AUTH_TOKEN       # optional
   wrangler secret put TWILIO_FROM_NUMBER      # optional
   wrangler secret put SETUP_SECRET            # gates /rsvp/admin/setup — see below
   wrangler secret put IP_HASH_KEY             # HMAC key for hashed IP addresses
   wrangler secret put ARGON2_PEPPER           # pepper mixed into every admin password hash
   ```

3. **Set public vars** in `wrangler.jsonc` (`vars` block — these are fine to be public,
   they end up in rendered HTML or match the browser's own address bar):
   - `TURNSTILE_SITE_KEY` — from the Cloudflare Turnstile dashboard
   - `DEPLOYMENT_DOMAIN` — the app's own origin, e.g. `https://rsvp.example.com`. Used to
     build absolute links in outbound emails/SMS and to validate the CSRF `Origin` header.
     **Required** — admin mutations fail closed without it (see `middleware/csrf.ts`).

4. **Set GitHub Actions secrets** (repo settings → Secrets → Actions):
   - `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (shared with the static-site deploy)

5. **Push to `main`** — `deploy-app.yml` runs lint/typecheck/test, applies D1 migrations,
   then deploys the Worker.

6. **Create the first admin account:** visit `/rsvp/admin/setup` and submit the
   `setup_secret` field along with your email/password. The route 409s once an admin
   exists, so this is safe to leave reachable afterward.

## Local development

```bash
cd app
npm install
cp .dev.vars.sample .dev.vars   # fill in secrets for local testing
npm run migrate:local           # applies migrations to local D1 (SQLite via Miniflare)
npm run dev                     # wrangler dev — full Workers runtime locally
```

Visit `http://localhost:8787/rsvp/admin/setup` to bootstrap a local admin account
(`.dev.vars`'s `SETUP_SECRET`, or leave `SETUP_SECRET` unset to skip the check in dev).

## Tests

```bash
npm test              # vitest, runs in the real Workers runtime via Miniflare
npm run typecheck
npm run lint
```

Coverage thresholds are declared in `vitest.config.ts` but not currently enforced —
`@cloudflare/vitest-pool-workers` doesn't yet support V8/Istanbul instrumentation inside
the Workers runtime. See the comment in `vitest.config.ts` for tracking status.

## Backup / restore

D1 supports point-in-time recovery via Time Travel (30-day window on the free plan):

```bash
wrangler d1 time-travel info rsvpex-db
wrangler d1 time-travel restore rsvpex-db --timestamp=<ISO-8601>
```

For a portable export: `wrangler d1 export rsvpex-db --output=backup.sql`.

## Scheduled jobs

The cron trigger (`wrangler.jsonc`, `triggers.crons`) fires once daily at
**06:00 UTC** — a fixed UTC instant, not "6am event-local time." It runs
three jobs: reminder emails (`reminder_days_before` counted against the
event's own timezone, then sent at this fixed UTC hour regardless of where
the event is), a 365-day audit log purge, and an expired-session/reset-token
purge. Hosts far from UTC should know reminder emails always go out at the
same UTC hour no matter what timezone their event is in.

## Architecture pointers

- `src/index.ts` — Worker entry point: exports `fetch`/`queue`/`scheduled`
- `src/app.ts` — Hono route registration
- `src/domain/` — pure functions, no CF bindings, unit-testable without Miniflare
- `src/routes/` — HTTP handlers; admin routes render server-side HTML (no client framework)
- `src/views/layout.ts` — shared admin page shell + CSRF field helper (every admin
  `<form>` must call `csrfField(csrfToken)` — see `middleware/csrf.ts`)
- `migrations/` — D1 SQL migrations, applied via `wrangler d1 migrations apply`
