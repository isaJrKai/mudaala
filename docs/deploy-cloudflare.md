# Mudaala — Launch on Cloudflare's free plan

The copy-paste path Isaac approved: a **free-forever VM** runs the app, a real
**PostgreSQL** database holds the data, **systemd** keeps it alive through
reboots and crashes, and a **Cloudflare Tunnel** puts your domain on it with
HTTPS — no open ports, no public IP needed, everything on Cloudflare's free
plan. The only money in this whole document is the domain itself, about
$10/year.

Two things are deliberately parked, per Isaac:

- **SMS** — the only feature waiting on it is password reset. Login never
  needed SMS (phone + password). When revenue justifies it, fill in the
  Africa's Talking values in `.env` and reset codes go live (see the SMS
  section at the bottom).
- **Cloudflare Workers** — rebuilding the app for Workers (serverless
  Postgres, new image pipeline, full re-verification) is a project, not a
  step. The app is a server app: it wants an always-on machine, and this
  guide gives it one for free.

---

## The shape of the launch

```
buyer's phone ──▶ Cloudflare edge (HTTPS, DNS, DDoS, free)
                       │  cloudflared tunnel (outbound-only connection)
                       ▼
               Oracle free-forever VM (Ubuntu 22.04)
                 ├─ mudaala.service   (systemd, restarts on crash)
                 ├─ mudaala-sweep.timer (systemd, expiry sweep)
                 └─ PostgreSQL 16     (local, listens on localhost only)
```

- The VM makes only **outbound** connections (the tunnel + package updates).
  No inbound ports are opened — `ufw` denies everything and that is correct.
- HTTPS is issued and renewed automatically at Cloudflare's edge. Nothing to
  run, nothing to renew on the VM.
- Cost: domain ~$10/yr. Everything else $0.

---

## Step 0 — What you need before typing anything

1. **A domain.** Any registrar works; Cloudflare Registrar sells at cost (no
   markup) if you prefer to keep everything in one place. Short, memorable,
   `.com` or `.co.ug` — it is printed on every ad page and WhatsApp message.
2. **An Oracle Cloud (Always Free) account** — or any cheap VM you already
   have. Oracle's free tier includes an **ARM Ampere A1** shape: configure
   **1 VM with 4 OCPUs / 24 GB RAM / 200 GB disk**. That single VM is the
   whole infrastructure. (The tiny 1 GB "micro" VMs will not fit a Next.js
   build — take the A1.)
3. About **one hour**.

> Have your own computer at home instead? The guide works identically — skip
> Step 1's cloud parts and note that a home machine must stay powered on and
> re-point the tunnel at it. The VM is still the recommendation: it does not
> sleep when you do.

---

## Step 1 — The VM

Create the instance (Ubuntu 22.04, A1 shape), download the SSH key Oracle
offers, connect, and harden the firewall:

```bash
ssh ubuntu@<VM_PUBLIC_IP>

# close everything — the tunnel connects OUTBOUND, nothing needs to come in
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
```

Oracle's cloud firewall must also allow SSH (port 22) so you can manage the
box: in the Oracle console, the default security list already opens 22. Leave
everything else closed. If you ever lose SSH access, Oracle's console has a
serial fallback.

## Step 2 — PostgreSQL

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install postgresql postgresql-client

sudo -u postgres psql <<'SQL'
CREATE USER mudaala WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE mudaala OWNER mudaala;
SQL
```

Postgres listens on `localhost:5432` only by default — exactly right. The
connection string for later:

```
postgresql://mudaala:CHANGE_ME_STRONG_PASSWORD@localhost:5432/mudaala
```

(Ubuntu 22.04's apt ships Postgres 14 by default; the app only needs a
standard modern Postgres. For 16 specifically, add the
[PGDG apt repo](https://www.postgresql.org/download/linux/ubuntu/) first —
one extra line: `sudo apt -y install postgresql-16 postgresql-client-16`.)

## Step 3 — Bun + the code

```bash
# bun (the runtime the repo is developed and tested on)
curl -fsSL https://bun.sh/install | bash
exec bash   # reload PATH

# a system user and a home for the app (no root-owned app files)
sudo adduser --disabled-password --gecos "" mudaala
sudo mkdir -p /opt/mudaala && sudo chown mudaala:mudaala /opt/mudaala

sudo -iu mudaala
git clone https://github.com/isaJrKai/mudaala.git /opt/mudaala
cd /opt/mudaala
bun install
```

## Step 4 — The `.env`

Copy the template and fill the real values. **Never commit the real file.**

```bash
cp .env.example .env
nano .env
```

Required in production (`.env.example` documents every one of them):

| Key | Value |
|-----|-------|
| `DATABASE_URL` | the postgres string from Step 2 |
| `ADMIN_PHONES` | your phone in E.164, e.g. `+2567…` — the admin desk fails closed without it |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR-DOMAIN` — ad URLs, OG tags and the sitemap anchor here |
| `CRON_SECRET` | `openssl rand -hex 32` — the sweep endpoint demands it |
| `SETTINGS_ENCRYPTION_KEY` | `openssl rand -hex 32` — encrypts stored Postgres settings at rest |
| `ALLOW_BEARER_AUTH` | **leave unset in production** (cookie sessions only) |

Optional but recommended before launch: the four `STORAGE_*` values + `STORAGE_PUBLIC_URL`
switch photo uploads to **Cloudflare R2** (free tier: 10 GB) instead of local
disk — see Step 8. Leave them unset and photos live in `public/uploads` on
the VM, which also works.

## Step 5 — Schema, build, first boot

```bash
cd /opt/mudaala
bunx prisma migrate deploy     # the migrations are real; a fresh box comes up complete
bun run build                  # verified production-clean on Next 16.3.8

NODE_ENV=production bun .next/standalone/server.js   # try it once
# Ctrl-C after "Ready"
```

Want the demo shops on the box while you look around? `bun scripts/seed.ts`.
Going straight to real inventory? Skip the seed — see Step 9.

## Step 6 — systemd (runs forever, restarts on crash)

```bash
exit   # back to your sudo-capable user

sudo tee /etc/systemd/system/mudaala.service >/dev/null <<'UNIT'
[Unit]
Description=Mudaala (Next.js standalone)
After=network.target postgresql.service

[Service]
Type=simple
User=mudaala
WorkingDirectory=/opt/mudaala
EnvironmentFile=/opt/mudaala/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/bun .next/standalone/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now mudaala
curl -s http://localhost:3000/api/health   # -> ok
```

Keep `.env` lines in plain `KEY=value` form (no `export`) so systemd can read
the same file the app does.

The expiry sweep (expired listings → notifications) needs a nudge on a
schedule. A systemd timer on the same box:

```bash
sudo tee /etc/systemd/system/mudaala-sweep.service >/dev/null <<'UNIT'
[Unit]
Description=Mudaala expiry sweep

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -s -X POST -H "x-cron-secret: PUT_YOUR_CRON_SECRET" http://localhost:3000/api/cron/sweep
UNIT

sudo tee /etc/systemd/system/mudaala-sweep.timer >/dev/null <<'UNIT'
[Unit]
Description=Run the Mudaala expiry sweep every 15 minutes

[Timer]
OnCalendar=*-*-* *:00/15:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now mudaala-sweep.timer
```

## Step 7 — Cloudflare Tunnel (the domain, the HTTPS, the free plan)

```bash
# add your domain to Cloudflare (free plan) in the dashboard first:
#   dash.cloudflare.com -> Add a site -> pick the free plan
#   at your registrar, replace the nameservers with the two Cloudflare gives you

curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
# x86 VM? use cloudflared-linux-amd64.deb instead
sudo dpkg -i cloudflared.deb

sudo cloudflared tunnel create mudaala     # prints a tunnel UUID; credentials land in ~/.cloudflared/

sudo tee /etc/cloudflared/config.yml >/dev/null <<'CFG'
tunnel: <TUNNEL-UUID-FROM-CREATE>
credentials-file: /root/.cloudflared/<TUNNEL-UUID-FROM-CREATE>.json
ingress:
  - hostname: YOUR-DOMAIN
    service: http://localhost:3000
  - service: http_status:404
CFG

sudo cloudflared tunnel route dns mudaala YOUR-DOMAIN
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Open `https://YOUR-DOMAIN` — HTTPS padlock issued at the edge, no certbot, no
renewal, no open ports. `curl -sI https://YOUR-DOMAIN/api/health` should say
`200`.

## Step 8 — Photos on Cloudflare R2 (optional, do it before real users)

R2's free tier (10 GB, zero egress fees) holds listing photos so the VM's
disk stays code-only, and redeploys never touch user data:

1. Cloudflare dashboard → R2 → **Create bucket** (`mudaala-photos`).
2. R2 → Manage API tokens → create one; note **endpoint**, **access key**,
   **secret**, and the bucket's **public dev URL** (or a `cdn.` custom domain).
3. Fill `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_KEY`,
   `STORAGE_SECRET`, `STORAGE_PUBLIC_URL` in `.env`, then:

```bash
sudo systemctl restart mudaala
```

New uploads go to R2 immediately; existing local photos stay where they are
(`scripts/migrate-uploads-to-s3.ts` moves them when you want one storage
truth).

## Step 9 — Seed-data purge before real launch

Every shop, listing and photo on a seeded box is a **temporary placeholder**
(`isSeed = true`), meant to be replaced by real photos from real shops. One
command removes all of it and nothing else — safe to run repeatedly:

```bash
cd /opt/mudaala
sudo -iu mudaala
bunx tsx scripts/remove-seed-data.ts          # dry-run: shows what would go
bunx tsx scripts/remove-seed-data.ts --yes    # deletes seed rows + seed photos
```

Run the dry-run, look at the list, then `--yes`. The app is now carrying only
real inventory.

## Step 10 — Launch-day phone checklist

With two phones (yours = the admin phone from `ADMIN_PHONES`, plus any second
phone as the buyer):

1. **Browse as guest** — search, category tabs, listing detail. No login
   walls on the buyer path.
2. **Detail page** — the number is hidden until **Show number** is tapped
   (that is the phone-privacy feature, not a bug). **Call seller** opens the
   dialer pre-filled; **WhatsApp** opens the chat with the intro text.
3. **Cart → basket** — add from two different shops; the cart collects, the
   basket is where each seller gets paid or messaged.
4. **Seller path** — register with the second phone, publish a listing with a
   photo, see it live after refresh.
5. **Admin desk** — sign in with the admin phone, open the admin surface.
6. **Expiry sweep** — wait for the timer (or trigger the sweep by hand); the
   LISTING_EXPIRED notification should appear on expired listings.
7. **Reboot test** — `sudo reboot`, wait a minute, reload the site: tunnel,
   app and database all come back on their own. This is what systemd was for.
8. **Support inbox** — set `SUPPORT_EMAIL` in `.env` before moderating real
   reports.

## SMS (parked, on purpose)

Password reset is the only feature that sends SMS; login never did. When it
is time: create an Africa's Talking account, put `AT_API_KEY`,
`AT_USERNAME`, `AT_SENDER_ID` in `.env`, restart — reset codes go live. Until
then the console provider prints codes into the dev server log only, which is
honest development behavior, not a launch blocker.

## Keeping it alive afterwards

```bash
# updates: pull, rebuild, restart — a two-minute cycle
sudo -iu mudaala && cd /opt/mudaala
git pull && bun install && bunx prisma migrate deploy && bun run build
exit && sudo systemctl restart mudaala

# backups: a nightly dump is cheap insurance
sudo tee /etc/cron.d/mudaala-backup >/dev/null <<'CRON'
15 3 * * * postgres pg_dump mudaala | gzip > /var/backups/mudaala-$(date +\%F).sql.gz
CRON
```

Restore is `gunzip -c <file> | psql mudaala` into a fresh database — test it
once before you need it.
