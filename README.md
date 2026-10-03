# Mudaala

A local-commerce discovery platform: people post **OFFER** and **REQUEST** listings,
find each other by category and location, compare price/quantity/freshness, and
contact each other directly on WhatsApp or by phone.

Built to the Mudaala product contract - a discovery platform, not an ERP:
no payments, wallets, escrow, delivery dispatch, in-app chat, or transaction
ratings in V1.

## Markets & currency

Mudaala is focused on **Uganda**:

- Ugandan phone numbers (+256, local 07.. formats accepted) drive registration,
  login and all contact fields
- District list is Uganda's towns and regions; the currency is UGX, rendered
  with zero decimals
- **One account does everything** - being a buyer and a seller needs no second
  sign-in. Account → "My Shop" is where a seller names their space; that name
  appears on every listing they publish.

## Product scope (V1 contract)

- OFFER and REQUEST listings - one shared listing engine
- Search, category/location/price/unit/type filters, sorting, real pagination
- Price, quantity, unit, freshness (persisted timestamps), expiry status
- WhatsApp (`wa.me` deep link with prefilled text) and phone (`tel:`) contact
- Optional business profiles (no verification claims - no badges anywhere)
- Saved searches with honest, recomputed match counts
- Notifications generated only by real events (new matches, expiring, expired)
- My Listings: refresh (24h cooldown), edit, mark fulfilled, repost, archive, delete
- Settings → Advanced Settings: PostgreSQL deployment connection

## Stack

- **Next.js 16 (App Router) + TypeScript** - the whole app ships as the `/` route with client-side views synced to the URL hash
- **Prisma + SQLite** - sandbox runtime store. The production target is PostgreSQL; the connection is captured in Settings → Advanced Settings
- **Tailwind CSS 4 + shadcn/ui** - warm neutral palette, dark green primary, restrained radii/shadows
- **TanStack Query** - server state; **Zustand** - view/filter state
- **zod** - shared validation schemas used by BOTH forms and API routes
- **node:crypto scrypt** - password hashing (no extra dependencies)

## Architecture decisions

- **Database is the single source of truth.** Ownership, prices, status and
  timestamps live in typed columns. The server never trusts client-supplied
  ownership, status transitions or authorization claims.
- **Validation is defined once** (`src/lib/validation.ts`) and enforced at the
  API boundary; forms reuse the same schemas for fast feedback.
- **Status transitions are explicit** (`ALLOWED_STATUS_TRANSITIONS` in
  `src/lib/constants.ts`). A fulfilled listing can never silently become active
  through an unrelated edit; only `EXPIRED/ARCHIVED → ACTIVE` reposts restart
  freshness and expiry.
- **Time-dependent logic is real.** `expiresAt`/`refreshedAt` are persisted; an
  idempotent sweep (`src/lib/listings.ts`, also exposed at `POST /api/cron/sweep`)
  expires overdue listings, notifies owners once, and warns about expiring ones.
  In production, point a scheduler at `/api/cron/sweep`.
- **Search filters and paginates in the database** (indexed columns, lowercase
  `searchText` for SQLite case-insensitivity). When you move to PostgreSQL,
  swap `searchText LIKE` for a `tsvector`/GIN index - the query shape stays.
- **Errors are explicit.** Expected failures return typed JSON with field
  errors; unexpected ones are logged server-side and return a generic 500.
  Failed operations never resolve as success on the client.

## Security model

- Sessions: opaque random tokens, stored server-side, 30-day expiry, **two transport channels**:
  an httpOnly cookie (`SameSite=None; Secure` on public hosts, `Lax` on localhost) AND an
  `Authorization: Bearer` header backed by localStorage. The Bearer channel keeps sign-in
  working where browsers drop cookies (e.g. cross-origin preview iframes); a stale token
  self-heals on 401. Login accepts local-format numbers from any supported country by
  resolving them against every dial code.
- Passwords: scrypt with per-user salt, timing-safe comparison
- Ownership enforced server-side on every write; foreign IDs return the same 404
  as missing IDs (existence is never leaked)
- Login failures are identical for unknown phone and wrong password (no account enumeration)
- PostgreSQL credentials entered in Settings are stored server-side and **never
  returned to the browser** (masked connection string, `hasPassword` flag only);
  the connection test performs a real TCP check and honestly reports that
  credentials are not verified

## Getting started

```bash
bun install
# point DATABASE_URL (in .env) at a local PostgreSQL server, then:
bun run db:deploy     # apply migrations (prisma migrate deploy)
bun run db:seed       # development fixtures
bun run dev           # development server on :3000
```

Local development runs against a real PostgreSQL server - the same engine as
production, so search behaviour and migrations never drift between the two.

### Development seed (fixtures - never run in production)

```bash
bun scripts/seed.ts
```

Seeds 8 demo traders across Ugandan districts, 16 listings across
categories/statuses (including one already overdue so the expiry sweep
demonstrates itself) and 2 saved searches with honestly computed counts.
Fixture passwords are `demo1234`; fixture phones are +256 77x/70x demo
numbers (see scripts/seed.ts).

**COPY RULE** - every user-facing string lives in `src/lib/copy.ts` (backend
messages live beside the route that owns them). The voice is plain, direct
English as spoken in Kampala: short sentences, no slogans, no small-caps
eyebrow labels, none of the template words (seamless, empower, discover,
unlock). No em dashes and no en dashes anywhere in the repo (UI copy, backend
messages, comments); plain periods, commas, colons and hyphens carry the
meaning. Test 18 fails the suite if an AI-tell dash or a template word lands
in the codebase.

**PLACEHOLDER RULE** - this repo ships NO placeholder images at all: the seed
creates listings and shops with no photos, and every surface falls back to the
neutral grey tile (category name / shop name + camera icon). No stock photos,
no AI images, no hero photos. Seed rows are flagged `isSeed = true`; before
launch, remove the whole fixture dataset in one step:

```bash
npx tsx scripts/remove-seed-data.ts          # dry-run: see what would go
npx tsx scripts/remove-seed-data.ts --yes    # delete seed rows (and any seed photo files left from older checkouts)
```

Run that BEFORE any production data copy or cloud migration - the copy
should carry only real accounts and real listings, never fixtures. The
cloud photo migration (`scripts/migrate-uploads-to-s3.ts`) is seed-safe on
its own: it uploads only real user photos (the seed folder is excluded)
and never rewrites a seed photo path to a bucket URL.

Wherever a photo is missing, the app shows the neutral placeholder tile
(flat grey, category name, small camera icon) - no stock, AI-generated or
illustrated images ship in production. Seed photos never reach sitemaps,
Open Graph previews or cloud storage.

### API behavior & security tests

With the dev server running:

```bash
bun scripts/test-api.ts
```

Hundreds of assertions covering: auth (incl. no account enumeration), listing
validation, ownership boundaries (positive AND negative), status transition
rules, refresh cooldown, real expiry sweep + notifications, saved-search
matching and permissions, notification permissions, reports + moderation,
password reset by SMS code, legal pages + terms acceptance, rate limits, CSRF,
security headers, photo storage (EXIF strip + 1200px WebP) and /api/health.

## Deploying

Mudaala runs as a standard Next.js (standalone output) application in front of
a PostgreSQL database, with photos in any S3-compatible bucket.

### 1. Environment variables

Copy `.env.example` to `.env` and fill real values. Required in production
(the app refuses to boot without them - see `src/lib/env.ts`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (`postgresql://user:pass@host:5432/mudaala`) |
| `NEXT_PUBLIC_APP_URL` | Canonical public origin - ad pages, OG tags, sitemap anchor to it |
| `CRON_SECRET` | Shared secret the scheduler presents to `POST /api/cron/sweep` |
| `SETTINGS_ENCRYPTION_KEY` | AES-256-GCM key material for secrets stored at rest |
| `ADMIN_PHONES` | Comma-separated admin phone numbers (E.164, Uganda +256) |

Optional / recommended:

| Variable | Purpose |
| --- | --- |
| `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_KEY`, `STORAGE_SECRET`, `STORAGE_PUBLIC_URL` | S3-compatible photo storage (Cloudflare R2, Supabase Storage, MinIO). Unset = local disk in development. |
| `AT_API_KEY`, `AT_USERNAME`, `AT_SENDER_ID` | Africa's Talking credentials for password-reset SMS. Unset (non-production) = console provider. |
| `FRAME_ANCESTORS` | CSP `frame-ancestors` value - set `'none'` in production unless you embed the app somewhere. |
| `ALLOW_BEARER_AUTH` | Leave UNSET in production (httpOnly cookie only). |

### 2. Run migrations

```bash
bun install
bun run db:deploy     # prisma migrate deploy - applies pending migrations
bun run db:generate   # (re)generate the Prisma client if needed
```

Migrations live in `prisma/migrations/` and are plain SQL - a fresh database
becomes fully current with `prisma migrate deploy`. (The pre-PostgreSQL SQLite
migration history is archived in `prisma/migrations-sqlite/` for reference.)
Optional performance step: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` enables
trigram indexes on listing text if search volume ever justifies it.

Coming from the SQLite era? `npx tsx scripts/migrate-sqlite-to-postgres.ts` copies
every table (users, sessions, listings, reports, settings…) from the old
`db/*.db` file into the new PostgreSQL database, preserving ids and dates; run
it once with the old file present, after `db:deploy`. Photo files can follow
their URLs to the bucket with `npx tsx scripts/migrate-uploads-to-s3.ts`.

### 3. The daily cron call

Listing expiry, expiring-soon notices, price medians and stale password-reset
cleanup all run through one idempotent endpoint. Schedule a POST every few
minutes (system crontab, Supabase pg_cron via pg_net, GitHub Actions, or any
uptime pinger that can send a header):

```bash
curl -X POST https://your-domain.example/api/cron/sweep \
  -H "x-cron-secret: $CRON_SECRET"
```

The endpoint refuses to run without the matching secret (constant-time
comparison), and fails closed if `CRON_SECRET` is not configured.

### 4. Health checks

`GET /api/health` returns `{"ok":true,"app":"up","database":"up"}` (200) when
both the process and the database are healthy, and 503 when the database is
unreachable - point your load balancer or uptime monitor at it.

## Where things live

```
prisma/schema.prisma          data model (User, Session, BusinessProfile, Listing, SavedSearch, Notification, AppSetting)
src/lib/constants.ts          categories, units, counties, business rules (active days, cooldown, transitions)
src/lib/validation.ts         shared zod schemas + phone normalization
src/lib/listings.ts           search, expiry sweep, refresh rules, saved-search matching
src/lib/auth.ts               scrypt hashing, sessions, dual-channel (cookie + Bearer)
src/lib/postgres-settings.ts  advanced-settings storage + real TCP connectivity test
src/app/api/…                 route handlers (auth, listings, saved-searches, notifications, profile, settings, cron)
src/components/commerce/      feature UI (browse, detail, publish, my-listings, saved, alerts, account, settings)
scripts/seed.ts               development fixtures
scripts/migrate-sqlite-to-postgres.ts  one-off SQLite → PostgreSQL data copy
scripts/migrate-uploads-to-s3.ts       one-off photo migration to the bucket
src/lib/storage.ts           photo storage interface (local disk + S3-compatible)
scripts/test-api.ts           behavior + security boundary tests
```
