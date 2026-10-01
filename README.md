# Mudaala

A local-commerce discovery platform: people post **OFFER** and **REQUEST** listings,
find each other by category and location, compare price/quantity/freshness, and
contact each other directly on WhatsApp or by phone.

Built to the Mudaala product contract — a discovery platform, not an ERP:
no payments, wallets, escrow, delivery dispatch, in-app chat, or transaction
ratings in V1.

## Markets & currency

Mudaala launches in **Uganda** (default), with **Tanzania** and **Kenya** supported:

- Country chosen at registration drives the phone format (+256/+255/+254), the
  district/region list, and the default currency (USh/TSh/KSh)
- Each listing stores its own currency; UGX and TZS render with zero decimals
- **One account does everything** — being a buyer and a seller needs no second
  sign-in. Account → "My Shop" is where a seller names their space; that name
  appears on every listing they publish.

## Product scope (V1 contract)

- OFFER and REQUEST listings — one shared listing engine
- Search, category/location/price/unit/type filters, sorting, real pagination
- Price, quantity, unit, freshness (persisted timestamps), expiry status
- WhatsApp (`wa.me` deep link with prefilled text) and phone (`tel:`) contact
- Optional business profiles (no verification claims — no badges anywhere)
- Saved searches with honest, recomputed match counts
- Notifications generated only by real events (new matches, expiring, expired)
- My Listings: refresh (24h cooldown), edit, mark fulfilled, repost, archive, delete
- Settings → Advanced Settings: PostgreSQL deployment connection

## Stack

- **Next.js 16 (App Router) + TypeScript** — the whole app ships as the `/` route with client-side views synced to the URL hash
- **Prisma + SQLite** — sandbox runtime store. The production target is PostgreSQL; the connection is captured in Settings → Advanced Settings
- **Tailwind CSS 4 + shadcn/ui** — warm neutral palette, dark green primary, restrained radii/shadows
- **TanStack Query** — server state; **Zustand** — view/filter state
- **zod** — shared validation schemas used by BOTH forms and API routes
- **node:crypto scrypt** — password hashing (no extra dependencies)

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
  swap `searchText LIKE` for a `tsvector`/GIN index — the query shape stays.
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
bun run db:push       # create/update the local database
bun run dev           # development server on :3000
```

### Development seed (fixtures — never run in production)

```bash
bun scripts/seed.ts
```

Seeds 6 demo traders, 13 listings across categories/counties/statuses (including
one already overdue so the expiry sweep demonstrates itself) and 2 saved
searches with honestly computed counts. Fixture passwords are `demo1234`,
phones `+2547120000 01–06`.

### API behavior & security tests

With the dev server running:

```bash
bun scripts/test-api.ts
```

66 assertions covering: auth (incl. no account enumeration), listing validation,
ownership boundaries (positive AND negative), status transition rules, refresh
cooldown, real expiry sweep + notifications, saved-search matching and
permissions, notification permissions, PostgreSQL settings masking, and sign-out.

## Deploying against PostgreSQL

1. Bring your own PostgreSQL instance (Supabase, RDS, self-hosted…).
2. Set `DATABASE_URL` in the deployment environment **or** capture the
   connection in **Settings → Advanced Settings** (host/port/database/user/
   password/SSL or a full connection string). Values are stored server-side and
   masked in the UI.
3. Run `prisma migrate deploy` (or `bun run db:push` for the sandbox store).
4. Use **Test connection** in Advanced Settings to verify reachability before
   switching. It reports host reachability only — by design.
5. Schedule something to `POST /api/cron/sweep` every few minutes so expiry
   stays truthful even without browsing traffic.

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
scripts/test-api.ts           behavior + security boundary tests
```
