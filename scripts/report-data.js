// Content data for the Mudaala API Security & Test Coverage Report.
// All facts audited at commit e7fbac2 (branch starter-launch).

const rateLimits = [
  ["Login (failed attempts)", "per phone", "5 / 15 min", "RATE_LIMIT_LOGIN_MAX", "Cleared on successful sign-in"],
  ["Login (IP flood)", "per IP", "20 / 15 min", "RATE_LIMIT_LOGIN_IP_MAX", "Counts every attempt"],
  ["Register", "per IP", "5 / hour", "RATE_LIMIT_REGISTER_MAX", "Spec cap restored by Task 4"],
  ["Publish (POST /api/listings)", "per user", "20 / 24 h", "RATE_LIMIT_PUBLISH_MAX", "Sandbox .env uses 40 as suite headroom"],
  ["Upload", "per user", "30 / hour", "RATE_LIMIT_UPLOAD_MAX", "8 MB per-file cap applies separately"],
  ["Reports (signed-in)", "per user", "10 / 24 h", "hard-coded 10", "REPORT_DAY_MAX; no env knob (risk R12)"],
  ["Reports (guest)", "per IP", "10 / 24 h", "RATE_LIMIT_REPORT_IP_MAX", "Identity derives from x-forwarded-for (risk R1)"],
  ["Password reset (per phone)", "per phone", "3 / hour", "RATE_LIMIT_RESET_PHONE_MAX", "Applies to forgot-password only"],
  ["Password reset (per IP)", "per IP", "10 / hour", "RATE_LIMIT_RESET_IP_MAX", "Applies to forgot-password only"],
  ["Refresh", "per listing", "1 / 24 h", "REFRESH_COOLDOWN_HOURS", "Business cooldown, returns 429"],
];

const quotaNotes = [
  "Saved searches: max 20 per user (409 beyond).",
  "Reports: one OPEN report per reporter (user id, or IP for guests) per target; duplicates get a friendly 409.",
  "Auto-hide: a listing is hidden when 3 OPEN reports from 3 DISTINCT reporters exist; the owner is notified and an AuditLog row is written.",
  "Uploads: 8 MB per file; jpg/png/webp only, enforced by magic-byte sniffing, then re-encoded with sharp.",
  "Reset codes: 6 digits, 10-minute TTL, killed after 5 wrong submissions (per code).",
];

// Matrix rows: [route, methods, auth, ownership, rateLimit, validation, notes]
const matrixGroups = [
  {
    title: "4.1 Authentication and account",
    intro: "Six endpoints handle identity. The anti-enumeration posture is the design centrepiece: unknown phone numbers and wrong passwords produce byte-identical 401 responses on login, and forgot-password returns an identical body whether or not the number has an account. Passwords never cross the API in plaintext responses, the password rulebook (length, common-password blocklist, phone-blocklist) is shared by registration and reset, and terms acceptance is stamped at registration with a version, so a future terms change can force re-confirmation.",
    rows: [
      ["POST /api/auth/register", "Public", "n/a", "5/h per IP", "registerSchema; acceptTerms required; phone to E.164; password rulebook", "409 on duplicate phone; returns sessionToken in body (risk R6); stamps termsAcceptedAt + termsVersion"],
      ["POST /api/auth/login", "Public", "n/a", "20/15min per IP; 5 fails/15min per phone", "loginSchema; phone candidates", "Uniform 401 (no enumeration); fail counter cleared on success; sessionToken in body (risk R6)"],
      ["POST /api/auth/logout", "Current token", "Own session only", "-", "-", "Deletes exactly the presented token's session; CSRF-checked"],
      ["GET /api/auth/me", "Optional", "-", "-", "-", "Returns user:null when anonymous; toPublicUser never leaks passwordHash"],
      ["POST /api/auth/forgot-password", "Public", "n/a", "3/h per phone; 10/h per IP", "phone format check", "Byte-identical reply both paths; one live code per user; SMS failure logged without phone or code"],
      ["POST /api/auth/reset-password", "Code is the credential", "n/a", "Per-code: 5 wrong tries kill it; 10-min TTL", "6-digit code; password rulebook", "One generic failure message for every bad case; success = new hash + ALL sessions revoked + code consumed; clears login lockout"],
    ],
  },
  {
    title: "4.2 Listings",
    intro: "Listing routes carry the marketplace's core write paths and therefore the strongest combination of controls: session auth, the uniform-404 ownership helper, a publish rate limit, the prohibited-items word filter at publish AND edit time, and strict field validation. Hidden (auto-moderated) listings are deliberately unreachable through every public surface: browse, search, sitemap, and the public detail route all exclude them, while the owner and admins retain access for appeal and review. A foreign id is always answered with the same 404 as a missing id, so existence is never confirmed to non-owners.",
    rows: [
      ["GET /api/listings", "Public", "n/a (ACTIVE only)", "-", "listingQuerySchema (q<=80, page<=1000, pageSize<=50)", "Lazily expires overdue listings on read"],
      ["POST /api/listings", "Session", "Owner = session user", "20/24h per user", "create schema; prohibited-words filter; photos sanitised (max 4); county-in-country check", "Sets ACTIVE with 30-day expiry; client-supplied status/ownership ignored"],
      ["GET /api/listings/[id]", "Public", "HIDDEN visible to owner and admin only", "-", "-", "Identical 404 for missing vs hidden; viewCount incremented per read (risk R7)"],
      ["PATCH /api/listings/[id]", "Session", "getOwnedListingOr404 (foreign = same 404)", "-", "update schema against merged record; status-transition gate; prohibited-words", "Field edits only while ACTIVE; repost restarts expiry"],
      ["DELETE /api/listings/[id]", "Session", "getOwnedListingOr404", "-", "-", "Hard delete"],
      ["POST /api/listings/[id]/refresh", "Session", "getOwnedListingOr404", "24h cooldown, then 429", "-", "ACTIVE only; extends expiry by 30 days"],
      ["GET /api/my/listings", "Session", "Scoped to userId", "-", "-", "Includes the owner's own HIDDEN listings"],
    ],
  },
  {
    title: "4.3 Shops, sellers and profile",
    intro: "Public shop and seller surfaces are read-only projections of already-public data. Contact phone numbers appear only where the product intends them (the shop contact channel), lookup payloads exclude phone, WhatsApp and password material, and the verified chip is computed rather than self-declared. Profile writes are session-scoped upserts: verified cannot be self-set, the shop code is never re-rolled on update, and stored coordinates are rounded to roughly 100 metres before they ever reach the database, which is the system's single privacy invariant for location.",
    rows: [
      ["GET /api/shops/[id]", "Public", "n/a", "-", "-", "ACTIVE catalogue only; phoneConfirmed chip only when shop phone equals the login line"],
      ["GET /api/shops/check-name", "Public", "n/a", "-", "2-80 chars", "Full-table fetch per call (risk R8)"],
      ["GET /api/shops/lookup", "Public", "n/a", "-", "Shop code format (MD-XXXX)", "404 echoes the code; payload has no phone/whatsapp/password"],
      ["GET /api/sellers/[id]", "Public", "n/a", "-", "-", "ACTIVE listings only; profile coordinates pre-blurred"],
      ["GET /api/profile", "Session", "Own profile", "-", "-", "Honest completion checklist"],
      ["PUT /api/profile", "Session", "Upsert keyed by userId", "-", "businessProfileSchema; phones normalised", "verified forced false; shopCode immutable on update; schema strips lat/lng"],
      ["PUT /api/profile/location", "Session", "Own profile", "-", "Both-or-neither coordinates; range checks", "Rounded to ~100 m BEFORE storage (privacy invariant)"],
    ],
  },
  {
    title: "4.4 Reports and moderation",
    intro: "Task 2's abuse surface. Guests may report (a marketplace reality in Uganda), so the controls are quota plus dedupe: ten accepted reports per day per reporter identity, one OPEN report per reporter per target, and auto-hide only at three distinct reporters. Every admin action lands in the AuditLog, and the admin queue deliberately never renders reporter IPs. The structural weakness is that guest identity derives from the client-supplied x-forwarded-for header, which risk R1 addresses.",
    rows: [
      ["POST /api/reports", "Guests allowed (optional session)", "n/a", "10/24h per user; 10/24h per guest IP", "reportCreateSchema: targetType, 5 reasons, details<=500", "One OPEN report per reporter per target (409); missing target = 404; auto-hide at 3 distinct reporters + owner notification + AuditLog"],
      ["GET /api/admin/reports", "Admin (ADMIN_PHONES)", "n/a", "-", "adminReportsQuerySchema", "take:200; guests shown as 'a guest'; IPs never rendered"],
      ["POST /api/admin/reports/[id]/action", "Admin", "n/a", "-", "HIDE | RESTORE | DISMISS", "Every action AuditLog-logged; hiding a SHOP is a 409 by design"],
    ],
  },
  {
    title: "4.5 Saved searches and notifications",
    intro: "Both subsystems are strictly session-scoped and use the same foreign-id-404 pattern as listings. Notifications deserve a specific note: deletes and mark-reads filter by userId inside the query itself, so a foreign id is a silent no-op rather than an error, which is both safe and side-effect free. Saved-search check-now re-validates the stored query through the current query schema before running it, so stale or corrupted stored queries fail honestly instead of executing arbitrary filters.",
    rows: [
      ["GET /api/saved-searches", "Session", "Scoped to userId", "-", "-", "-"],
      ["POST /api/saved-searches", "Session", "Owner", "20 per user (409 beyond)", "savedSearchCreateSchema", "Match count computed from real data"],
      ["DELETE /api/saved-searches/[id]", "Session", "Owner else 404", "-", "-", "-"],
      ["POST /api/saved-searches/[id]/check", "Session", "Owner else 404", "-", "Stored query re-validated", "Corrupt stored query = honest 500"],
      ["GET /api/notifications", "Session", "Scoped to userId", "-", "-", "take:100"],
      ["DELETE /api/notifications", "Session", "userId filter on every delete", "-", "ids | all (400 without)", "Foreign ids silently no-op"],
      ["POST /api/notifications/mark-read", "Session", "userId filter", "-", "ids | all (400 without)", "Foreign ids = 200 no-op"],
    ],
  },
  {
    title: "4.6 Dashboard and price trends",
    intro: "The signed-in dashboard aggregates only the caller's own data: every query inside /api/home is scoped by userId, the visit stamp writes a single own row, and price trends read persisted snapshots for the user's own listings and saved searches with a top-3 series cap. None of these endpoints touch other users' rows even indirectly, which the cross-user ownership tests pin down.",
    rows: [
      ["GET /api/home", "Session", "All queries scoped to user.id", "-", "-", "Powers the new-since-last-visit badge"],
      ["POST /api/home/visit", "Session", "Own row only", "-", "-", "Timestamp stamp only"],
      ["GET /api/price-trends", "Session", "Own listings + own saved searches", "-", "-", "Reads persisted snapshots; top-3 series cap"],
    ],
  },
  {
    title: "4.7 Platform operations",
    intro: "Operational surfaces mix public reads, admin-only configuration, and secret-gated automation. Upload is the most defensive route in the app: authentication, a per-user hourly bucket, an 8 MB cap, magic-byte content sniffing, and a full sharp re-encode that strips EXIF and GPS metadata while normalising to WebP inside a 1200-pixel box. The health endpoint is unauthenticated by design and carries no PII, the sweep is fail-closed on a missing secret with a constant-time comparison, and postgres settings are admin-only with AES-256-GCM encryption at rest and a masked connection string on read.",
    rows: [
      ["POST /api/upload", "Session", "n/a (files anonymous)", "30/h per user", "FormData file required; 8 MB cap; magic bytes jpg/png/webp", "sharp rotate+resize(1200)+webp strips EXIF/GPS; PhotoStorage interface (local disk or S3-compatible); honest 502 on bucket failure"],
      ["GET /api/health", "Public by design", "n/a", "-", "-", "503 when the database is unreachable; no PII"],
      ["POST /api/cron/sweep", "x-cron-secret header", "n/a", "-", "-", "sha256 + timingSafeEqual compare; 503 fail-closed when unset; runs expiry + snapshots"],
      ["GET /api/settings/postgres", "Admin", "n/a", "-", "-", "connectionString masked; password never returned"],
      ["PUT /api/settings/postgres", "Admin", "n/a", "-", "postgresConfigSchema", "Secrets AES-256-GCM encrypted at rest; empty password keeps stored one"],
      ["DELETE /api/settings/postgres", "Admin", "n/a", "-", "-", "-"],
      ["POST /api/settings/postgres/test", "Admin", "n/a", "-", "-", "TCP reachability only; never claims credential validity"],
      ["GET /sitemap.xml", "Public", "n/a", "-", "page param validated", "ACTIVE + unexpired + isSeed:false listings and live shops only"],
      ["GET /api", "Public", "n/a", "-", "-", "Scaffold 'Hello, world!' stub - remove before launch (risk R13)"],
    ],
  },
];

// Test coverage map: [area, exact assertion names, section]
const testMap = [
  ["Registration and login failures", "register rejects invalid phone + short password (400); login with wrong password -> 401, no enumeration; login with unknown phone -> same 401 message; register response never contains passwordHash", "1"],
  ["Bearer transport", "Bearer header authenticates without any cookie (iframe safety); logout revokes the Bearer-only session too; bearer gate: legacy AUTH_BEARER_FALLBACK=1 still works", "1b, 15"],
  ["Login floods", "6th attempt locked out with 429 - even with the correct password; the 21st login attempt from that IP inside 15 min -> 429; the 6th account from that IP within the hour -> 429", "1c, 15"],
  ["Listing creation and validation", "unauthenticated create -> 401; create with negative price -> 400; OFFER without price and not negotiable -> 400; location outside Uganda -> 400; unsupported currency -> 400; server ignores client-supplied status/ownership", "2"],
  ["Photos and upload", "unauthenticated upload -> 401; renamed non-image rejected by magic bytes -> 400; stored photo is WebP inside the 1200px box; EXIF/GPS is gone - no Artist tag, no EXIF block survives", "3b, 15"],
  ["Ownership boundaries", "non-owner edit -> 404 (existence not leaked); non-owner delete -> 404; non-owner refresh -> 404; user B cannot trigger user A's saved-search check -> 404; user B cannot edit user A's listing -> 404", "4, 15"],
  ["Status machine", "field edit on FULFILLED listing -> 409; FULFILLED -> EXPIRED forbidden (sweep owns that transition); EXPIRED -> ACTIVE repost allowed", "5"],
  ["Refresh cooldown", "refresh on FULFILLED listing -> 409 (no silent reactivation); second refresh within 24h -> 429", "6"],
  ["Saved searches and notifications", "another user cannot delete my saved search -> 404; mark-read on foreign notification is a no-op (200 but no effect); another user's clear-all never touches my alerts", "7"],
  ["Expiry and sweep", "archived listing page -> 404 (removal honored); sweep without header -> 403; sweep with wrong secret -> 403; CRON_SECRET unset -> 503 (fail closed)", "8, 8b"],
  ["Reports and moderation", "guest report -> 201; same guest reporting again -> 409 with a friendly message; 501-char details -> 400; third and fourth distinct reporters accepted; auto-hidden ad -> 404 on the public API; hidden ad leaves the sitemap; owner can still fetch their hidden ad (appeal path); non-admin queue list -> 403; ten accepted reports in a day for one reporter; 11th report in a day -> 429", "13"],
  ["Password reset", "identical answer whether or not the number has an account (no enumeration); four wrong codes -> 400 with one generic message; after five wrong tries even the correct code is refused; a consumed code cannot be reused; the session held before the reset is revoked; an expired code is refused with the same generic message; a fourth request for the same number waits an hour (429)", "14"],
  ["Legal, terms and phase-1 security", "cross-site logout with a stolen cookie -> 403; non-browser clients (no Origin header) still work; the 31st upload within the hour -> 429; register without accepting terms is refused; stored config is encrypted at rest", "15"],
  ["Real hosting", "/api/health reports ok with the database up; provider-choice units (local vs S3); an UPPERCASE query finds the lowercase title (case-insensitive ILIKE search)", "16"],
  ["Placeholder rule (seed data)", "a seed-flagged listing is not in the sitemap; an ad page never ships a seed photo path anywhere in its HTML; remove-seed-data dry-run runs clean and deletes nothing", "17"],
];

// Risk register: [id, severity, finding, evidence, mitigation]
const risks = [
  ["R1", "P1", "Guest reporter identity and every per-IP bucket derive from the client-supplied x-forwarded-for header (first hop). An attacker rotating XFF gets a fresh guest budget and a fresh dedupe identity per request, so one actor can fabricate '3 distinct reporters' and auto-hide any listing in 3 requests.", "reports/route.ts:16; lib/reports.ts:33,92-93; rate-limit.ts IP keys; Caddyfile replaces XFF at the edge (Caddyfile:9,18)", "At the edge, override or reject x-forwarded-for (the bundled Caddyfile already does); behind other proxies, sign or strip the header; consider requiring an account to report if abuse persists."],
  ["R2", "P2", "The rate limiter is in-process memory. A multi-instance deployment silently multiplies every cap (login lockout, register, reset, reports, publish, upload).", "rate-limit.ts:2-12 (documented in-file)", "Before horizontal scale-out, move the sliding window into the shared database or Redis; single-instance deployments are correct as-is."],
  ["R3", "P2", "reset-password has no request-rate bucket once no live code exists; guessing is bounded only per live code (5 wrong tries, 10-min TTL). The endpoint answers unlimited generic 400s at line rate otherwise.", "reset-password/route.ts:24-51", "Add a small per-IP/per-phone bucket (e.g. 10/hour) mirroring forgot-password; keep the generic message."],
  ["R4", "P2", "Per-phone login lockout is attacker-triggerable DoS: 5 wrong passwords lock the victim's phone for 15 minutes for the owner too. No CAPTCHA or step-up path.", "login/route.ts:34-39; asserted at test :231", "Accept for launch (small population, 15-min window); consider device-trust or CAPTCHA step-up later."],
  ["R5", "P2", "CSP is nonce-less with 'unsafe-inline' and 'unsafe-eval' in script-src, so XSS containment is weak.", "next.config.ts:14-16 (in-file comment acknowledges the future step)", "Adopt nonce-based CSP as the next hardening step; needs a build change for the inline bootstrap."],
  ["R6", "P2", "register/login responses include the raw sessionToken even when the Bearer channel is disabled (production default). Any body-logging APM captures live 30-day credentials.", "register/route.ts:71; login/route.ts:56; auth.ts:90-96", "Omit sessionToken from the JSON body when bearerAuthEnabled() is false; the browser client should also stop persisting it."],
  ["R7", "P2", "Unauthenticated viewCount inflation: GET /api/listings/[id] increments the counter on every read with no dedupe.", "listings/[id]/route.ts:30", "Dedupe by session/IP with a short window, or accept as a soft metric."],
  ["R8", "P3", "shops/check-name loads every BusinessProfile row into memory per unauthenticated call - a cheap DoS and perf drag as shop count grows.", "shops/check-name/route.ts:23-26", "Replace with a COUNT query or a case-insensitive indexed lookup."],
  ["R9", "P3", "LocalDiskStorage has no quota or garbage collection, and no photo delete route exists; orphaned WebP files accumulate forever.", "storage.ts:34-43", "Rely on S3 lifecycle rules in production; add a delete endpoint or sweep later."],
  ["R10", "P3", "reporterIp is stored in plaintext with an undocumented retention policy (it is never rendered anywhere - honoured by the admin queue).", "schema.prisma:187; admin/reports/route.ts:29,65", "Document retention, hash the IP, or add a TTL sweep."],
  ["R11", "P3", "The dev SMS ConsoleProvider prints full phone + reset code to logs when NODE_ENV is not 'production'; a mis-set NODE_ENV in a prod-like env would leak codes.", "sms.ts:72,76-79", "Gate the console provider on an explicit SMS_CONSOLE=1 flag instead of NODE_ENV."],
  ["R12", "P3", "REPORT_DAY_MAX (10/day signed-in) is hard-coded, unlike its guest sibling; no env knob for CI shared-IP scenarios.", "rate-limit.ts:68-75", "Add RATE_LIMIT_REPORT_USER_MAX reading the same pattern as the guest bucket."],
  ["R13", "P3", "Stray scaffold route GET /api returns 'Hello, world!' - public, untested, unnecessary.", "api/route.ts:3-5", "Delete the route file before launch."],
  ["R14", "P3", "The generic error handler logs raw error objects; Prisma errors can embed query parameters (occasionally phone numbers).", "api.ts:40", "Log error.name + a correlation id instead of the raw object."],
  ["-", "Info", "By design and verified safe: HIDDEN listings are owner/admin-only with a uniform 404 elsewhere; empty ADMIN_PHONES makes admin unusable (fail closed); unset CRON_SECRET makes the sweep 503; partial STORAGE_* falls back to local disk.", "listings/[id]/route.ts:23-27; admin.ts:13-21; cron/sweep:29-31; storage.ts:146-165", "No action - postures are correct."],
];

const launchChecklist = [
  "Paste the real legal text into content/privacy.md, content/terms.md and content/safety.md - the pages render whatever is in those files, and the register checkbox links to them. Bump TERMS_VERSION in src/lib/constants.ts if the text changes materially.",
  "Set SUPPORT_EMAIL in .env once the support inbox exists; appeal messages in the owner notification pick it up automatically.",
  "Before real SMS: set AT_API_KEY, AT_USERNAME and (for the branded sender name) AT_SENDER_ID from Africa's Talking; until then the console provider prints codes in development only.",
  "Production environment variables (required, boot refuses to start without them): DATABASE_URL, NEXT_PUBLIC_APP_URL or APP_ORIGIN, CRON_SECRET, SETTINGS_ENCRYPTION_KEY, ADMIN_PHONES. Unset ALLOW_BEARER_AUTH/AUTH_BEARER_FALLBACK in production. Set FRAME_ANCESTORS='none' (the sandbox value exists only so the studio preview iframe can embed the app).",
  "Run npx prisma migrate deploy against the production PostgreSQL database - a fresh database becomes current with the single postgres baseline migration.",
  "Remove all demo content right before launch: npx tsx scripts/remove-seed-data.ts --yes (dry-run first, with no flag, to review). This deletes seed-flagged users, listings, shops and the public/uploads/seed fixtures in one step.",
  "Photos: configure STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_KEY, STORAGE_SECRET and STORAGE_PUBLIC_URL (S3-compatible: Cloudflare R2, Supabase, MinIO), then run scripts/migrate-uploads-to-s3.ts which migrates real user photos only and never migrates or rewrites seed photos.",
  "Schedule the sweep (expiry, expiring-soon notifications, price snapshots) as a daily cron POST to /api/cron/sweep with the x-cron-secret header.",
  "Point the platform health probe at GET /api/health (200 healthy, 503 database down).",
  "Verify GitHub main and starter-launch point at the launch commit before deploy; keep the insurance bundle until the first production backup exists.",
];

const suiteSections = [
  ["1", "Authentication", "register/login/logout/me contracts, no-enumeration, no password material in responses"],
  ["1b", "Ugandan phone formats + Bearer transport", "07/2567/+256 dialing forms, bearer fallback channel"],
  ["1c", "Login rate limiting", "per-phone lockout, per-IP flood, counter reset on success"],
  ["2", "Listing creation and validation", "field rules, currency, county-in-country, ownership ignore"],
  ["3", "Search, filters, pagination", "query schema caps, filter behaviour"],
  ["3b", "Photos, upload and shop identity", "magic bytes, WebP box, sanitisation"],
  ["3c", "Shop page, discounts and checklist", "public catalogue isolation, no password material"],
  ["3d", "Shop identity codes and same-name guard", "MD-XXXX codes, name-twin rejection"],
  ["3e", "Shop location and nearest sort", "coordinate blurring, geo sort"],
  ["3f", "Shop code lookup", "anonymous till-number path, payload hygiene"],
  ["4", "Ownership and permission boundaries", "foreign-id uniform 404 across edit/delete/refresh"],
  ["5", "Status transitions", "ALLOWED_STATUS_TRANSITIONS enforced incl. locked HIDDEN"],
  ["6", "Refresh cooldown", "24h business rule"],
  ["7", "Saved searches and real matching", "computed counts, cross-user isolation"],
  ["8", "Expiry is real", "expired ads leave public surfaces, 404 pages"],
  ["8b", "Sweep endpoint needs the cron secret", "403 without/wrong secret, 503 unset, idempotence"],
  ["9", "Settings - Advanced Settings (PostgreSQL)", "admin gate on all four verbs, encryption at rest, masking"],
  ["10", "Sign out", "cookie and bearer sessions revoked"],
  ["11", "Home dashboard + price trends", "scoping, visit stamp, top-3 series cap"],
  ["12", "Ad pages /l/ and /s/", "share links, gone pages with similar ads, OG metadata"],
  ["13", "Reports and moderation", "guest reports, quotas, dedupe, auto-hide at 3 distinct reporters, admin gate, AuditLog"],
  ["14", "Password reset by SMS code", "no enumeration, code kill/expiry/reuse, session revocation, quotas"],
  ["15", "Legal pages, terms and phase-1 security", "CSRF origin check, security headers, spec rate limits, EXIF strip, cross-user matrix, terms stamping"],
  ["16", "Real hosting: health/storage/Postgres search", "health endpoint, provider selection, SigV4 shape, ILIKE search"],
  ["17", "Placeholder rule: seed flag and exclusions", "sitemap/OG exclusions, remove-seed-data dry-run safety"],
];

const envVars = [
  ["DATABASE_URL", "-", "Runtime store connection (PostgreSQL in production; embedded Postgres on 127.0.0.1:5433 in the sandbox)", "Always; production boot fails without it"],
  ["NEXT_PUBLIC_APP_URL / APP_ORIGIN", "-", "Canonical public origin for ad-page URLs, OG tags, sitemap and robots", "Production (validated at boot)"],
  ["ADMIN_PHONES", "-", "Comma-list of admin phone numbers; empty = no admins (fail closed)", "Production (validated)"],
  ["CRON_SECRET", "-", "Shared secret for POST /api/cron/sweep via the x-cron-secret header; unset = 503", "Production (validated)"],
  ["SETTINGS_ENCRYPTION_KEY (alias SETTINGS_ENC_KEY)", "-", "AES-256-GCM key for postgres settings at rest", "Production (validated)"],
  ["ALLOW_BEARER_AUTH (legacy AUTH_BEARER_FALLBACK)", "off", "Enables the Authorization: Bearer session channel (sandbox/preview convenience)", "Leave UNSET in production (boot warns if on)"],
  ["FRAME_ANCESTORS", "'self'", "CSP frame-ancestors value; sandbox allows the studio parents; production must set 'none'", "Set 'none' in production"],
  ["SUPPORT_EMAIL", "placeholder", "Reply address surfaced in hidden-listing appeal notifications", "When the inbox exists"],
  ["AT_API_KEY / AT_USERNAME / AT_SENDER_ID", "-", "Africa's Talking SMS credentials for real reset codes", "Before production SMS"],
  ["RATE_LIMIT_LOGIN_MAX / _LOGIN_IP_MAX", "5 / 20", "Login failed-attempts per phone / attempts per IP (15-min window)", "Optional overrides"],
  ["RATE_LIMIT_REGISTER_MAX", "5", "Registrations per IP per hour", "Optional override"],
  ["RATE_LIMIT_PUBLISH_MAX", "20", "Publishes per user per 24 h (sandbox .env uses 40 as suite headroom)", "Optional override"],
  ["RATE_LIMIT_UPLOAD_MAX", "30", "Uploads per user per hour", "Optional override"],
  ["RATE_LIMIT_REPORT_IP_MAX", "10", "Guest reports per IP per 24 h (sandbox uses 100 for suite headroom)", "Optional override"],
  ["RATE_LIMIT_RESET_PHONE_MAX / _RESET_IP_MAX", "3 / 10", "forgot-password per phone / per IP per hour (sandbox uses 100 for the IP bucket)", "Optional overrides"],
  ["REFRESH_COOLDOWN_HOURS", "24", "Business cooldown between listing refreshes", "Optional override"],
  ["STORAGE_ENDPOINT / _BUCKET / _KEY / _SECRET / _PUBLIC_URL", "-", "S3-compatible photo storage (R2/Supabase/MinIO); all-or-nothing - partial config falls back to local disk", "Production photos"],
  ["x-cron-secret (request header)", "-", "Header carrying CRON_SECRET on sweep calls", "Every sweep call"],
];

module.exports = { rateLimits, quotaNotes, matrixGroups, testMap, risks, launchChecklist, suiteSections, envVars };
