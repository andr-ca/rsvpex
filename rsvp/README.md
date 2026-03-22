
# RSVP Micro‑Site (Self‑Hosted & Cloud‑Ready)

A lightweight, privacy‑respecting RSVP micro‑site with an **admin dashboard** and a **guest RSVP flow**. Designed to be **self‑hosted on Proxmox** behind **Cloudflare Tunnel** (cost‑efficient, no router port‑forwards) and equally ready for a cloud‑managed deployment.

> Admin path: `/rsvp/admin` (email/password + 2FA support).  
> Guest path: `/rsvp/:slug` → RSVP → Thank‑you (optional wishlist link).

---

## ✨ Features (highlights)

- Create/manage events (public, unlisted, private with access token).  
- **Kids events**: defaults & validation for children (+ ages), optional parents/siblings.  
- RSVP with **name**, **email or phone**, **party size** (adults/children/parents/siblings), **dietary** (predefined + free‑form), and **notes**.  
- Admin dashboard: totals, charts, RSVP list, filtering, **exports** (CSV/JSON).  
- **Waitlist** (optional), capacity enforcement, duplicate prevention (hard + heuristic).  
- Thank‑you page + optional **wishlist** link.  
- Audit log (PII‑redacted), rate‑limits, CAPTCHA (Cloudflare Turnstile).  
- I18n (public UI locale); WCAG‑minded form and admin a11y.  

---

## 🧱 Tech Stack

- **App**: Next.js 15, TypeScript, Tailwind + shadcn/ui, react‑hook‑form + zod, Chart.js, qrcode, date‑fns‑tz.  
- **Backend**: Node 20, Next.js Route Handlers, **Drizzle ORM**, BullMQ (Redis).  
- **DB/Cache**: PostgreSQL 14+ (JSONB), Redis 7.  
- **Edge**: Cloudflare DNS/CDN/WAF/TLS + **Tunnel**; Access on `/rsvp/admin/*`; Turnstile on public RSVP.  
- **Security**: argon2id, optional HIBP k‑anon check, CSRF + Origin, CSP, audit logs.  
- **Obs**: pino JSON logs, OTEL traces (custom spans), optional Prometheus metrics.

---

## 🗺️ Architecture & Schema

- Architecture (Gitea‑first CI/CD): **v5.2** → `rsvp_architecture_v5_2_gitea.md`  
- Architecture (Gitea‑first intro): **v5.1** → `rsvp_architecture_v5_1_gitea.md`  
- Self‑host blueprint (Proxmox + Tunnel): `HOMELAB_PROXMOX_GUIDE.md`  
- **SQL schema** (consolidated): **v5.3** → `rsvp_schema_v5_3.sql`

All of the above are included in the downloadable pack(s) shared in this project.

---

## 🧩 Repository Layout (suggested)

```
.
├─ apps/
│  └─ web/                 # Next.js app (SSR + API routes)
├─ packages/
│  ├─ db/                  # Drizzle schema & migrations
│  └─ worker/              # (optional) BullMQ workers
├─ infra/
│  ├─ docker/              # Compose, cloudflared, systemd units
│  └─ k6/                  # Load tests
└─ .gitea/workflows/       # Gitea Actions workflows
```

> Monorepo is suggested but not required. Adjust paths in workflows accordingly.

---

## 🛠️ Local Development

**Prereqs**: Node **20+**, pnpm **9+**, Docker (for Postgres/Redis), Git.

1) Install deps
```bash
corepack enable && corepack prepare pnpm@9 --activate
pnpm install
```

2) Start Postgres + Redis (dev)
```bash
docker run -d --name pg -p 5432:5432 -e POSTGRES_DB=rsvp -e POSTGRES_USER=rsvp -e POSTGRES_PASSWORD=change_me postgres:16
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

3) Environment
```bash
cp .env.example .env    # fill DATABASE_URL, REDIS_URL, SESSION_SECRET, CAPTCHA keys, etc.
```

4) Migrate DB (Drizzle)
```bash
pnpm drizzle:push
```

5) Run app
```bash
pnpm dev      # or pnpm start after a production build
```

---

## 🐳 Docker Compose (self‑host or local)

Use the provided Compose in the homelab pack (app + Postgres + Redis), or adapt to your repo.

- **Start:** `docker compose up -d`  
- **Logs:** `docker compose logs -f`  
- **Migrate:** `docker compose exec -T web pnpm drizzle:push`  
- **Health:** `curl http://localhost:3000/rsvp/healthz`

---

## 🔐 Configuration (env)

Common environment variables (see `.env.example` for the full list):

```
NODE_ENV, PORT, BASE_URL, SESSION_SECRET
DATABASE_URL=postgres://rsvp:change_me@db:5432/rsvp
REDIS_URL=redis://redis:6379/0

# Cloudflare Turnstile
CAPTCHA_PROVIDER=turnstile
CAPTCHA_SITE_KEY=...
CAPTCHA_SECRET_KEY=...

# Email/SMS (optional)
POSTMARK_API_TOKEN=...
SENDGRID_API_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...

# Defaults
DEFAULT_ENABLE_HEURISTIC_DUP_CHECK=false
DEFAULT_REMINDER_DAYS_BEFORE=7
```

---

## 🧪 Testing & Coverage

- **Unit**: `pnpm test` (Vitest).  
- **Coverage (global, ≥80%)**: `pnpm test -- --coverage`  
- **Coverage (critical, 100%)**: `CRITICAL_ONLY=1 pnpm test -- --coverage`  
- **E2E + a11y** (Playwright + axe): `pnpm --filter ./apps/web test:e2e`  
- **Load (k6)**: `k6 run load-test.js` (see `RSVP_URL` env).

> Coverage thresholds are enforced in CI; see `vitest.config.ci.example.ts` and `.gitea/workflows/ci.yml`.

---

## 🤖 CI/CD — Gitea‑first

Workflows live under **`.gitea/workflows/`**:

- `ci.yml`: lint → typecheck → unit (coverage) → e2e (with Postgres/Redis services).  
- `deploy-selfhost.yml`: build Docker image → push to **Gitea Container Registry** → SSH to Proxmox host → `docker compose up -d` → DB migrations → health check.  
- `load-test.js`: k6 burst/mixed/duplicate‑heavy scenarios.  
- `runner.config.yaml`: sample **act_runner** config for your Proxmox runner.

**Secrets to set (repo/org):**
`REGISTRY_HOST, REGISTRY_IMAGE, REGISTRY_USERNAME, REGISTRY_PASSWORD, SSH_HOST, SSH_USER, SSH_PORT, SSH_PRIVATE_KEY` (+ optional `RSVP_URL` for k6).

---

## 🚀 Production (Self‑Hosted on Proxmox + Cloudflare)

- **Proxmox VM** (Debian 12): 2 vCPU / 4–8 GB RAM / 40–60 GB disk.  
- **cloudflared** Tunnel → `rsvp.yourdomain.com` → app on `localhost:3000`.  
- Protect `/rsvp/admin/*` with **Cloudflare Access**. Add **Turnstile** to public form.  
- `docker compose up -d` (app, Postgres, Redis).  
- Nightly **pg_dump** to R2/B2 (7–30d lifecycle); weekly restore drill.  
- CDN purge + `revalidateTag('event:'+slug)` after event updates.

See: `HOMELAB_PROXMOX_GUIDE.md`

---

## 🔎 Security Checklist

- Strong **argon2id** password hashing; optional **HIBP** k‑anon check.  
- **2FA + Recovery Codes** for admins (print/CSV/QR shown once).  
- Rate‑limit login & RSVP POSTs; Turnstile on public form.  
- CSRF double‑submit + Origin checks; strict **CSP**.  
- Admin **audit log** (PII redacted).  
- Sessions rotate; nightly eviction of expired rows.  
- No public inbound ports on VM; all traffic goes via **Cloudflare Tunnel**.

---

## 🗄️ Data Model

- Latest DDL: **`rsvp_schema_v5_3.sql`**  
  - `events.questions` is a JSONB **array** (app validates shape).  
  - `rsvps.party_total` is a **generated column** to assist server checks and reporting.  
  - Partial uniques for `(event_id, email)` and `(event_id, phone)`; combined key for email+phone.  
  - Indexes for dietary JSONB, audit `action`, tokens, etc.

Use **Drizzle** migrations for application changes; SQL file works for cold installs.

---

## 📡 Minimal API (guest/admin excerpt)

- **GET** `/rsvp/:slug` → render form (respect `opens_at/closes_at`, visibility, access token for private).  
- **POST** `/api/rsvp/submit` → validate + capacity lock + duplicate checks + thank‑you redirect.  
- **GET** `/rsvp/:slug/thanks?rid=<token>` → show confirmation (no PII leakage).  
- **Admin**: `/rsvp/admin/*` (Cloudflare Access + app auth), events CRUD, RSVPs view/export.

---

## 📚 Docs & Traceability

- ADRs in architecture docs (ADR‑001…ADR‑009).  
- **JSDoc** on exported functions/classes must include tags: `@req` (requirement IDs) and `@adr` (decision IDs).  
- ESLint + `eslint-plugin-jsdoc` enforce presence of tags for domain/API layers.

---

## 🧯 Runbooks (short)

- **Backup:** nightly `pg_dump -Fc` → R2/B2; encrypt (age) + lifecycle (7–30d).  
- **Restore:** bring up fresh DB → `pg_restore --clean` → run migrations → smoke tests.  
- **Secret rotation:** change `SESSION_SECRET` quarterly (dual‑key window 7d).  
- **Rollback:** redeploy previous image tag; `drizzle:revert` if needed.

---

## 🧾 License & Contributing

- Choose a license (e.g., MIT); add `LICENSE` file.  
- PRs must pass CI (lint, typecheck, tests, coverage thresholds, e2e).  
- New/changed exported symbols require `@req` and `@adr` JSDoc tags.

---

## 🆘 Support

Open an issue in your Gitea instance or start a discussion thread.  
For production incidents, follow the runbooks above and capture logs/trace IDs.

---

Happy hosting! 🥂
