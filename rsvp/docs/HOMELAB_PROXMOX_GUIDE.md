
# Homelab Deployment on Proxmox + Cloudflare Tunnel (RSVP Micro‑Site)

This blueprint gets you online safely from a homelab with tiny cost. It assumes **Proxmox VE 8**, a single node, and Cloudflare DNS.

---

## 0) Why this design
- **No public IP or port‑forwarding**: Cloudflare Tunnel makes an outbound connection from your VM to Cloudflare.
- **Edge security**: CDN, WAF, TLS, Turnstile, and Access (Zero Trust) without exposing your LAN.
- **Simple ops**: one VM, Docker Compose, nightly backups; easy to scale up later.

---

## 1) Topology

[Internet] → HTTPS → [Cloudflare Edge (DNS+WAF+TLS)]
             (tunnel mTLS)
        [cloudflared] → (localhost HTTP) → [Docker: app (Next.js), Postgres, Redis] → [Proxmox VM]

- Tunnel terminates at Cloudflare; your VM only opens **outbound** to Cloudflare.
- Admin path `/rsvp/admin` is additionally protected by **Cloudflare Access** (OTP/email/SAML).

---

## 2) VM Sizing & Storage

**Single‑VM (Tier A)**
- vCPU: **2** (ARM/Intel OK)
- RAM: **4 GB** (8 GB if you expect >10 POST/s bursts)
- Disk: **40–60 GB** (ZFS or ext4)
- Network: Stable uplink (10–50 Mbps up is plenty)

**Proxmox notes**
- Enable **QEMU guest agent** for clean backups.
- If using ZFS: dedicate a dataset for Postgres with `sync=on`, `recordsize=16K`, `atime=off`.
- Backups: Proxmox Backup Server or off‑box rsync to NAS.

---

## 3) Security checklist
- Keep VM **firewalled** to LAN only; **no inbound port‑forward** from router.
- Cloudflare: set **proxied DNS** (orange cloud) for your domain.
- **Cloudflare Turnstile** on public RSVP form (server‑side verify on submit).
- **Cloudflare Access** policy for `/rsvp/admin` (email OTP or IdP).
- OS: unattended upgrades; fail2ban (SSH); non‑root user + sudo; SSH keys only.
- App: `.env` from Proxmox secrets/Cloud‑init; never commit secrets.

---

## 4) Step‑by‑step

1. **Create VM** in Proxmox (Debian 12). Add `qemu-guest-agent`.
2. Install Docker & Compose v2.
3. Clone your app repo to `/opt/rsvp`.
4. Put the supplied `docker-compose.yml` and `.env.example` in `/opt/rsvp` and fill envs.
5. Install **cloudflared** (`apt install cloudflared` or official .deb). Login and create a Tunnel; note **TUNNEL_ID** and place credentials JSON in `/etc/cloudflared/`.
6. Put the supplied `/etc/cloudflared/config.yml` (edit your domain, tunnel id).
7. `docker compose up -d` (app, Postgres, Redis).
8. `systemctl enable --now cloudflared`.
9. In Cloudflare Zero Trust → **Access**: create a policy for `https://rsvp.yourdomain.com/rsvp/admin/*`.
10. In Cloudflare Turnstile: create a site key; add it to your app env; implement server verify call.

Backups:
- Nightly `pg_dump` to encrypted file in R2/B2 (lifecycle 7–30 days). Optionally snapshot the VM with Proxmox Backup.

---

## 5) Observability
- Enable health checks via Uptime Kuma (self) or an external service.
- Log shipping: `docker logs` to Loki/Vector (optional).
- Metrics: built‑in app `/metrics` (if enabled) or node exporter on VM.

---

## 6) Scaling later
- Add another Proxmox VM for read‑only analytics or move Postgres to a managed DB.
- Run a second `cloudflared` connector for extra resilience (even on same VM).

---

## 7) ISP & power caveats
- Some ISPs throttle or forbid hosting; Tunnel hides 443, but your uplink stability still matters.
- Consider a **UPS** and router auto‑reboot; multi‑WAN if critical.

---

## 8) What you’ll configure in Cloudflare
- DNS: `rsvp.yourdomain.com` → proxied (orange cloud).
- Zero Trust Access: policy targeting `/rsvp/admin/*` (emails/IdP).
- Turnstile: site+secret keys; server verify endpoint in your app.
- Tunnel: route `rsvp.yourdomain.com` → `http://localhost:3000` via `cloudflared`.
