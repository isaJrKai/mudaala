# Commerce OS — Multi-Agent Worklog

---
Task ID: 1
Agent: main (Super Z)
Task: Build Commerce OS local-commerce discovery platform per user's Anti-AI-Generated Product Rules

Work Log:
- Read user spec: Commerce OS — OFFER/REQUEST listings, local discovery, category filters, price/quantity/unit, freshness, WhatsApp+phone contact, business profiles, saved searches, notifications, My Listings (edit/refresh/fulfil/expiry)
- Special requirement: PostgreSQL connection config must live in Settings → Advanced Settings
- Initialized fullstack env (Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui + Prisma/SQLite sandbox store)
- Confirmed deps: zod 4, zustand, @tanstack/react-query, full shadcn/ui set, date-fns

Stage Summary:
- Plan: full-stack build in this repo. Single visible route `/` (SPA views). Prisma models: User, Session, BusinessProfile, Listing, SavedSearch, Notification, AppSetting. Kenyan local-commerce context (KSh, counties, +254 phones). Auth via scrypt + session cookies. Ownership enforced server-side on every write. Real expiry/refresh timestamps. No fabricated data.

---
Task ID: 2
Agent: main (Super Z)
Task: Build complete Commerce OS platform (frontend + backend + tests)

Work Log:
- Prisma schema: User, Session, BusinessProfile, Listing, SavedSearch, Notification, AppSetting (pushed to SQLite runtime store)
- Core libs: constants.ts (11 categories, 12 units, 20 counties, business rules), validation.ts (shared zod + KE phone normalization), auth.ts (scrypt + server-side sessions), listings.ts (search/expiry/refresh/matching), postgres-settings.ts (masked storage + real TCP test)
- 16 API routes: auth (register/login/logout/me), listings (search/create/detail/patch/refresh/delete), my/listings, saved-searches (+check), notifications (+mark-read), profile, settings/postgres (+test), cron/sweep
- Frontend: warm-neutral + dark-green design system; single route with hash-synced views: Browse (live search, filters, sort, pagination, save-search), Listing detail (WhatsApp wa.me + tel: links), Publish/Edit form, My Listings (refresh cooldown display, fulfil, repost, archive, delete), Saved Searches, Alerts, Account (business profile), Settings → Advanced Settings (PostgreSQL config, save/test/remove)
- Fixed real bugs found by testing: double body-consumption in PATCH (request.json() twice), zod .omit() on refined schema, wrong test expectations for refresh cooldown + global postgres config, mobile Next.js dev overlay covering bottom nav (devIndicators:false), hash not initializing from URL on reload (deep links), missing category/county error display in profile form, unit pluralization ("300 crates"), REQUEST quantity label ("wanted" not "available")
- Browser-verified via agent-browser: browse/search/save-search/detail contact links (correct wa.me + tel hrefs)/publish flow incl. validation errors preserving input/my-listings refresh cooldown/settings postgres save+test (honest "Connection refused" for unreachable host, password never returned by API)/notifications (real sweep-generated LISTING_EXPIRED with unread badge)/profile save (PUT 200 + persisted)/mobile 375px + desktop 1440px with no horizontal overflow
- Wrote README (architecture, security model, deployment, seed docs)

Stage Summary:
- 66/66 API behavior + security tests passing; lint clean; app code typechecks clean
- Dev fixtures seeded (passwords demo1234, phones +254712000001..06) — documented as dev-only
- Special requirement met: ALL PostgreSQL link configuration lives in Settings → Advanced Settings (stored in AppSetting, masked responses, real TCP test, honest messaging about sandbox runtime store)

---
Task ID: 5
Agent: main (Super Z)
Task: "WE DONT LOG IN — debug the whole app for errors, then give me log ins" + previously approved items (UGX/TZS currency, Duuka rename, seller shop naming, single sign-in model)

Work Log:
- Discovered disk state was Task-2 era: the earlier session's login fixes (dual-channel auth, sessionLoading skeleton, postgres test route) were NEVER persisted, and worklog entries for Tasks 3/4 were missing. Rebuilt everything from scratch.
- Root causes of "can't log in": (1) session cookie was SameSite=Lax → dropped in the cross-origin preview iframe, no fallback existed; (2) phone validation was Kenya-only (+254) → Ugandan/Tanzanian numbers rejected at register AND login.
- Auth rebuilt (src/lib/auth.ts): getSessionUser reads cookie OR Authorization: Bearer; setSessionCookie picks None+Secure on public hosts (x-forwarded-host based), Lax on localhost; getCurrentSessionToken powers logout for both channels.
- Multi-country phones (src/lib/validation.ts): UG (+256, 7XXXXXXXX/3XXXXXXXX), TZ (+255, 6/7XXXXXXXX), KE (+254, 1/7XXXXXXXX); login resolves a local number against ALL dial codes via phoneCandidates() so users never pick country at sign-in.
- Login/register API return sessionToken (Bearer channel); register stores User.country (default UG).
- client.ts: duuka_session_token in localStorage, apiFetch attaches Bearer, 401 self-heal (exempting login/register), useSignOut clears token + query cache.
- Currency: Listing.currency (UGX default) + Listing.country; UGX/TZS zero-decimal formatting via currencyDef; publish/edit forms have a native currency selector (USh/TSh/KSh) defaulting from account country; listing card/detail render per-listing currency; price filter labels genericized.
- Locations: COUNTRIES in constants.ts — Uganda (Kampala, Wakiso, Entebbe, Mukono, Jinja, ...), Tanzania (Dar es Salaam, Mwanza, Arusha, Dodoma, ...), Kenya (counties kept); create/PATCH validate location ∈ listing.country and re-normalize contact phones.
- Zod 4 gotcha found + fixed: .default() survives .partial() — a {price} PATCH injected country:'UG' and broke edits on KE listings. country/currency are now .optional(); create route derives country from user.country and currency from countryDef.
- Duuka rename: header, auth dialog ("Welcome to Duuka"), layout metadata, page footer, WhatsApp intro text, all lib comments, README.
- Shop naming: Account → "My Shop" section (shop name is the first field), PUT /api/profile upserts it; listing detail shows the named shop prominently (larger, semibold, Store icon); seed shops all named.
- Rebuilt missing /api/settings/postgres/test route (honest TCP test, was 404 → suite crash).
- Auth dialog: dev-only one-tap demo account quick-fill buttons; register has a country <select> with dial codes.
- Seed rebuilt: 3 Ugandan shops (Nakato Fresh Produce, Kampalamart Scrap Dealers, Jinja Hardware Centre — UGX listings), 1 Tanzanian (Dodoma Agri Supplies — TZS), 4 Kenyan kept; scripts/cleanup-test-data.ts removes suite pollution.
- Verified with agent-browser through the proxy (:81): sign-in via UI, RELOAD keeps session, COOKIES CLEARED + reload still signed in (Bearer works), listing detail "USh 20,000 / kg" + "+256 776 123 456" + shop name, publish form currency selector + UG districts only, full UI publish → "USh 15,000 / bunch", 375px mobile: no horizontal overflow, bottom nav intact, zero console errors.

Stage Summary:
- 78/78 API tests passing (was 66; +12 for multi-country/Bearer/currency coverage), tsc + eslint clean for src/ + scripts/.
- Logins for the user: 0772123456 / 0776123456 / 0758123456 (Uganda), 0712345678 (Tanzania), 0712000001..04 (Kenya) — all password demo1234. One account = buyer + seller, no second sign-in anywhere.

---
Task ID: 5-b
Agent: main (Super Z)
Task: "yh" — approved follow-ups: (a) buyer-path sweep so no login dialog appears mid-browse, (b) full-app debug + verified logins for the user

Work Log:
- Re-verified state after lost session: Task 5 work HAD persisted (dual-channel auth, currency, rename, seeds). Login API healthy: all 8 seeded accounts → HTTP 200 with sessionToken, on :3000 AND :81 proxy, cookie + Bearer channels both OK.
- Buyer-path sweep (code + live): triggers for auth dialog are only seller/account moments (publish, my listings, saved searches, alerts, settings, account, header Sign in). Browse/search/listing detail/contact = fully open. Listing detail contact is plain <a> links (tel: / wa.me) — no JS, no auth. The only browse-view auth prompt is the deliberate "Save this search" tap (needs identity for alerts). Buyer path confirmed clean.
- Whole-app debug found 2 real bugs:
  1. /api/settings/postgres/test/route.ts MISSING on disk (404 → HTML error page) → 4 suite failures. Rebuilt: requireUser → read stored config (400 if none/incomplete) → honest TCP test via testTcpConnection (200 {ok,message}).
  2. tsconfig.json include swept workspace template folders (examples/, skills/) → tsc errors and would break production `next build`. Added both to exclude.
- Full verification: 78/78 API tests, tsc --noEmit clean repo-wide, eslint (src+scripts) clean, agent-browser through :81 proxy: guest browse → listing detail (phone visible, Call/WhatsApp links, shop name shown, zero login walls) → typed sign-in 0772123456/demo1234 → header chip + Alerts badge → RELOAD keeps session → COOKIES CLEARED + reload still signed in (Bearer fallback, duuka_session_token in localStorage) → zero console errors.
- Ran scripts/cleanup-test-data.ts: removed 8 test users + 6 junk listings ("Test copper scrap offering" etc.) — app now shows only the 8 seeded shops (4 UG, 1 TZ, 4 KE... note: 3 UG + 1 TZ + 4 KE).

Stage Summary:
- All green: 78/78 tests, tsc, eslint, browser E2E incl. hostile cookie-clear scenario.
- Logins for the user (password demo1234 for ALL): Uganda 0772123456 (Kampalamart), 0776123456 (Nakato Fresh), 0758123456 (Jinja Hardware); Tanzania 0712345678 (Dodoma Agri); Kenya 0712000001..04 (Jomo Scrap Traders, Pendo Flour, Mama Amina Chapati, Kisumu Fresh).
- Model confirmed in app + product direction agreed: sellers sign in, buyers never have to.

---
Task ID: 6
Agent: main (Super Z)
Task: "options hiding in another panel" + detail-design polish for low-literacy users + product photos + shop identity (photo/name) + map directions

Work Log:
- ROOT-CAUSED "options hide in another panel": ui/dialog.tsx DialogContent is fixed-centered with NO max-height/overflow — on short viewports (preview iframe, mobile) the auth dialog's Sign in button + demo accounts rendered below the fold, unreachable. Fixed globally: max-h-[calc(100dvh-2rem)] overflow-y-auto on the primitive. Verified at 520px viewport: Sign in button visible + clickable.
- SECOND REAL BUG found during E2E: apiFetch stamped Content-Type: application/json over FormData bodies → every UI photo upload 400'd (curl/API tests bypassed it). Fixed: skip content-type when body instanceof FormData. UI upload now 201.
- THIRD BUG: raw zod message leaked for missing county ("Invalid input: expected string, received undefined") → z.string({ message: 'Choose your district or region' }).
- Photos end-to-end: Listing.photos (JSON string in SQLite) + BusinessProfile.photoUrl; POST /api/upload (requireUser, 8MB cap, magic-byte sniffing jpeg/png/webp, random names, public/uploads); photos validated/sanitized server-side (sanitizePhotos: URL-shape allowlist, dedupe, cap 4) on create+PATCH; serializeListing returns photos array on search/detail/my-listings.
- UI: PhotoPicker (camera-first capture="environment" + gallery, per-photo remove, single mode for shop avatar); publish + edit forms with Photos field; photo-first ListingCard (photo or category-tinted glyph placeholder, shop avatar + shop name line, bold price, TypeBadge overlay, +N count); detail PhotoGallery (scroll-snap swipe, counter chip, category-glyph empty state), "You would be buying from {shop}" identity card, Contact {shop} heading, Get directions button (Google Maps URL API, place-name query — no fake coordinates); Account → My Shop photo upload; register placeholder "e.g. Nalongo Hardware" + "name buyers will see" helper.
- Shop identity on browse: searchListings includes user{name, profile{businessName, photoUrl}} — buyers see WHO sells on every card.
- category-icons.tsx: module-level glyph element map (React-compiler lint safe) + warm tints per category.
- 24 AI-generated seed photos (16 listings + 8 shop storefronts) via scripts/generate-seed-images.mjs (concurrency pool, retries) → public/uploads/seed/; seed.ts wired.
- Tests: new section 3b — upload 401/201/magic-byte 400, photo sanitization, PATCH photos, browse shop identity, profile photoUrl round-trip + hostile URL 400. 89/89 passing (was 78). tsc + eslint clean.
- Browser E2E through :81: guest browse w/ photos + shop names; detail gallery + directions href verified (google.com/maps/search/?api=1&query=Nakasero%2C+Kampala%2C+Uganda); seller flow: sign in → publish form → real UI upload 201 → thumbnail → published → detail gallery; mobile 375px: no h-overflow, bottom nav intact; 0 console errors; auth dialog at 520px viewport fully usable.
- Cleanup: test data removed (kept 8 seeded shops + 16 fixtures).

Stage Summary:
- Buyers now SEE products (photos), know WHO they buy from (shop name + photo everywhere), and can decide pickup (directions). Sellers get camera-first photo upload and shop branding.
- Logins unchanged: 0772123456 / 0776123456 / 0758123456 (UG), 0712345678 (TZ), 0712000001..04 (KE) — password demo1234.

---
Task ID: 6-b
Agent: main (Super Z)
Task: "hopefully that call seller initiates a dialer" — verify the Call seller button triggers the native phone dialer

Work Log:
- Code audit: Call seller is a plain native <a href={telLink(phone)}> (no JS handler, no preventDefault, no auth gate); telLink() strips everything except digits and "+", keeping the international format.
- Live E2E via agent-browser through :81 proxy: opened "Copper scrap" detail → Call seller anchor href = "tel:+256776123456" (verified attribute, not just rendering); WhatsApp href = "https://wa.me/256776123456?text=Hi%2C%20I%20saw%20your%20listing..." with pre-filled intro; Get directions = Google Maps URL API.
- Pretty-print check: +256/+255/+254 numbers all match the 12-digit formatter (3-3-3-3 groups).
- Screenshot verify-call-seller.png: shop-named contact heading ("Contact Kampalamart Scrap Dealers"), readable number as text above buttons (manual-dial fallback), big green Call seller button.
- Zero console errors.

Stage Summary:
- CONFIRMED: tapping "Call seller" navigates to tel:+XXXXXXXXXXXX — on Android/iOS this opens the native dialer with the number pre-filled (user just presses call). Desktop preview won't dial (no dialer on desktops) — the number is also shown as plain text above the button as fallback.
- No code changes needed; behavior was already correct. Task 6 features all verified green.

---
Task ID: 7
Agent: main (Super Z)
Task: "shop catalogue space + discounts + verify-my-shop + onboarding + quick-call buttons on browse cards"

Work Log:
- Schema: Listing.compareAtPrice (optional "was" price) added, db pushed, client regenerated. Had to RESTART the dev server — the running process held the stale Prisma client and every create 500'd until restart (silent lesson recorded here).
- Discounts (honest by construction): listingCreateSchema + PATCH merged-record rules — an old price requires a current price and must be strictly higher, else 400 with a compareAtPrice field error. Browse cards + detail render struck-through was-price + −N% chip only when compareAtPrice > price, so fake crossed-out prices cannot exist. Publish + Edit forms have an "Old price (optional)" field (disabled/cleared for REQUEST). Seed: matooke 18000/22000, cement 32000/36000, sunflower oil 58000/65000 (scripts/apply-seed-discounts.ts updates live DB without wiping; seed.ts updated for future reseeds).
- Shop page (the seller's special space): new public GET /api/shops/[id] → shop identity + checklist + complete flag + full ACTIVE catalogue (orders by freshness, includes owner identity, never leaks other sellers or non-ACTIVE rows). New lib/shop.ts (shopChecklistFor/getShopPage). New ShopView (hash #/shop/[id], store.ts + providers wired): hero (photo, name, location, hours, description), honest chips ("Complete shop profile" badge OR "Profile n/5 complete", listings count, member-since), Call/WhatsApp shop buttons (tel:/wa.me plain links), "In this shop (N)" catalogue. Entry points: browse card shop chip, detail "Visit {shop}'s shop" button, Account "View my shop".
- Quick-call on browse cards: ListingCard restructured — main card button (photo/title/price/discount/meta) + footer bar on browse: shop chip (avatar+name → shop page), compact Call (tel:) and Chat (wa.me) links with full aria labels; owner cards (My Listings) keep the owner actions strip; shop-catalogue cards omit the bar (already inside the shop).
- Verify-my-shop (honest): Account "My Shop" gets a live ShopChecklist card (photo/description/area/hours/whatsapp, n/5 progress bar, emerald complete state) that ticks AS the seller types; profile GET returns {checklist, complete}; public shop shows the matching badge. No fake platform-vetting claims anywhere (verified flag stays false by design).
- Onboarding: ShopSetupDialog — one-time "Welcome to Duuka, {name}" with up to 3 friendly asks; shown only for signed-in users with an incomplete shop; "Later" persists via localStorage key duuka_shop_setup_dismissed; open state is fully DERIVED (useSyncExternalStore over localStorage + derived open boolean, zero setState-in-effect — satisfies react-hooks/set-state-in-effect, hydration-safe).
- Real bug found in E2E: "250 bunchs" — formatQuantity pluralized every unit with +s. Fixed: s/x/z/ch/sh → es ("bunches").
- Tests: new section 3c — profile 401/checklist, discount create/PATCH rules (valid, below-price, orphan, clear/set), shop page public/404/name/no-password-leak/catalogue purity/cross-seller isolation/FULFILLED-exclusion/phone present. 89 → 106 tests, all passing.
- E2E via agent-browser through :81: browse card bar (shop chip navigates to #/shop/[id], Call → tel:+256…, Chat → wa.me with prefill); shop page hero + "Complete shop profile" + catalogue with −18% discount; detail "Visit shop" → shop; fresh account register → onboarding dialog appeared → "Set up my shop" → Account checklist 0/5 → filled fields → saved → 4/5 → Grace's public shop shows "Profile 4/5 complete"; "Later" dismissal persisted across reload; mobile 375px: no horizontal overflow on browse or shop, bottom nav intact; zero console errors.
- Cleanup re-run: 8 seeded shops / 16 seed listings restored.

Stage Summary:
- Duuka now has a real shop space: every seller gets a public catalogue page with their identity, honest completeness badge, direct contact and discounts; every browse card carries shop + Call + WhatsApp in one tap; new sellers get a one-time guided setup. 106/106 tests, tsc + eslint clean, zero console errors.
- Logins unchanged: 0772123456 / 0776123456 / 0758123456 (UG), 0712345678 (TZ), 0712000001..04 (KE) — password demo1234.

---
Task ID: 7-b
Agent: main (Super Z)
Task: Post-session-restore health verification of Task 7 delivery (user confirmed "yeah, this will work")

Work Log:
- Context was restored from a summary; verified on disk that ALL Task 7 artifacts exist: Listing.compareAtPrice in schema, /api/shops/[id]/route.ts, src/lib/shop.ts, shop-view.tsx, shop-setup-dialog.tsx.
- dev.log tail showed a stale "Unknown argument `photos`" error — timestamped 3h earlier (historical, from pre-restart test run). Live write test on the RUNNING server: login 200 → POST /api/listings 201 with photos accepted → probe deleted. Server process has the fresh Prisma client; no restart needed.
- Full re-verification: 106/106 API tests, tsc --noEmit clean, eslint clean.
- Browser E2E via :81 (390x844): browse cards show shop chip + Call (verified href tel:+256776123456) + Chat (verified wa.me with listing-quoted prefill); shop page #/shop/[id] renders hero photo, "Complete shop profile" badge, hours, Call/WhatsApp, "In this shop (3)" catalogue with matooke USh 18,000 + struck-through 22,000 + −18% chip + "250 bunches" (pluralization fix live); detail page shows was-price, discount chip, "Visit Nakato Fresh Produce's shop"; Account shows 5/5 checklist progressbar + "Looking good" trust state + "View my shop". Zero console errors. Screenshot: scripts/verify-shop-space.png.
- Found and fixed feed pollution: the test-suite run leaves "Alice Test Shop"/"Test copper scrap offering" rows — ran scripts/cleanup-test-data.ts → removed 5 users + 4 listings, back to 8 shops / 16 listings. NOTE for every future session: ALWAYS run cleanup after test-api.ts.
- LOGIN MAPPING CORRECTION (live DB): 0776123456 = Kampalamart Scrap Dealers (tel +256776123456), 0772123456 = Nakato Fresh Produce, 0758123456 = Jinja Hardware Centre. Earlier worklog notes had 0772/0776 swapped. All passwords demo1234; all logins verified working.

Stage Summary:
- Task 7 delivery CONFIRMED healthy end-to-end after context restore: features live, tests green, zero console errors, feed clean. No code changes required in this pass.

---
Task ID: 8
Agent: main (Super Z)
Task: "how will customers identify a shop? two shops can have the same name" — shop identity system: DK-XXXX codes, printable QR poster, browse collision suffix, live same-name guard

Work Log:
- Brainstormed with the user; they chose: auto-assigned 4-digit shop code (till-number mental model) + printable QR on the shop page + location pairing on collisions + soft "suggest area" guard. Code surfaces: SHOP PAGE ONLY (their explicit pick — no cards/detail/share/search).
- Schema: BusinessProfile.shopCode String? @unique ("DK-4821" full string stored). Pushed, client regenerated. Restarted the dev server — first restart via `bun run dev` died twice within ~30s (both nohup and setsid variants); starting via `(setsid npm exec next dev -- >> dev.log 2>&1 &)` (the same npm-exec chain the platform uses) has been stable since. Lesson: when a self-started dev server keeps dying, mirror the platform's own start command.
- Backfill: scripts/backfill-shop-codes.ts — 8/8 seeded shops coded (Nakato DK-2623, Kampalamart DK-4658, Jinja Hardware DK-4081, Dodoma DK-0867, Jomo DK-8178, Pendo DK-7676, Mama Amina DK-6361, Kisumu DK-8113). Re-run safe (skips coded rows). seed.ts assigns codes at seed time (same algorithm, standalone copy).
- STABILITY RULE: the code is assigned once (profile create or backfill) and the profile PUT update branch deliberately never touches it — printed posters and word-of-mouth depend on it. Enforced by a test.
- generateShopCode() in lib/shop.ts (random DK-XXXX + unique check, 200 attempts); getShopPage returns shopCode; SHOP_OWNER_INCLUDE now selects profile.area/county so the feed can disambiguate; client types updated (ShopInfo.shopCode, BusinessProfileT.shopCode, ListingShopOwner.profile.area/county, ListingsPage.items carry owner).
- New public GET /api/shops/check-name?name=&exclude= — case/whitespace-insensitive match via shared normalizeShopName() (lib/format.ts), max 3 matches with area/county, `exclude` so sellers don't flag their own shop. 400 below 2 chars.
- ShopView: hero gains a "Shop code DK-XXXX" chip (Hash icon, mono). OWNER-ONLY "Your shop QR poster" section (useSession user.id === shop.id) with QR preview + "Show poster & print" → full-screen poster overlay (photo/name/area/QR/"Scan to see our shop on Duuka"/DK-code big/phone) + Print button. Print CSS in globals.css (.shop-poster visibility trick + .no-print) so only the poster hits paper. QR value = origin + /#/shop/[id] via useSyncExternalStore (server snapshot '' → hydration-safe; react-hooks/set-state-in-effect banned the earlier setState-in-effect approach). react-qr-code@2.2.0 added.
- Browse collision suffix: computeShopLabels() in listings-browse groups the CURRENT feed by normalized shop name; when ≥2 DISTINCT owners share a name, each card's chip renders "Name · area" (profile area → county → listing county). ListingCard gained a shopLabel override prop. One-shop-many-listings does NOT trigger it.
- Account → My Shop: seller sees "Your shop code is DK-XXXX — it never changes…"; typing a name another shop uses (debounced 450ms via useDebounced, React Query, hooks correctly placed ABOVE early returns after I caught a hook-order bug mid-build) shows a non-blocking amber hint: "Another shop already uses this name in {area}. You can still use it — buyers tell shops apart by area and shop code — so add your Area / town…". Own saved name never triggers it.
- Tests: new section 3d (11 tests) — code format, update-stability, shop-page parity, check-name taken/own-exclude/free/short, two new shops get distinct codes at creation, browse returns both same-name shops with areas, check-name sees duplicates. 106 → 117 tests, all passing. tsc clean (after typing ListingsPage items), eslint clean.
- E2E via :81 (390×844): typed "twin market" → chips read "Twin Name Market · Karen" vs "· Westlands" (fix verified live); Nakato shop as GUEST shows DK-2623 chip and NO poster section; signed in as owner → poster section appears → overlay screenshot (QR + DK-2623 + "Scan to see our shop on Duuka") → Account shows the code line (verified via innerText, a11y tree flattens spans) → typing "Jinja Hardware Centre" surfaces the amber hint with "in Kimaka, Jinja" → typing own name clears it. Screenshots: scripts/verify-shop-code-guest.png, verify-qr-poster.png, verify-name-clash-hint.png.
- Cleanup after suite + fixtures: 9 users / 6 listings removed → 8 seeded shops / 16 listings restored. No page errors in console (only Fast Refresh logs).

Stage Summary:
- Every shop now has a permanent, human-holdable identity: DK-XXXX code (stable for life, till-number familiarity), a printable QR poster that turns stall visitors into app users, automatic "· area" disambiguation when same-name shops share a feed, and a gentle upstream guard that nudges duplicate names toward adding their area. Duplicates are still ALLOWED — honestly handled, not blocked.
- 117/117 tests, tsc + eslint clean, browser-verified, fixtures cleaned. Logins unchanged (all demo1234): 0776123456 = Kampalamart, 0772123456 = Nakato Fresh, 0758123456 = Jinja Hardware, 0712345678 = Dodoma Agri, 0712000001..04 = KE shops.


---
Task ID: 9
Agent: main (Super Z)
Task: "yh do it... the app will need to ask for permission to access the shop's location keep in mind" — Near me: shop locations + distance + nearest-first browse (the Meituan/Grab pattern discussed)

Work Log:
- User approved the distance feature from the brainstorm; explicitly flagged the permission UX. Design honors it: geolocation is ONLY requested on an explicit tap, never on app open, on BOTH sides.
- Schema: BusinessProfile.lat/lng Float? added, db pushed, client regenerated. Dev server restarted via `(setsid npm exec next dev -- >> dev.log 2>&1 &)` (stable). First GET after push 500'd on the stale Prisma client — restart fixed (same lesson as Task 7).
- PRIVACY BY CONSTRUCTION: coordinates are rounded to 3 decimals (~100 m) BEFORE storing (roundCoord in lib/geo.ts) — a precise spot never exists server-side. Buyer coordinates ride on the query URL only, never persisted.
- New lib/geo.ts: haversineMeters + formatDistance ("160 m" / "2.7 km" / "16 km") + roundCoord — pure, shared server/client.
- New PUT /api/profile/location (the ONLY way coords enter the system): requireUser, profileLocationSchema (both coords or both null — half pairs 400), rounds at write, upsert. Create branch mints a minimal shop (businessName = account name, phone, shopCode) so a profile-less seller sharing their spot still becomes a findable shop. The MAIN profile PUT cannot touch coords because businessProfileSchema strips unknown keys — regular "Save shop" writes never clobber the location (enforced by a test).
- Nearest sort is SERVER-SIDE (page-honest, not per-browser-page): searchListings with sort=nearest + lat/lng scans matching rows (cap 500), haversine-ranks against each SHOP's blurred spot, paginates in memory; shops without a spot fall in AFTER located ones in freshness order. sort=nearest without coords degrades to freshness (200). listingQuerySchema: sort enum + 'nearest', lat/lng numeric params; /api/listings coerces them.
- SHOP_OWNER_INCLUDE profile select now carries lat/lng (pre-rounded) so cards can label distances; client types updated (BusinessProfileT, ListingShopOwner.profile, shop-view.tsx literal got lat/lng nulls).
- Buyer UI (listings-browse): "Near me" chip next to the sort select — idle → "Finding you…" (disabled) → "Near me ✓" (variant=default, aria-pressed) → tap again to turn off (reverts sort to newest). "Nearest first" appears in the sort select ONLY while location is on. Denial/unsupported → amber role=status hint, browsing fully usable. Geolocation options: enableHighAccuracy:false (network positioning — faster, battery-kind on cheap phones; market-level blur is all we need), timeout 10s, maximumAge 60s. Distance chips on cards via ListingCard distanceLabel prop (Navigation icon) computed from the SAME blurred coords the server ordered by — label always matches order.
- Seller UI (account-view ShopLocationBlock): "Stand at your shop, then tap. The browser asks for permission once — say yes and we save the spot. Nothing is tracked." Saved state shows "Saved ✓ — … Your exact spot is never shown; distances stay approximate." + Update / Remove. Denial → amber hint ("your Area / town still helps buyers find you"). Separate component → its own hooks, no ordering hazards.
- Fixtures: seed.ts profiles now carry plausible area-centre coords (3-decimal) for all 8 shops; scripts/backfill-shop-coords.ts (phone-keyed, re-run safe) updated the LIVE db — 8/8. scripts/check-coords.ts added for post-E2E checks.
- Tests: new Section 3e (13 tests) — 401 anon, 400 bad-lat, 400 half-pair, save 200, ~100 m blur assertion (-1.2881234 → -1.288), form-save preservation, minimal-shop create branch (name + DK code), nearest order flips Nairobi↔Kampala buyer, blurred coords on cards, graceful no-coords, removal, no-spot shops rank last. 117 → 130, all passing. tsc clean, eslint clean. Fixtures cleaned (8 users / 16 listings).
- E2E via :81 (390×844): guest sees "Near me" chip; headless DENIED the permission → amber fallback hint shown (screenshot verify-nearme-denied.png); granted path (set geo + stub) → "Near me ✓", sort "Nearest first", Nakato 160 m → Kampalamart 2.7 km → Jinja 74 km → ascending to 925 km, order exactly nearest-first (screenshot verify-nearme-on.png); toggle off restores newest + chips gone. Seller (0772123456 Kampalamart): "Saved ✓" + Update/Remove → Remove → "Add my shop location" → re-add via stub → "Shop location saved" toast (screenshot verify-seller-location.png). No horizontal overflow, zero page errors. DB: 8/8 profiles have coords; Kampalamart round-tripped 0.3162→0.316 (blur verified live); DK-4658 untouched.
- FIXTURE DRIFT FOUND + FIXED: feed showed 13 ACTIVE, not 14 — "Copper scrap, 99.5% clean" was ARCHIVED at 12:14 by the PREVIOUS session's E2E (cleanup-test-data checks counts, not statuses). Restored to ACTIVE via db. LESSON: cleanup should also assert seed listing statuses, not just row counts.

Stage Summary:
- Buyers can tap "Near me" (permission only on their own tap, denial never blocks) and the feed reorders NEAREST-FIRST with honest per-card distances; same-name shops now also disambiguate physically (the nearest Twin Name Market is simply on top). Sellers share their spot with one tap at the shop — stored blurred to ~100 m, removable, and unreachable by regular form saves. Everything degrades gracefully: no coords → area suffix + DK code still carry identity.
- 130/130 tests, tsc + eslint clean, browser-verified end to end, fixtures clean (14 ACTIVE seed listings). Logins unchanged (all demo1234): 0772123456 = Kampalamart, 0776123456 = Nakato Fresh, 0758123456 = Jinja Hardware, 0712345678 = Dodoma Agri, 0712000001..04 = KE shops.

---
Task ID: 10
Agent: main (Super Z)
Task: "audit recent build and report against the commands i set" — full audit of Tasks 7/8/9 build against the user's standing constraints

Work Log:
- Static battery: 130/130 test-api.ts (incl. sections 3c/3d/3e), tsc --noEmit exit 0, eslint exit 0. cleanup-test-data.ts run after the suite → 8 shops / 16 listings restored; live feed reports "14 listings found" (no status drift recurrence).
- Constraint grep-audits across src/: (1) ZERO mailto:/sms:/chat/inbox mechanisms — contact surfaces are exclusively telLink()/whatsappLink() from lib/format.ts; (2) PostgresSection exists ONLY in settings-view.tsx under "Advanced settings — PostgreSQL connection"; (3) every write endpoint (listings POST/PATCH/DELETE, refresh, profile, profile/location, upload, saved-searches, notifications, settings/postgres) is behind requireUser, while GET listings / GET shops/[id] / check-name are public by design ("No sign-in for buyers, ever" in code); (4) design tokens in globals.css: primary oklch(0.40 0.075 155) dark green on background oklch(0.977 0.004 85) warm off-white + warm stone secondary — anti-AI palette intact.
- Permission-rule audit: navigator.geolocation has exactly 2 call sites — listings-browse toggleNearMe() and account-view capture() — both plain click handlers, never effects. Confirmed live: guest page load fires NO permission; first tap in headless → denial → amber role=status fallback "Location is off — allow it when the browser asks…", feed fully usable.
- E2E via :81 (390×844): granted path via geo stub (headless `set geo` alone does NOT grant permission — harness nuance, not an app bug) → "Near me ✓", sort "Nearest first", per-card distance chips, order strictly ascending 3.7×5 → 74 → 266 → 393 → 507 → 806 km; guest shop page shows DK-2623 + "Complete shop profile" and NO poster section; hrefs verified: tel:+256776123456 / wa.me prefill / shop tel:+256772123456; zero page errors (console shows only HMR logs).

Stage Summary:
- AUDIT CLEAN on all six standing commands: buyer never needs an account; seller actions all gated; contact is pure tel:/wa.me; PostgreSQL only in Settings→Advanced; deep-green/warm-neutral design intact; location permission strictly tap-triggered with graceful denial. Build health green: 130/130, tsc/eslint clean, fixtures clean. No code changes made in this pass.

---
Task ID: 11
Agent: main (Super Z)
Task: "oki only need whats better for the app" — DK code lookup (till-number path) + poster "can't scan" line + owner WhatsApp share; claim-your-shop deliberately skipped

Work Log:
- Decision (from the three-way brainstorm): built ONLY what the app needs now — (1) public code lookup (the missing half of the DK identity: codes existed on posters but there was nowhere to TYPE one), (2) poster line teaching the code path, (3) owner "Share on WhatsApp" broadcast. Claim-your-shop SKIPPED: in Duuka shops exist only because the seller created them — nothing to claim until an agent-seeded directory ever exists.
- New shared helper normalizeShopCode() in lib/format.ts (client-safe, next to normalizeShopName): strips spaces/dashes, uppercases, requires DK+4 digits → canonical "DK-XXXX". Forgiving input, EXACT match — a mistyped till number must never open a stranger's shop.
- New public GET /api/shops/lookup?code= (no auth — buyers never sign in): 200 → { shop } card-slim payload (id/name/photoUrl/area/county/country/shopCode — deliberately NO phone/whatsapp, those come from the shop page after the tap); 400 malformed ("A shop code looks like DK-2623…"); 404 unknown naming the code back ("No shop with code DK-9999 — check the number with the shop"). lookupShopByCode() in lib/shop.ts reuses the stored unique shopCode.
- Browse UX (listings-browse.tsx): a code-shaped search query is a till-number punch, NOT a text search — the whole feed is replaced by the result: found → one ShopCodeCard (photo/initial, name, area, DK chip, whole card taps → #/shop/[id]); unknown → amber honest hint; malformed never reaches the API (client pattern gate). Normal text searches completely unchanged.
- Shop page (shop-view.tsx): poster gains "Can't scan? Type the code in Duuka search." under the big code; owner poster section gains "Share on WhatsApp" (wa.me/?text= pre-written broadcast: "Find {shop} on Duuka — our code is {DK-XXXX} — {origin/#/shop/id}", no recipient → seller picks chat/status); owner copy now says customers can type the code too. Share is OWNER-ONLY inside the existing isOwner section.
- OUTAGE + TWO LESSONS: (1) all endpoints 500'd at suite time — the running server's Turbopack cache held a stale module graph; a plain process restart (14:55) was NOT enough, `rm -rf .next` + restart via the proven setsid chain fixed it. Escalate to cache wipe when a restart doesn't clear PrismaClientValidationError "Unknown argument". (2) My first import put normalizeShopCode in lib/shop.ts and the client component imported it — lib/shop.ts imports lib/db (Prisma) → whole page 500'd with import trace auth.ts ← api.ts ← listings.ts ← shop.ts ← listings-browse.tsx. RULE: client components may import from lib/shop.ts TYPES only; pure helpers live in lib/format.ts.
- Tests: new Section 3f (6 tests) — code present on profile, anonymous exact hit, sloppy "dk 4821" variant, well-formed unknown → 404 (unknown code picked from DB itself so the negative test never depends on luck), malformed → 400, payload carries no phone/whatsapp/password. 130 → 136, all passing. tsc clean, eslint clean. Fixtures cleaned (8 shops / 16 listings).
- E2E via :81 (390×844): guest typed DK-2623 → "Shop for code DK-2623" + Nakato Fresh Produce card (Nakasero, Kampala · DK-2623 chip), feed fully suppressed; tap → Nakato shop page; DK-9999 → honest amber "No shop with code DK-9999 — check the number with the shop"; "dk 2623" (lowercase+space) → same shop; "matooke" → normal feed untouched (1 listing). Owner (0772123456): share href verified = https://wa.me/?text=Find%20Nakato%20Fresh%20Produce…DK-2623…shop-URL; poster shows the new can't-scan line; Kampalamart shop viewed as Nakato shows NO poster/share (owner gating intact). Screenshots: scripts/verify-code-lookup.png, verify-poster-scanline.png. Fresh-load console clean.

Stage Summary:
- The DK code is now a REAL till number: see it on a poster, hear it from a seller, or read it off a WhatsApp broadcast — then type it into the one search box everyone already knows, land on the exact shop. QR for camera-comfortable buyers, code for everyone else, share turns every seller into distribution. Claim-your-shop consciously deferred. 136/136 tests, tsc + eslint clean, browser-verified, fixtures clean.

---
Task ID: 12
Agent: main (Super Z)
Task: Convert product listings from list rows to photo-first blocks (user: "i dont want them listed, better as blocks") + restore two lost API routes discovered during verification.

Work Log:
- Buyer-facing surfaces converted to blocks; My Listings deliberately kept as rows (seller control panel: up to 6 action buttons per item would wrap unusably inside a 165px block).
- NEW ListingBlock (listing-card.tsx, same file as the untouched row ListingCard): photo top full-width aspect-[4/3] with TypeBadge overlay + "+N" count, 2-line-clamped title (min-h-10 keeps row heights even), bold price with discount strike/percent, quantity · location line, freshness-dot + timeAgo + distance line, and mt-auto buyer bar (shop chip row + Call | Chat split h-8 buttons) so contact never requires opening the listing. Shop catalogues omit the bar (already inside the shop).
- Grid: grid-cols-2 gap-2 / sm:grid-cols-3 sm:gap-3 / lg:grid-cols-4 in both listings-browse.tsx feed and shop-view.tsx catalogue; new ListingGridSkeleton mirrors exact column template; ListingListSkeleton kept for non-grid consumers (publish, saved-searches, notifications, account, detail).
- TWO ROUTES RESTORED — root cause: src/app/api/upload/route.ts and src/app/api/settings/postgres/test/route.ts were created in earlier sessions but NEVER git-committed (worklog Task 4 documents building /api/upload; audit grep even listed it). Untracked files were wiped between sessions. tsc/eslint/130-tests all stayed green because route files are discovered by path, not imported — silent 404s, 11 test failures. public/uploads/ still held real uploads, proving the route once worked. Fixtures pollution confirmed the outage history: 40 stale test users had accumulated ("Alice Test Shop" x3 broke check-name exclude test).
- Restored /api/upload: requireUser, 8MB cap → 413, magic-byte sniff (jpeg FF D8 FF / png 89 50 4E 47 / webp RIFF…WEBP) → 400 on mismatch, random hex-hex name into public/uploads/, 201 { url: '/uploads/<name>' }. Restored /api/settings/postgres/test: requireUser, no saved config → 400, resolveTarget → real testTcpConnection → 200 { ok, message }. UI impact: PhotoPicker posts /api/upload, so shop/listing photo upload was DOWN until this restore.
- LESSON: after any session, `git status --short` untracked source files = next session's silent outage. Route files must be committed or re-verifiable. LESSON 2: run cleanup-test-data.ts even after FAILED suite runs — 11 failures masked 40 stale users.
- Tests: 136/136 passing after restore + fresh cleanup (8 seed users / 16 listings restored). tsc clean, eslint clean.
- E2E via :81 (390×844): feed = 2 cols × 175px, photo ratio 1.33, tel:+256… and wa.me/?text=Hi%2C… hrefs correct per card; Nakato shop catalogue = 2-col blocks, 0 visit-shop chips (redundancy correctly dropped), 3 cards; login 0772123456 → owner poster + "Share on WhatsApp" intact (also re-confirms 0772123456 = Nakato Fresh Produce, contradicting the older Task 9/10 summary mapping); My Listings = 0 grids, 3 action strips with Edit buttons (row regression clean); 0 console errors, 0 page errors. Screenshots: scripts/verify-blocks-feed.png, scripts/verify-blocks-shop.png.

Stage Summary:
- Products are now blocks: photo-first 2/3/4-column grid on browse + shop catalogue, contact actions still on every card without opening anything. Seller dashboard stays rows on purpose. Two lost routes (upload, postgres test) restored from documented behavior — the suite is honestly green again at 136/136. Fixtures clean.

---
Task ID: 13
Agent: main (Super Z)
Task: Buyer basket — per-shop lists that end as one WhatsApp message per seller (user: "can i have like a cart"). Design agreed in chat: NOT a checkout cart (no payment/delivery exists; contact must stay pure tel:/wa.me per rule 3) but a kikuubo-style list.

Work Log:
- lib/basket.ts (new): hand-rolled localStorage store (duuka.basket.v1) + useSyncExternalStore. Keyed BY SHOP ({shopId: {listingId: {title, price, currency, unit, qty}}}) + shop snapshot (name, photoUrl, phone, whatsapp) taken at first add — one seller fulfills one list; multiple shops = multiple baskets, each sends separately. OFFERs only (REQUESTs are things buyers SELL into). Caps: 20 lines/shop, qty 99. orderMessage() builds "Hi {shop}! I'd like to order from your Duuka shop: • item — qty unit @ USh X / Is everything available?"; orderWhatsAppHref = wa.me/<digits>?text=; basketSubtotal() refuses mixed currencies. Rules honored: buyers never sign in (storage is on their phone), contact stays pure links, honesty in copy ("estimate — the seller confirms").
- REAL BUG caught in E2E: first version passed a FRESH parse of localStorage as getSnapshot → React "result of getSnapshot should be cached" → client crash overlay on first add. Fix: parse-once at module init (SSR → EMPTY), getSnapshot returns the cached module state. Lesson: any useSyncExternalStore over localStorage must cache the snapshot; re-parse belongs in commit() only. Hydration stays safe via the EMPTY server snapshot (no flash logic needed).
- Surfaces: ListingBlock photo area restructured — open affordance is now an inset-0 click LAYER so the add button (Plus, black/60 circle, bottom-left, z-20) is a real sibling (nested buttons are invalid HTML); REQUEST blocks get no add button. ListingDetail: "Add to basket" (secondary, full-width) directly under the price. Shop catalogues + browse feed both wired via useAddToBasket() (exported from basket-view.tsx, same pattern as ErrorState from listings-browse) → toast on success/failure, never silent.
- basket-view.tsx (new, route #/basket): per-shop sections (shop header taps through), lines with qty stepper (minus disabled at 1) + tap-through titles, live status re-check per line via public GET /api/listings/[id] (GONE/EXPIRED/FULFILLED → amber flag, excluded from the message, send disabled when nothing is sendable), subtotal estimate, Send list on WhatsApp + Call with list per shop, Clear this list. Empty state explains the model honestly ("lives on this phone").
- Header: ShoppingBasket icon in the right cluster (all viewports), green badge = total line count (distinct from red alerts badge), aria-current on basket view. Bottom nav untouched (5 items stay; basket is buyer-transient, header suffices). store.ts: 'basket' ViewName + hash both directions.
- Tests: 136/136 (no API changes — pure client feature over existing public endpoints). tsc clean, eslint clean. Fixtures clean (8 users / 16 listings).
- E2E via :81 (390×844, guest): 11 add buttons in feed, both REQUESTs correctly absent; matooke (Nakato) + copper (Kampalamart) → badge "Basket — 2 items"; basket view = 2 shop sections; wa.me hrefs carry correct digits (256772123456 / 256776123456) + encoded order text; tel: links correct; subtotals "USh 36,000 / USh 20,000 estimate — the seller confirms"; qty stepper → 3 bunches, badge stays line-count; reload on #/basket → basket intact (deep link + persistence); fresh session console = 0 errors. localStorage cleared after test. Screenshots: scripts/verify-basket-view.png, scripts/verify-basket-feed.png.

Stage Summary:
- Buyers can now collect across the whole market and send each seller a clean, complete list on WhatsApp — the closest thing to a cart that stays true to Duuka: no login, no checkout, no in-app chat, just a better message. Per-shop lists mirror real market behavior; stale-item flags keep the honesty bar. 136/136, browser-verified, fixtures clean.

---
Task ID: 14
Agent: Super Z (main)
Task: Motion layer — make the app feel alive (user brief: basket fills up as you shop but never fully, photo hover zoom, press feedback, "retouch so it feels alive and artsy"). Plus confirm double-tap add increments qty.

Work Log:
- Confirmed the user's core ask was already true: addToBasket() increments qty on repeat taps (qty+1, cap 99). E2E-verified live: double-tap matooke add → basket view shows "Quantity: 2", subtotal 36,000 estimate.
- basket.ts: added basketUnits() (sum of all line qty across shops) — distinct from basketCount (lines). Badge = how many DIFFERENT things; fill = how MUCH stuff, so re-adds visibly fill.
- NEW src/components/commerce/basket-icon.tsx: BasketGlyph — lucide ShoppingBasket paths with a fill rect clipped to the basket body, moved by transform only (translateY in viewBox units). fill prop = fraction of body; header caps at 0.85 → never reaches the brim. useId for the clipPath.
- app-header.tsx: fill level = min(0.85, sqrt(units/14)) (first item ≈ 27% of body, visible immediately; 14 units = as full as it gets). Pop on add = WAAPI one-shot scale 1→1.14→1 220ms + badge bump via badgeRef.animate — refs only, NO setState in effect (eslint react-hooks/set-state-in-effect caught the first attempt; WAAPI-on-refs is the compliant pattern). Pop/bump fire only on units GROWTH during the visit — initial ref seeding prevents reload-with-saved-basket from faking an add.
- globals.css motion layer: .basket-fill (transition transform 600ms cubic-bezier(0.23,1,0.32,1) — a TRANSITION so rapid adds retarget mid-flight; 600ms is the deliberate exception the user explicitly asked for), .press (transform+colors exact properties, :active scale(0.97) 160ms), reduced-motion block (fill jumps instantly, press keeps colors only).
- ListingBlock: group/photo on the photo container + group-hover/photo:scale-[1.04] 300ms ease-out on ListingPhoto (className passthrough hits img AND glyph fallback); add button = press + useAddedFlash (Plus→Check 150ms zoom-in-75, emerald-300, 1.2s); buyer bar chip/Call/Chat → press. onAdd type now boolean | void so the flash only fires on REAL success (addToBasket reports back).
- listing-detail.tsx: gallery imgs wrapped in per-photo overflow-hidden divs (zoom can't spill onto neighbors in the rail) with hover:scale-[1.03]; Add-to-basket flashes Check + "Added to basket" (press); Call/WhatsApp/directions/visit-shop → press.
- basket-view.tsx: useAddToBasket returns boolean; NEW useAddedFlash() hook (timer-cleaned); shop sections enter with animate-in fade-in slide-in-from-bottom-2 300ms + 40ms stagger (inline animationDuration/Delay/FillMode both — avoids depending on tw-animate-css duration utilities); steppers/CTAs/clear → press.
- tsc clean, eslint clean, test-api 136/136, cleanup-test-data run (8 users/16 listings seed state).

E2E via :81 (guest, 390×844 then desktop):
- Double-tap → qty 2 ✓; badge line-count semantics intact (1 line = "1 item") ✓; fill transform exactly matches the sqrt curve (units 2 → translateY 16.78px; units 3 → 15.99px — fill ROSE live between adds) ✓
- Press: held mouse down on add button → computed transform matrix(0.97...) ✓; released → Check flash rendered ✓ (screenshot caught ✓ + toast + badge 2 together)
- Hover zoom: compiled rule verified as @media (hover: hover) { ...group-hover/photo:scale-[1.04]... scale: 1.04 } — headless env reports hover:none (touch emulation) so the gate SUPPRESSES it, exactly as it will on real phones. Interactive-hover proof requires a pointer device; structural + gating proof done. NOTE: Tailwind v4 compiles scale utilities to the standalone `scale` property, not transform — computed transform reads "none" even when hovered.
- wa.me hrefs carry per-shop order text to correct digits; reload on #/basket keeps basket + qty; two shop sections render; localStorage cleared after test. Zero console errors in final session. Screenshots: scripts/verify-motion-header-fill.png, verify-motion-basket-view.png, verify-motion-added-flash.png.

Stage Summary:
- The basket now answers every tap three ways: the button flashes Check, the toast confirms, and the header basket's green goods-layer visibly RISES (never to the brim). Photos lean in under a real cursor, every pressable answers the finger at 0.97, the basket view enters with a gentle stagger. All transform/opacity, all reduced-motion-guarded, zero API changes. 136/136.

---
Task ID: 15
Agent: Super Z (main)
Task: Micro-feedback completeness pass (user brief: hearts that pop, empty states with one clear action, skeletons over spinners, consistent thicker icon strokes on mobile, price-change flashes green/red — "DO YOU GET THE PICTURE"). Mapped each principle to Duuka's real surfaces; filled the gaps.

Work Log:
- GAP ANALYSIS first: press-depress/add-flash/badge-bump/basket-fill/photo-zoom/stagger already shipped in 13/14; all 8 EmptyState callers already pass icon+title+action; skeletons already cover every loading surface (only spinners left are button-level in photo-picker, correct). What was genuinely missing: hearts, the number-flash cue, empty-state artistry, touch stroke weight — and --destructive was still stock-shadcn cool red.
- lib/loved.ts (new): the buyer's shortlist — duuka.loved.v1, same parse-once + useSyncExternalStore + EMPTY-server-snapshot pattern as basket.ts. Stores only listing ids (newest first, cap 40). toggleLoved returns 'loved'|'unloved'|'full' so the pop NEVER fakes success and the cap explains itself. A heart is "find this again", a softer intent than the basket's "I'm taking this" — so OFFERs only, and the shelf re-checks availability like the basket does.
- listing-card.tsx: HeartButton (exported, two variants: on-photo dark circle / detail light circle). Pop = CSS keyframes (heart-pop 340ms, scale 0.55→1.28→0.94→1) replayed by remounting the icon via key — no refs, no state. Loved = fill-destructive warm red on the dark photo; full cap → honest destructive toast. Placed top-right of the block photo (add button bottom-left, TypeBadge top-left, photo count bottom-right — corners all speak).
- listing-detail.tsx: heart sits in the price row (ml-auto), next to "this is what it costs" = "come back to this one".
- listings-browse.tsx: "Loved" mode chip (Near me family: aria-pressed, live count badge). ON → LovedShelf replaces the whole feed (explicit intent wins over code-punch/search). Shelf re-fetches every loved id via public GET; 404 → auto-unlove (a heart on a ghost eats a slot); ACTIVE items render as regular ListingBlocks; expired/fulfilled land in an amber honesty strip ("no longer available — tap the heart to forget it"); loading = ListingGridSkeleton (skeletons not spinners); typing exits Loved mode (different intent).
- basket-view.tsx: THE number-flash cue (Duuka has no bids; the subtotal is the number that moves). On any qty edit the subtotal span WAAPI-flashes 900ms: emerald-700 green for up, var(--destructive) warm red for down, easing back to the settled color captured via getComputedStyle. Plus QtyNumber: the qty digit itself pulses (scale 1→1.25→1, 180ms) so the eye finds what moved. Both reduced-motion-guarded, both WAAPI-on-refs (no setState-in-effect — the eslint rule from Task 14 respected).
- globals.css: heart-pop keyframes + reduced-motion guard; @media (pointer: coarse) { .lucide, svg[stroke-width="2"] { stroke-width: 2.25px } } — CSS beats the SVG presentation attribute, one rule thickens EVERY icon on touch screens exactly as briefed (verified: lucide svgs carry stroke-width="2" and match both selectors; rule compiled into the stylesheet). EmptyState upgraded to a "stamped label": tilted (−3°) dashed-border rounded chip on accent tint — the mark a market seller puts on a crate — plus a 250ms fade/zoom entrance.
- PALETTE (the pending destructive tweak, now done): light oklch(0.577 0.215 27.3) → oklch(0.55 0.17 26) warm brick red — calmer, and white text on it jumps from ~3.9:1 to 5.29:1 AA. Dark token was FAILING (3.62:1) — swept L candidates, 0.58 0.16 26 clears AA at 4.63:1. scripts/destructive-contrast.ts (one-off, name-prefixed to not collide with palette-contrast.ts globals). palette-contrast.ts rerun: all 9 pairs still pass (body 15.59:1, muted 5.38:1, white/primary 8.51:1, dark 16.59:1...).
- REBUILT src/app/api/settings/postgres/test/route.ts — found missing from disk AND from git (never committed; only the D-flagged upload route showed). Same cross-session loss class as Task 12's upload route. Faithful rebuild per worklog spec: requireUser, 400 when no config saved (honest copy), resolveTarget → testTcpConnection → { ok, latencyMs?, message }; global for any signed-in user (deployment config, not user data).
- 136/136 restored after cleanup (the check-name failure was 16 stale test users from a crashed pre-cleanup run — cleanup-test-data protocol reconfirmed). tsc clean, eslint clean, fixtures back to 8 users / 16 listings.
- E2E via :81 (guest, 390×844 touch emulation): heart tap → aria-pressed=true, label flips to "Remove…", heart-pop class live, fill-destructive ✓; Loved chip counts (1); shelf renders "Your shortlist · 1 item, newest first — lives on this phone" with the block; RELOAD → chip still "Loved 1", localStorage intact ✓; unlove → stamped empty state ("Nothing loved yet" + Browse listings) ✓; double-tap add → qty 2, badge stays line-count ✓; basket: subtotal USh 40,000 → tap + → USh 60,000 with LIVE 900ms keyframes rgb(4,120,87) green → settle ✓; tap − → USh 40,000 with var(--destructive) red flash ✓; qty digit pulse animation running ✓. pointer:coarse is false in headless (no pointer at all) so the 2.25px stroke is gated — structural proof done (rule present + selectors match), real proof on real hardware, same as the hover zoom. localStorage cleared after test, 0 console errors, screenshots: verify-loved-shelf.png, verify-empty-stamp.png, verify-subtotal-flash.png.

Stage Summary:
- Every tap now answers three ways: shape (press), state (flash/pop/fill), and words (toast) — and the two numbers that ever move (qty, subtotal) flash green/red like a ticker. Hearts give buyers a no-login shortlist that re-checks reality like the basket does. Empty states wear a stamped-label mark with exactly one next action. Icons read 2.25px on touch screens via one CSS rule. The destructive red is warm brick and now passes AA in BOTH themes (dark was failing at 3.62:1 — fixed to 4.63:1). The lost postgres/test route is rebuilt and committed-bound. 136/136, browser-verified, fixtures clean.

---
Task ID: 16
Agent: Super Z (main)
Task: Notifications feel + seller-side polish (user: "CLEAR NOTIFICATIONS BUTTON, also if a notification comes or if you got notifications, you can actually see that little bell shake for these pop timing and seller side polish... i just want whats better for the people"). Same five-principle treatment as Task 15, mapped onto alerts and seller surfaces.

Work Log:
- BELL SHAKE (the brief's two triggers, both built): (1) a notification ARRIVES while you're using the app — unread count grows during the visit → swing; (2) you HAVE notifications when the bell first becomes visible (sign-in into an account with unread; includes arriving with unread on session start) → swing. Reading alerts (count falling) is deliberately quiet — the bell never scolds you for catching up.
- NEW src/hooks/use-bell-shake.ts: WAAPI one-shot on a DOM ref (the established Task 14 pattern — external-system change mutated from an effect, no setState, no cascading render). Keyframes = a DECAYING PENDULUM: rotate 0 → −16° → 13° → −9° → 6° → −2.5° → 0 over 700ms, cubic-bezier(0.23,1,0.32,1), transform-origin 50% 18% so it hangs from its crown. seenRef seeding: prev===null (first knowledge in visit) or unread>prev both fire; decrease never does. prefers-reduced-motion → no swing.
- Wired in BOTH navs: app-header desktop Alerts link + bottom-nav mobile Alerts (the primary nav on the phones this app is built for). Each wraps only its glyph in the ref span — the swing never moves the label or badge. Both fire in sync off the shared ['notifications','badge'] query.
- CLEAR NOTIFICATIONS (a real delete, not a re-skin of mark-read): DELETE /api/notifications?ids=a,b|all in the same route file (no new route) — deleteMany scoped by userId, foreign ids can never match. UI: trash button appears when ANY notifications exist (icon-only on mobile with aria-label/title "Clear all alerts"), opens AlertDialog: "Clear all alerts? Every alert — read and unread — is removed for good. Marking them read keeps the history; clearing does not." Keep them / Clear alerts (destructive). After clear → stamped empty state + badge gone. Mark all read KEPT alongside: read = history stays, clear = gone forever — two honest intents, never conflated.
- Notifications view micro-feedback: press on Back / Mark all read / Clear / every alert row; rows enter with the basket-view stagger (fade-in slide-in-from-bottom-2 300ms, 40ms steps, cap 8).
- SELLER SIDE (the "what's better for the people" pass — gaps found by audit, not invented):
  * PER-ROW PENDING FIX (real UX bug): my-listings' three mutations shared one isPending, so refreshing listing A disabled Refresh/Edit/Fulfil on listings B and C. Now onMutate records {id, action} and onSettled clears — only the acting row pauses, same-row buttons pause together (one listing shouldn't race itself), every other row stays live. Same fix for saved-searches "Check now" (checkingId; read-only so other rows never paused — only the tapped row).
  * RefreshCw spins while its row's refresh runs; the refreshed row's expiry label remounts (key flash-<tick>) with NEW .flash-good keyframes — green (var(--primary)) hold 55%, ease back to muted at 900ms. The seller's one number that moves answers like the buyer's subtotal does. Reduced-motion: color jump stays, fade dropped.
  * press on every seller control: my-listings 15/15 action buttons (Refresh/Edit/Mark fulfilled/Repost/Archive/Delete), publish form (OFFER/REQUEST toggles, Publish, Cancels, Save changes), account (Save shop, location Update/Remove/Add), saved-searches (Apply/Check now/Remove), notifications (above). Buyer surfaces were press-covered since Task 14; now EVERY pressable in the app answers the finger.
- Tests: Section 7 grew by 6 — anon DELETE → 401; bob's clear-all never touches Carol's rows (count preserved, carolCount>0); missing ids param → 400; clear-all → 200; list + unreadCount both 0 after. 136 → 142/142.
- E2E via :81 (390×844, signed in as Nakato +256772123456): seeded real notifications (scripts/seed-notifications.ts, phone-variant lookup 07…/+256…/256…). WAAPI RECORDER (patched Element.prototype.animate logging rotate-keyframe calls) proved both triggers live: (1) insert alert mid-session + visibilitychange refetch → TWO swings logged (desktop+mobile bells, dur 700, origin 50% 18%) with badge 3→4 in both navs; (2) sign-out (quiet — no fake shake) → sign-in with unread in DB → two swings again. Alert-tap marks read → badge gone. Clear flow: dialog → Keep them (26 rows intact) → Clear → stamped "No alerts yet" + "Go to saved searches" CTA, badge gone. Seller: refresh on eggs row → toast + expiry label flash-good reading "30 days left"; refresh on matooke correctly cooling ("Refresh in 1h", disabled); publish form toggles+submit press confirmed via eval. 0 page errors, 0 console errors. Screenshots: verify-bell-badge.png, verify-alerts-list.png, verify-alerts-cleared.png, verify-bell-on-signin.png, verify-seller-refresh-flash.png.
- Cleanup: seeded notifications deleted by title (2 + the cleared set), cleanup-test-data run → 8 users / 16 listings. Everything committed INCLUDING new source files (Task 12's untracked-files lesson).

Stage Summary:
- Alerts now have a body language: the bell swings from its crown when news arrives and when you arrive to news — and goes quiet the moment you've read up. Clearing is real (delete with an honest confirm) while mark-all-read keeps history. The seller side got the same three-way answer the buyer has had since Task 14/15: per-row action states that never grey out the whole panel, a spinner on the working button, a green flash on the expiry number that just moved, and press feedback on all 20+ seller controls. 142/142, tsc + eslint clean, browser-verified on both triggers, fixtures clean.

---
Task ID: 17
Agent: main (Super Z)
Task: Shop-as-account identity hero — from the user's ChatGPT concept board (user approved: "i like how you think, do it")

Work Log:
- Reviewed the user's 3-panel concept board (browse / shop page / QR poster). Matched it against the live app: concept already converged on our ListingBlock cards, palette (#18583B ≈ our primary), DK codes, QR poster. Adopted its best idea (shop-as-account) and rejected its two dishonest elements: ★4.8 fake reviews (collides with buyer-no-login + gaming risk) and auto opening-hours (stale "Open" destroys trust).
- Serif display layer: Fraunces via next/font/google (layout.tsx, --font-fraunces) → @theme --font-display → font-display utility. Body stays Geist; serif only at display sizes (shop h1, poster h2, auth welcome).
- Shop identity hero rebuilt (shop-view.tsx): full-width cover photo (h-36/h-48, object-cover; text never overlays seller photos), serif brand-green h1, location/hours line, trust chips (one green star "Phone confirmed" + quiet Complete-profile/listings/Since chips), description inline, Call shop (solid, press) + WhatsApp (outline, press).
- Honesty engineering: serializer exposes phoneConfirmed ONLY when the displayed phone IS the seller's login line — !profile?.phone || samePhoneLine(profile.phone, user.phone) via phoneCandidates() overlap (lib/shop.ts + ShopPageData + client ShopInfo type). Chip renders only when true; no unverifiable "verified" claims.
- Buyer bridge card ("Find this shop again"): QR + mono DK-code + "type it into Duuka search like a till number" + Copy button with Copied-check swap micro-feedback (1600ms revert) + Share on WhatsApp with buyer voice ("Found … shop code …"); owner keeps the poster tool instead — never two QRs on one page. Share text is audience-aware (owner "our code" / buyer "found").
- Lettermark fallback: no photo → flat green signboard band with serif initial (designed, not broken).
- Small doses: auth dialog welcome in serif green; footer line now "Local shops. Bigger opportunities. Every contact connects you directly."
- Fixed pre-existing tsc failure in scripts/seed-notifications.ts (let user: User | null). Repo-wide tsc + eslint clean again.
- Verification: 142/142 test-api, cleanup-test-data (8 shops / 16 listings intact), agent-browser E2E via :81: guest hero (mobile 375 + desktop 1440 screenshots), Copy→"Copied", hrefs pure tel:+256772123456 / wa.me / buyer share text, lettermark branch (temp-nulled Kampalamart photo → screenshot → restored exact seed value, API-verified), owner view (poster tool, no bridge). Console clean.
- Screenshots: scripts/verify-shop-hero-guest-mobile.png, verify-shop-hero-guest-desktop.png, verify-shop-lettermark.png

Stage Summary:
- Shop page is now the seller's online home — signboard serif name, cover photo, honest trust chips, direct CTAs, till-number bridge. Zero schema changes; one derived boolean (phoneConfirmed) added to the shop payload. 142/142, tsc/eslint clean, committed 14963f6.
- Deliberately NOT built from the concept: reviews/ratings (phase 2, needs honest identity), auto hours (only a seller-toggled state would be honest), marketing landing page (utility stays first).

---
Task ID: 18
Agent: main (Super Z)
Task: The authored 20% — user rejected template-feel on the shop page ("it still looks generic... the seller should feel ownership, the buyer should feel wanted and welcomed... a tag of maybe 20% something that has been built for customers")

Work Log:
- Composition audit first: the Task-17 hero had all the INFO but read as "shop profile template" — four-chip soup (buyers were shown the seller's private "Profile 4/5" to-do), no greeting, no signature mark, generic contact strip. Cut the soup; built intention in its place.
- KARIBU eyebrow (buyer only): text-[11px] uppercase tracking-[0.18em] "Karibu · welcome" above the serif name — the greeting East Africa actually uses. Owner never sees it (they don't greet themselves); the slot stays honest per audience.
- Signboard stroke: hand-drawn painter's underline under the serif h1 (SVG path, pathLength=1, stroke-dasharray 1) drawn in ONCE on open via .sign-draw keyframes (700ms, 350ms delay, cubic-bezier(0.23,1,0.32,1)) — like the stroke a Kampala sign painter puts under a shop name. Reduced-motion: animation none, stroke fully painted (dashoffset defaults 0). Sits still after drawing — a sign is painted once.
- OWNER MIRROR STRIP (the ownership moment): isOwner-only section above the hero card — Eye icon + "This is your shop — exactly what buyers see." + Edit shop button (→ account view). Buyer never knows the strip exists. This answers the new seller's first question ("what do customers actually get shown?") in place.
- Chip honesty split: buyers get exactly ONE chip (Phone confirmed — the only claim we can prove); profile-completeness chip moved to owner-only (it's the seller's to-do, not buyer info); listings count + "Since" moved into the meta line (📍 area · hours · "On Duuka since Mon YYYY" · mono DK-2623) — identity as facts, not badges.
- Description slot now works for whoever is reading: buyer+no description → honest italic "The shop hasn't written its story yet — the listings and the phone line speak for it." (no invented copy, ever); OWNER+no description → dashed accent-tinted slot "Add a few words about your shop — buyers read them right here." with a "Write it" pen-button (→ account). The empty slot hands the owner the pen.
- Contact strip voice: buyer — "Straight to the shop, no middleman — your call or message rings their phone."; owner — "Buyers tap these — the call or message lands straight on your phone." Same links, mirrored meaning.
- Catalogue position line: "Posted by the shop — prices are theirs, not ours." under "In this shop (N)" — the platform's no-middleman stance in one sentence; trust in the seller is what makes the buyer trust the seller.
- Empty shelf per audience: buyer — "Nothing on the shelf right now… the stall may still have stock. Call or WhatsApp above, or browse other shops." (CTA-aware, honest speculation framed as advice); owner — "Buyers are landing on this page — post a listing and the shelf fills up." with Post-a-listing CTA (→ publish).
- BUG FIX (found by E2E, real user impact): providers.tsx HashSync called setImmediate() — Node-only, ReferenceError in every browser. EVERY external hashchange (opening a shared shop link while the app is already open, browser back/forward) threw and left the page stuck on the old view. Now setTimeout(fn, 0) with the same defer semantics. Proven live: external hash → shop navigates correctly, zero new page errors (6 stale pre-fix entries remain in the recorder log, all setImmediate stacks).
- BUG FIX (demo chips swapped): auth-dialog DEMO_ACCOUNTS labeled 0772123456 as "Kampalamart" and 0776123456 as "Nakato Fresh" — seed truth is the opposite (Nakato=+256772123456, Kampalamart=+256776123456). Anyone using the one-tap demo fill signed in as the WRONG shop. Swapped the labels.
- Verification: tsc + eslint clean; 142/142 test-api; cleanup-test-data (8 users / 16 listings); agent-browser E2E via :81 — buyer guest (Karibu eyebrow case+tracking verified, Fraunces serif h1, stroke dashoffset 0 after draw, single chip, meta line with DK-2623, no profile/listings chip leak, pure tel:+256772123456 and wa.me hrefs) and owner (mirror strip text, no Karibu leak, "Complete shop profile" chip, mirror contact line, poster tool present, buyer bridge absent); description null→dashed "Write it" slot verified then restored EXACTLY via API round-trip (seed text back, 200). Screenshots: scripts/verify-shop-authored-buyer-mobile.png, -buyer-desktop.png, -owner-mobile.png, -owner-desktop.png, -owner-writeit.png.

Stage Summary:
- The shop page now has its 20%: a greeting in the language of the market, a signboard stroke that is painted once, a mirror strip that tells the seller "this is yours", one honest chip instead of badge soup, and copy that talks to whoever is reading — buyer or owner — in Duuka's own voice. Two real bugs fixed along the way: a router that crashed on every externally-triggered hashchange (Node-only API in browser code) and swapped demo-account labels that logged reviewers in as the wrong shop. Zero API/schema changes for the design layer. 142/142, tsc/eslint clean, fixtures clean, browser-verified both audiences.

---
Task ID: 19
Agent: main (Super Z)
Task: The Duka curve — user brought ChatGPT's design-language breakdown ("i love how he used curves to give it a design, think about it"). Adopt the sweeping curve as brand signature, with discipline.

Work Log:
- Adopted ONE idea from the concept breakdown: the sweeping green curve as the recurring brand edge. Everything else in the breakdown (serif+sans voices, cream paper, market photography, market-notice cards, QR poster system, shop-as-first-class, anti-SaaS restraint) already exists in Duuka from Tasks 1–18 — confirmed point by point before writing anything.
- Established the discipline rule in code (DukaCurve doc comment): the curve appears ONLY on doorway surfaces and NEVER on functional ones. Cards, forms, lists, chips stay rectangles — a signature that shows up everywhere is just decoration again. This mirrors the concept's own table ("organic curves + restrained rectangles", "cards functional, not decorative").
- DukaCurve component (shop-view.tsx): single SVG path `M0 7.2 C 26 8.8, 58 2.6, 100 1.6 L 100 10 L 0 10 Z` in viewBox 0 0 100 10 with preserveAspectRatio=none — the colored mass sits low-left and sweeps up-right, ONE chirality on every surface. Filled with currentColor so the same path works over any background: text-card (the surface that follows) / text-primary (print band). Decorative only: aria-hidden, no text rides on it, nothing animates (no reduced-motion surface needed).
- Doorway 1 — shop cover photo seam: photo wrapped in relative container, DukaCurve absolute at the bottom edge (h-5 mobile / h-6 sm) filled text-card. The photo flows into the identity card through the sweep. The Task-17 contrast promise is preserved: the curve shapes the SEAM, carries no text; text still never overlays seller photos.
- Doorway 2 — lettermark signboard (no photo): same curve at the bottom of the green band with the serif initial — the doorway keeps its shape with or without a photo. (E2E verified by temporarily nulling the photo via PUT /api/profile — which also triggered the app's own "Add a shop photo" checklist nudge, a nice cross-system confirmation — then restoring the seed photoUrl exactly, API-verified.)
- Doorway 3 — the printed QR poster (the physical surface): poster card restructured (overflow-hidden, white inner p-8) — QR + mono code stay black-on-white ABOVE the curve (the one number that must survive any printer gets the most reliable ink), then DukaCurve in primary green sweeps into a solid green band carrying "Scan to see our shop on Duuka" + "Or call us: {phone}" in white (white on #18583B ≈ 8.5:1). A shopper in Nakasero should recognize a Duuka poster from across the row — the curve now leaves the screen and enters the market.
- Deliberately NOT curved (restraint ledger): listing cards, browse feed, forms, chips, buttons, basket, empty states (the stamped crate label is already the empty-state signature — two signatures on one surface is noise), auth dialog (functional surface).
- Verification: tsc + eslint clean; 142/142 test-api; cleanup-test-data (8 users / 16 listings); agent-browser E2E via :81 — owner poster dialog screenshot (curve + green band + print-safe code), guest hero mobile + desktop (curve seam live on photo), lettermark mobile (curve on green band), photo restored via API round-trip. Screenshots: scripts/verify-curve-poster.png, verify-curve-hero-guest-mobile.png, verify-curve-hero-guest-desktop.png, verify-curve-lettermark.png.

Stage Summary:
- Duuka has its first true signature element: one sweeping edge, one direction, three doorway surfaces (cover seam, lettermark, printed poster) and nowhere else — the restraint is the design. The poster now carries the brand into the physical market, which is the whole thesis of the app: a digital layer on top of a real one. Zero API/schema changes; 142/142; fixtures clean; browser-verified.

---
Task ID: 20
Agent: main (Super Z)
Task: "The curve, out loud" — user came back after Task 19 with "i am not seeing these changes bro. doSOMETHING". Task 19's restraint had hidden the curve on surfaces the user never looks at (a 20px cover seam, the no-photo lettermark fallback, the print dialog). The signature must live on the surfaces every user actually sees.

Work Log:
- Diagnosis first: opened the app cold and confirmed the complaint — browse opened straight into a search box, the header logo was a generic lucide Store icon, and both Task-19 curve instances were effectively invisible in normal use. The manifesto's #1 point (hero boundary, "remove the logo and still know This is Duka") was unmet.
- DukaCurve extracted from shop-view.tsx into src/components/commerce/duka-curve.tsx (same path, same discipline doc comment, doorway list updated) so more than one surface can carry it.
- THE FRONT-DOOR RIBBON (the poster move, browse page): a deep-green band that rises out of the page through the DukaCurve on top and flows back in through a second DukaCurve below — the same stroke used twice, framing the words. Geometry bonus discovered while building: top strip (text-primary) adds green thickness at the same rate the bottom strip (text-background) removes it, so the band reads as a constant-weight ribbon whose edges sweep in parallel — a painted banner, not a rectangle with rounded corners. Copy in Duuka voice: eyebrow "Karibu · Uganda · Tanzania", serif Fraunces h1 "The market, on your phone." (now the browse page's real h1), subline "Real shops post what they sell and what they need — you call or message them direct, no middleman." Compact on purpose (~150px mobile): search stays one glance away.
- HEADER LETTERMARK: the generic Store icon replaced by the mark itself — green rounded chip with the white DukaCurve sweeping across its bottom (DukaCurve text-primary-foreground, aria-hidden; wordmark beside it carries the name). The brand signature now sits on every page at every scroll. Footer keeps its Store icon.
- Restraint ledger unchanged: cards, forms, lists, chips, buttons, empty states, auth dialog stay rectangles. The ribbon appears exactly once in the app (browse doorway); the header chip is the miniature echo.
- Verification: tsc + eslint clean; 142/142 test-api; cleanup-test-data (8 users / 16 listings); agent-browser E2E via :81 — DOM proof (h1 text, 2 ribbon svgs, header chip svg, eyebrow), visual proof mobile 390×844 + desktop 1440×900, shop-page regression (cover seam curve count = 1, owner strip/serif/stroke untouched), fresh-document error check = 0 (the 6 recorder entries are the known stale pre-fix setImmediate stacks). Screenshots: scripts/verify-curve20-browse-guest-mobile.png, verify-curve20-browse-desktop.png, verify-curve20-shop-seam.png.

Stage Summary:
- The curve is no longer an easter egg. The browse front door is now the poster: a green ribbon that rises and flows through the same sweeping stroke twice, carrying the market's thesis in serif. The header mark is the curve itself. One path, one direction, four doorway surfaces (browse ribbon, cover seam, lettermark, printed poster) and nowhere else. Zero API/schema changes; 142/142; fixtures clean; committed cfcb7ad.

---
Task ID: 21
Agent: main (Super Z)
Task: Mudaala rename + hero photo + category pills + shop avatar + featured rail (user's five-task brief; app's real name is Mudaala, mockups in /upload used for layout/curve/colors/type only)

Work Log:
- RENAME: git mv duka-curve.tsx -> mudaala-curve.tsx (component MudaalaCurve); sed across 27 src files + README + prisma schema comment + scripts for Duuka/Duka/duuka -> Mudaala/mudaala. Storage/cookie keys renamed too (duuka_session -> mudaala_session, duuka_session_token, duuka.basket.v1, duuka.loved.v1, duuka_shop_setup_dismissed) — old browser sessions/baskets reset, accepted at dev stage. Header wordmark: lucide Leaf (fill-primary/15) + "mudaala" font-display bold lowercase text-primary; icon chip removed. layout.tsx title/description/keywords, footer, poster ("Scan to see our shop on Mudaala"), share texts, all comments.
- SHOP CODES: scripts/backfill-shop-codes.ts rewritten — job 1 migrates DK-XXXX -> MD-XXXX preserving digits (posters keep working), job 2 assigns MD- to nulls; run on dev DB, all 8 shops migrated (Nakato DK-2623 -> MD-2623 etc.). generateShopCode (lib/shop.ts) emits MD-; normalizeShopCode (lib/format.ts) accepts (?:DK|MD) and canonicalizes to MD- (digits ARE the identity); lookup 400 message updated; test-api MD- assertions + mudaala_session cookie. Verified via curl: DK-2623 and md-2623 both resolve to Nakato (stored MD-2623).
- BROWSE HERO: curves h-6 sm:h-9 top+bottom (bigger sweep); desktop grid text | 42% photo (public/uploads/seed/shop-nakato.png — matooke/tomatoes/onions stall, loading=lazy) with a MudaalaCurve overlay (-left-24, w+6rem, h-10 sm:h-14) sweeping across the photo's bottom edge out of the green field; chips Real shops / Call direct / No middleman (honest set — no verified-seller or delivery claims) sm+ only; mobile one-line copy "Real shops, direct calls — no middleman." keeps ribbon at 164px.
- CATEGORY PILLS: scrollable row under search (role=group aria-label), All ('any') + CATEGORIES (11), active filled bg-primary, aria-pressed, press class, setFilters({category}) (auto page reset). Verified live: Farm Produce -> 5 listings (from 14).
- SHOP AVATAR: square img (size-14/sm:size-16, rounded-lg, thin border, lazy, alt="") absolute -bottom-4/-sm:-bottom-5 left-4/left-5 z-10 over the cover's curve seam; signboard block (eyebrow/h1/stroke) wrapped with pl-[4.5rem] sm:pl-[5.5rem] when photo present. Lettermark branch unchanged.
- FEATURED RAIL: FeaturedShopPanel in listings-browse — desktop lg:grid-cols-[1fr_240px], aside hidden lg:block; first result with a named shop -> GET /api/shops/:id (staleTime 60s); photo or lettermark, serif name, QR (react-qr-code, origin via the shop-view useSyncExternalStore pattern), mono MD code, tel: call link. Feed lg:grid-cols-3 beside it. Rectangle — restraint rule keeps the curve off cards.
- Verification: tsc clean, eslint clean, 142/142 test-api, cleanup-test-data (8 users / 16 listings); fresh-document browser check 0 errors; screenshots scripts/verify-mudaala-browse-mobile.png, -browse-desktop.png, -pills-filtered.png, -shop-mobile.png. Playwright text-locator missed pills in the horizontal scroller (tool artifact) — JS click proved the handler works.

Stage Summary:
- The app is Mudaala end to end: leaf+serif wordmark, MD- codes with DK- legacy acceptance, mockup-faithful sweep-masked hero photo, aisle-sign pills, avatar-over-seam shop page, and a desktop featured-shop rail. Zero schema/API shape changes (lookup copy only); storage keys renamed (one-time session/basket reset); 142/142, fixtures clean, committed a2c7bc9.
---
Task ID: 22
Agent: main (Super Z)
Task: Push Mudaala to GitHub — private repo "mudaala", main committed clean, redesign work on branch mudaala-redesign (user brief: 5 steps)

Work Log:
- State check: Task 21 (the five redesign tasks) was already committed as one atomic commit; audit confirmed all five live in code — rename zero "duka" leftovers repo-wide, Leaf+serif lowercase wordmark, normalizeShopCode accepts DK|MD canonicalizing to MD-, hero photo/chips/curves, category pills (role=group, aria-pressed), square avatar over cover seam, FeaturedShopPanel aside hidden lg:block. tsc + eslint clean on the branch. Line-410 grep display artifact looked like a broken grid class; direct Read proved lg:grid-cols-[minmax(0,1fr)_240px] correct — no fix needed, no fake commits manufactured.
- GIT HYGIENE (commit 834b12b on main): git rm --cached .env db/custom.db (files stay on disk, dev server untouched); .gitignore += /db/ (real local data never pushes); found+fixed a silent repo-breaking ignore — bare 'test' rule was excluding src/app/api/settings/postgres/test/ (a real API route); added negations and committed the route so a fresh clone is complete.
- HISTORY PURGE (pre-remote, safe): filter-branch index-filter removed .env and db/custom.db from ALL 38 commits, reflog expired, gc aggressive; .git 24M -> 18M (rest is mockup PNGs + verify screenshots + bun.lock). Verified: git log --all -- .env db/custom.db empty; both files still on disk.
- BRANCH: mudaala-redesign created from hygiene commit; carries the redesign (Task 21 commit, now 1a25120 after rewrite).
- GITHUB BLOCKER (honest): no GitHub token exists in this environment — gh CLI not installed, no GH_TOKEN/GITHUB_TOKEN env, no ~/.git-credentials, no gh config, .env holds only DATABASE_URL, token-pattern grep across config dirs empty. Network to github.com IS reachable. Repo creation is the single step that cannot be done without credentials.
- Prepared scripts/push-to-github.sh: resolves login from token, creates PRIVATE repo via REST API (idempotent), sets origin WITHOUT token in .git/config, pushes main + mudaala-redesign via one-shot credential helper. One command once a PAT exists.

Stage Summary:
- Local work is 100% push-ready: main = 38 commits, .env and db/custom.db untracked AND purged from all history, postgres test route rescued, working tree clean, branch mudaala-redesign in place with the five-task redesign verified (tsc/eslint clean). The only missing input is a GitHub token — paste a PAT (repo scope) and run scripts/push-to-github.sh, or send it in chat and the push completes immediately. Repo URL once pushed: https://github.com/<login>/mudaala (private).
---
Task ID: 22 (addendum)
Agent: main (Super Z)
Task: GitHub push completion (user provided PAT, created repo manually)

Work Log:
- Token rounds: PAT #1 and #2 both 403 on repo creation (fine-grained without Administration write); probe showed isaJrKai/mudaala already existed (user created it manually, private). Patched push-to-github.sh to fall through on 403 when GET confirms the repo exists.
- First push attempt 403 on write (token lacked Contents write); user granted Contents: Read and write; push then succeeded for both branches.
- Platform between-turn sync moved the Task 22 worklog commit onto main (+2 checkpoint commits capturing the push-script edits) and reset mudaala-redesign to 834b12b — verified nothing lost: origin/main carries full history incl. worklog (23 task entries) and push script; branch = redesign snapshot per brief.
- Remote verified: private: true, default_branch: main, main=cef03bd, mudaala-redesign=834b12b; no .env / db/ anywhere in pushed tree or its history.

Stage Summary:
- https://github.com/isaJrKai/mudaala (PRIVATE) is live: main = complete project, mudaala-redesign = the five-task redesign. Real data (.env, db/custom.db) absent from every commit. User advised to scope down or delete the chat-shared PAT.
---
Task ID: 23
Agent: main (Super Z)
Task: Hardening pass — 8 items, one commit each, tsc+eslint+test-api after every item, UI untouched

Work Log:
- 1 postgres settings (7bb2a14): requireAdmin gate from ADMIN_PHONES (any dial format, empty env fails closed); GET/PUT/DELETE/test all 403 non-admins; password + connectionString now AES-256-GCM encrypted at rest (SETTINGS_ENC_KEY, machine-local fallback), legacy plaintext still reads. +6 tests.
- 2 cron sweep (404c67e): x-cron-secret header vs CRON_SECRET, timing-safe compare, 503 fail-closed when unset. +3 tests.
- 3 rate limits (efed654): in-memory sliding window lib; login 5 failed/15min per phone (all dial formats one bucket, success clears) + 30/15min per IP; register 20/15min per IP; friendly 429 + Retry-After. Tests prove 5 wrongs→401, 6th→429 even correct pw, format-normalization not a bypass, other phones unaffected. +7 tests.
- 4 Bearer fallback (d87203f): AUTH_BEARER_FALLBACK=1 opt-in; default = httpOnly cookie only. Proven live both ways.
- 5 (c8216a1): ignoreBuildErrors false; production build passes strict with zero fixes.
- 6 (2de291e): depcheck + grep-verified removal of 14 unused deps; build passes; scaffolding-imported deps kept; socket.io example noise ignored.
- 7 (738225e): uploads now sharp-piped — EXIF rotate, fit 1200x1200, WebP q82, .webp always; decode-failure rejected 400. Tests upload 4000x3000 PNG and inspect the stored file. +3 tests. Dev .env raises per-IP caps so repeated suite runs don't trip prod defaults.
- 8 (f24f238): .github/workflows/ci.yml — fresh sqlite + seed + dev server + tsc + eslint . + 160-test suite + cleanup on every push/PR; YAML validated, first real run on GitHub.
- Suite now 160/160 (was 142); fixtures 8 users / 16 listings after every run; final push of branch done.

Stage Summary:
- All 8 hardening items landed as separate commits on mudaala-redesign; UI untouched; 160/160 green. Chosen NOT to do: horizontally-shared rate-limit store (noted in lib for when it matters), rate-limit lockout of register per-phone (meaningless), removing scaffolding ui/ components that import kept deps, CI secrets hardened via GitHub Secrets (env is fixture-only, no real credentials).

---
Task ID: 23 (addendum)
Agent: main (Super Z)
Task: Hardening pass — verification after session gap; branch reconciliation

Work Log:
- Re-verified full green state post-checkpoint: tsc 0 errors, eslint clean, suite 160/160, cleanup restored fixtures (8 users / 16 listings).
- Spot-checked all 8 implementations in tree: ADMIN_PHONES gate (lib/admin.ts), x-cron-secret fail-closed, rate-limit lib + login/register wiring, AUTH_BEARER_FALLBACK opt-in, ignoreBuildErrors:false, sharp WebP pipeline, ci.yml.
- Platform between-turn sync had moved the 8 hardening commits onto main; mudaala-redesign left at 9de1abe (pre-hardening). Fast-forwarded mudaala-redesign to main (6822b22) and pushed — worklog claim "landed on mudaala-redesign" now true on both branches.
- CI verified live: main runs completed success (tsc+lint+tests on GitHub); branch run queued on push.

Stage Summary:
- Hardening pass closed out: 8/8 items, 160/160 local, CI green on GitHub. Both branches at 6822b22 on origin.

---
Task ID: 24
Agent: main (Super Z)
Task: MUDAALA Deployment Guide (.docx) with live secrets wired in

Work Log:
- docx skill chain read in full (SKILL -> create route -> docx-js-core -> common-rules -> design-system R1/FG-1 -> toc.md -> report scene).
- Built scripts/guide-lib.js (R1 cover recipe + calcTitleLayout/calcCoverSpacing verbatim) and scripts/generate-deployment-guide.js (10 chapters, 2 tables, code blocks, systemd unit, nginx, cron, backups, troubleshooting).
- Real values wired into Chapter 4 + verify commands: ADMIN_PHONES=0753824458,0759882817; CRON_SECRET=...0957.LOL; SETTINGS_ENC_KEY=ffb76e...0b55; AUTH_BEARER_FALLBACK + RATE_LIMIT_* documented as DO NOT SET in production.
- add_toc_placeholders.py --auto (exit 0, 13 entries); postprocess-guide.py strips empty pgNumType + patches footer PAGE \\* arabic; postcheck.py 8/9, 0 errors (1 intentional line-spacing warning: 276 code/table vs 312 prose).
- Visual QA via LibreOffice PDF render: cover, TOC, env table (header repeats across pages), code blocks all correct; trailing PageBreak after TOC removed to kill double-break blank page.
- SECURITY: guide + generator scripts contain live secrets -> gitignored (/download/, scripts/generate-deployment-guide.js, guide-lib.js, postprocess-guide.py, tool-results/); docx moved deps -> devDependencies.

Stage Summary:
- download/mudaala-deployment-guide.docx (11 pages) delivered, local only, never pushed. Repo changes: .gitignore additions + docx devDep only.

---
Task ID: 25
Agent: main (Super Z)
Task: Signed-in "Home" dashboard — desktop sidebar, mobile Home tab, stat cards, best offers near you, saved searches, freshness tip, price trends (PriceSnapshot + cron medians)

Work Log:
- Schema: PriceSnapshot {date, category, unit, currency, medianPrice, sampleSize} with @@unique([date,category,unit,currency]) (idempotent upserts) + User.lastHomeVisitAt. Deliberate addition beyond brief: currency is part of the key — a median across UGX and KES rows would be a fabricated number. db pushed, client regenerated, dev server restarted (stale-client lesson).
- lib/price-trends.ts: recordPriceSnapshots() groups ACTIVE OFFER listings by category+unit+currency (OFFER only: a REQUEST price is what a buyer wants to PAY — averaging sell+want prices would fabricate a number neither side quoted), median per combo, only sampleSize >= 5, upsert by day. priceTrendsForUser(): top 3 categories scored from the user's own listings + saved-search queries; per category picks the (unit,currency) the user actually posts in, else the best-sampled snapshot combo; returns 7-day point sets (empty points = honest absence).
- Cron sweep extended: POST /api/cron/sweep now also records priceSnapshots (response {expired, expiringNotified, priceSnapshots}). Idempotent.
- New endpoints (all requireUser): GET /api/home (stats: savedSearches count, activeListings, newMatches = DISTINCT listingIds from real NEW_MATCH notifications after lastHomeVisitAt, lastUpdatedAt = max own-listing updatedAt; top-4 saved searches; staleListings ACTIVE with refreshedAt > 7d (STALE_LISTING_DAYS in constants) + staleCount; location = profile area/county/blurred spot → most recent listing district → none); POST /api/home/visit (stamps lastHomeVisitAt — GET stays read-only so numbers never zero mid-visit); GET /api/price-trends (series per top category, source label, minSample).
- Navigation: store 'home' view (#/home); AppSidebar (fixed left, hidden lg:flex, w-60): Home/Browse/Post/My Listings/Saved Searches/Notifications (unread badge + bell shake)/My Business/Settings, "Post what you need / have" primary button, "Need help? Chat on WhatsApp" plain wa.me link from NEXT_PUBLIC_SUPPORT_WHATSAPP (absent env → no card, never a fake link). page.tsx content column lg:ml-60; header keeps wordmark (now → home) + basket + account dropdown, desktop nav links removed (sidebar owns them); BottomNav = Home first tab (Home/Browse/Post/Listings/Alerts — Account reachable via header dropdown; bell shake kept).
- home-view.tsx: signed-out → honest welcome card (Sign in / Browse); signed in → serif time-of-day greeting "Good morning/afternoon/evening, {first name}", 4 stat cards (each navigates: saved→saved, active→my-listings, new matches→notifications, last updated→my-listings), Freshness tip card ONLY when stale listings exist (oldest first, up to 3 + "+N more", per-row Renew → existing refresh endpoint, invalidates home), Best offers near you (12 category chips + All, location chip "Nakasero, Kampala – Change" dialog: Anywhere + shop-area option + grouped UG/TZ/KE districts, choice persisted in mudaala.home.location.v1, "Use my shop area" reset; feed = EXISTING /api/listings?type=OFFER&pageSize=8&county&category&sort=nearest&lat&lng when the default area's blurred spot exists else sort=newest; row-style list: photo (lazy, category-glyph fallback), shop, title, price/unit, quantity · distance (haversine vs ref spot, only when both spots known) · place · updated, Call/Chat plain tel:/wa.me links), Saved searches card (top 4 → applyQuery pattern from saved-searches.tsx + View all), Price trends card (recharts LineChart via existing ChartContainer, 7-day window, one line per category with per-series currency/unit label, connectNulls — no invented points, compact Y ticks, tooltip Intl numbers, "Based on Mudaala listings" label; zero chartable series → "Not enough listings yet" + why).
- Tests +20/section 11 in test-api.ts (suite 160 → 203): 401 guards on all 3 endpoints; fresh-account zero-state (nothing invented); saved search + matching publish → newMatches 1; visit marker → 0; second match since visit → 1; own publish → activeListings/lastUpdatedAt/location fallback "listing"; refreshedAt backdated 8d → staleCount + ageDays; Renew via refresh endpoint → tip gone; cron medians: odd-count median 2000/5, sub-sample combo NO row, re-sweep idempotent (1 row), 6th listing → 2500/6 updated in place, trends series electronics/piece/UGX + today point + top-3 cap + source label. Cron secret resolves from env (CI) or dev .env (local). ugh: uniquePhone() is KE-format — added ugPhone() for UG registrations.
- cleanup-test-data.ts: also removes notifications pointing at deleted listings (60 found — was polluting fixture users' NEW_MATCH counts) and all PriceSnapshots (pure derived data; sweep rebuilds honestly). eslint ignores for gitignored local guide generators.
- Verification: tsc clean, eslint clean, 203/203 suite, cleanup restores 8 users / 16 listings; agent-browser E2E: desktop 1440 sidebar + all sections + real numbers (1/3/0/45min), freshness tip staged (scripts/stage-stale-listing.ts) → Renew via UI → tip gone, location picker Jinja → feed filters honestly (2 Jinja rows, empty state when none) → reset to shop area, Farm Produce chip filters, mobile 390: no h-overflow, bottom nav Home first, rows stack Call/Chat; public browse regression: hero ribbon/pills/cards intact, header nav replaced by rail; zero page errors; deep-link #/home survives reload. Screenshots: scripts/verify-home25-desktop.png, -desktop-bottom.png, -mobile.png, -mobile-offers.png, -browse-desktop.png.
- .env += NEXT_PUBLIC_SUPPORT_WHATSAPP=256753824458 (operator's line; deployment-configurable).

Stage Summary:
- Home is now the signed-in workbench: real numbers only (newMatches counts REAL notification records; trends only when >= 5 real ACTIVE OFFER listings back a median; empty states say so). Public browse untouched. Desktop gets the workspace rail, mobile keeps bottom nav with Home first. 203/203 tests, tsc+eslint clean, fixtures clean, browser-verified mobile+desktop. No verified badges/ratings/stock claims/in-app messaging added (per brief).

---
Task ID: 25 (addendum)
Agent: main (Super Z)
Task: Home tab post-gap re-verification + delivery; user greenlit "the home tab build"

Work Log:
- Found Task 25 commit 57453f3 complete on both branches but UNPUSHED (ahead 1 vs origin each); working tree clean.
- Re-verified full green state in current env: tsc 0 errors, eslint clean, suite 203/203, cleanup restored 8 users / 16 listings (also wiped derived PriceSnapshots per cleanup policy).
- agent-browser E2E re-run: signed in as fixture Nakato (+256772123456); desktop 1440 Home view renders serif greeting, 4 real stat cards (1/3/0/10min), best offers rows with photo/shop/price/qty/distance/updated + Call/Chat, saved searches card (Copper scrap in Kampala, 2 matches), price trends card honest "Not enough listings yet" (0 snapshots after cleanup; cron rebuilds daily when a category+unit combo reaches 5+ ACTIVE OFFER listings); sidebar has all 8 items + Post CTA + WhatsApp help link; mobile 390 no h-overflow, bottom nav Home first (#/home deep link survives reload); public browse regression intact (hero, ribbon, pills); zero console/page errors.
- Fresh screenshots captured: scripts/verify-home25-desktop.png, -desktop-bottom.png, -mobile.png.
- Push blocked: no GH_TOKEN in env, no stored credentials (previous PAT was recommended for revocation). Commit stays local until user supplies a fresh PAT.

Stage Summary:
- Home tab build CONFIRMED delivered and verified green (203/203, browser-checked desktop + mobile, screenshots refreshed). Only outstanding action: push 57453f3 to origin once a fresh PAT is provided.

---
Task ID: 26
Agent: main (Super Z)
Task: Real WhatsApp brand icon everywhere + printed shop poster rebuilt from the user's mockup

Work Log:
- User: "import and use real whatsapp icon... those icons to be real and not general"; also pointed at the mockup poster with QR code that was never adopted.
- New src/components/commerce/brand-icons.tsx: WhatsAppIcon with the official public glyph path (Lucide ships no brand marks), currentColor fill, aria-hidden, role img. Replaced generic MessageCircle in ALL WhatsApp contexts: home-view Chat buttons, listing-detail WhatsApp button, basket-view send-list buttons, app-sidebar help card, shop-setup-dialog checklist, shop-view shop WhatsApp button. Call buttons keep Lucide Phone (already a real handset mark).
- Poster (shop-view.tsx printable overlay) rebuilt to the mockup anatomy: brand header (leaf + mudaala serif wordmark + "Local shops. Real opportunities." caps), size-28 photo, serif name, MapPin location, QR with centered leaf badge (level="H" so the badge never breaks scannability), "Scan to shop on Mudaala", big serif shop code + SHOP CODE caps, can't-scan fallback line, curve + green band with "Call us: {formatPhonePretty(shop.phone)}" + italic "Real shops, direct calls".
- Verified: tsc 0, eslint clean (touched files + repo), 203/203 suite, cleanup restored 8 users / 16 listings (2 suite upload leftovers deleted per 6822b22 convention). Browser-verified: poster screenshot matches mockup layout, 3 wa.me glyphs on shop page + 4 on home, WhatsApp glyph present in DOM at all contact points. Screenshots: scripts/verify-poster-mockup.png, verify-shop-icons.png, verify-home-wa-icon.png.
- Git: platform between-turns sync inserted UUID commit f331a10 on main; main now ahead 3 of origin (57453f3 + f331a10 + 4175508). Push still blocked: no PAT stored anywhere (script only has the ghp_xxxx placeholder) — user confirmed old PAT still active but token value was never persisted on this machine.

Stage Summary:
- WhatsApp contacts now carry the real brand logo at every touchpoint; the printable shop poster is the mockup's poster design, Mudaala-branded, print-safe (H-level QR). 203/203 green, committed 4175508 on main. Push pending user PAT.

---
Task ID: 27
Agent: main (Super Z)
Task: Real WhatsApp glyph on ALL contact buttons + Uganda-only pivot + deep residue clean

Work Log:
- WhatsApp glyph completion: listing-card.tsx (browse/catalogue Chat buttons, 2 sites) was still on Lucide MessageCircle — swapped to brand-icons WhatsAppIcon; all contact buttons now carry the official logo (verified 3 glyphs on shop page, 4 on home desktop, 5 on home mobile).
- Uganda-only pivot (user: "keep the app locally in uganda. remove kenya or tanzania information... after do deep cleaning of residues"):
  - constants.ts: COUNTRIES → Uganda only; CURRENCIES → UGX only; COUNTIES = Uganda districts.
  - validation.ts: CountryKey='UG', local pattern ^[37]\d{8}$ only, phoneCandidates UG-only, countryPhoneMessage single message, registerSchema country via COUNTRY_KEYS.
  - UI: auth-dialog register shows fixed "Uganda (+256)" field (no select), login helper copy "Any Ugandan format works", browse ribbon "KARIBU · UGANDA", publish-form area placeholder Kisenyi, comments cleaned (format.ts, admin.ts, publish-form, login route, layout keywords, PriceSnapshot/currency comments).
  - Seed rewritten Uganda-only, same shape (8 users / 16 listings, same flags: 1 FULFILLED, 1 expired, 2 saved searches): Nakato/Kampalamart/Jinja unchanged + Gulu Agri Supplies (+256712000001 = fixture ADMIN), Mbale Flour Millers, Mbarara Fresh Produce, Masaka Chapati Supplies, Owino Second Hand. All UGX prices realistic (oil 130k, maize 1.1k/kg, flour 185k/bag, milk 1.2k/L, bales 155k). Images git-mv'd to Ugandan names; shop-jomo-scrap deleted; shop-owino.png generated via z-ai sdk one-off (scripts/generate-owino-shop.mjs).
  - cleanup-test-data.ts + backfill-shop-coords.ts fixture lists → new UG phones/coords.
  - test-api.ts: uniquePhone → +2567…, register default UG, validListing UGX/Kampala, TZ+KE login tests consolidated into one "dial-code 256776123456" test (suite count 203 → 202 by design), ghost phone +256…, location-blur + nearest-sort + county-filter + saved-search + twin-shop tests moved to Ugandan coords/areas (Gulu 2.774,32.299 vs Kampala; Ntinda/Bukoto). Only intentional Nairobi left = the outside-Uganda rejection test.
  - .env (local, untracked): ADMIN_PHONES +254712000001 → +256712000001; server restarted.
- Verification: tsc 0, eslint clean, suite 202/202 (clean-run; observed flaky failures earlier were self-inflicted: suite re-runs without cleanup trip the in-memory login IP limiter — cleanup BEFORE each run is mandatory), DB reseeded, fixtures 8/16. Browser: ribbon, fixed-Uganda register, location picker = 20 options all Uganda (0 TZ/KE), Ugandan shops in feed, mobile 390 no overflow. Final grep: zero KE/TZ/KES/TZS/+254/+255 residue in src/prisma/scripts/README (only the intentional rejection test).
- Note: suite totals 202 now, not a regression — 2 regional login tests became 1 UG dial-format test.

Stage Summary:
- Mudaala is Uganda-only end to end and every WhatsApp contact carries the real logo. Commit e1bd3e1 on main (now ahead 5 of origin: 57453f3, f331a10, 4175508, f2eb692, e1bd3e1). Push still blocked on user PAT.

---
Task ID: 28
Agent: main (Super Z)
Task: Disaster recovery. User: "THE CHANGES WE HAD BUILT ON THE UI/UX ARE NOT THERE AT ALL, HAVE YOU LOST THEM?" Workspace had been reprovisioned from a Task-14-era platform snapshot.

Work Log:
- Impact assessment: current repo = fresh platform lineage (22 UUID commits, no remote). Named commits 57453f3/f331a10/4175508/f2eb692/e1bd3e1 (Tasks 25-27) unrecoverable as git objects; they were never pushed (push was blocked on user PAT, and the reprovision dropped the origin config entirely). worklog.md on disk ended at Task 14; home-view.tsx / brand-icons.tsx absent; 111 src files instead of 132.
- Recovery source found: /tmp/my-project — a platform temp copy of the workspace dated Oct 1 14:53 (.initial_snapshot.json manifest present) holding the COMPLETE post-Task-27 state: full src tree (132 files), Task-27 worklog (104KB), Uganda-only seed + validation, updated schema/db, package-lock. rsync-restored everything except node_modules/.next/.zscripts/tool-results.
- Snapshot hygiene: the temp copy had resurrected 4 dead Sep-29 components (country-picker, category-visual, seller-view, shop-image-picker) plus the old /api/me route (meUpdateSchema + User.currency no longer exist; nothing imports any of them). Deleted all 5 → tsc 0.
- .env was never in any snapshot (both copies only had DATABASE_URL). Rebuilt: ADMIN_PHONES=+256712000001 (Uganda fixture admin per Task 27), fresh CRON_SECRET, fresh SETTINGS_ENC_KEY (AES-256-GCM settings key), AUTH_BEARER_FALLBACK=1. Untracked .env via git rm --cached (platform's initial commit had it tracked; only ever held DATABASE_URL so history stays clean) — .gitignore already covers .env*.
- Deps + db: npm install against restored package.json, prisma db push, prisma generate, seed.ts (Uganda-only 8/16 + 2 saved searches). First suite run failed on stale data from an earlier crashed run (median tests polluted, check-name exclude broken) — full cleanup-test-data + server restart (in-memory login IP limiter) before rerun.
- LESSON (repeat of Task 12's): untracked/unpushed work dies with the workspace. The entire Task 15-27 era survived ONLY because a platform temp copy happened to exist in /tmp. Push to GitHub is the real backup; PAT still pending from user.
- LESSON 2: run cleanup-test-data between suite runs even when the run crashed mid-way — stale test listings shifted PriceSnapshot medians and broke shop check-name exclude (4 false failures).
- Verification: tsc 0, eslint clean, suite 202/202 (expected count after Task 27's deliberate consolidation), cleanup restored 8/16, uploads webp residue deleted. Browser (1280x900): guest welcome view, sign-in dialog with Uganda copy ("Any Ugandan format works") + Gulu Agri Supplies fixture, signed-in home dashboard ("Good evening, Nakato", stats, best offers, 4 wa.me links / 4 real WhatsApp glyphs), My Business checklist 5/5 with MD-7273, shop page with WhatsApp glyph button, poster overlay = full mockup anatomy (mudaala header, QR with leaf badge, "Scan to shop on Mudaala", MD-7273 + SHOP CODE, call band "+256 772 123 456" + "Real shops, direct calls"). Screenshots: scripts/verify-restore-home.png, verify-restore-home-tab.png, verify-restore-home-signedin.png, verify-restore-shop.png, verify-restore-poster.png.
- Committed c0bd29f on the new platform lineage (restore commit). No remote configured yet; push blocked until user supplies the PAT value.

Stage Summary:
- Nothing was lost after all: every UI/UX change (home dashboard, real WhatsApp logos, mockup poster, Uganda-only pivot) is restored and re-verified green at 202/202. The repo is a fresh lineage with the full state in c0bd29f; pushing it to GitHub the moment the user pastes their PAT so this can never happen again.

---
Task ID: 28-b (addendum)
Agent: main (Super Z)
Task: Push recovered state to GitHub after user supplied PAT.

Work Log:
- PAT verified against api.github.com (login isaJrKai). Token used inline per command via credential.helper; never written to any file, config, or env persisted across calls. git config clean, no credential storage.
- Remote re-attached: origin = github.com/isaJrKai/mudaala (reprovision had dropped it). Remote main tip was a1020ba "Task 24: deployment guide docx" — original named history survived on GitHub through Task 24 only; commits 57453f3/f331a10/4175508/f2eb692/e1bd3e1 (Tasks 25-27) were never pushed and remain unrecoverable as objects. Their full content lives in restore commit c0bd29f.
- History safety: pushed origin's old tip to refs/heads/backup/task24-history BEFORE rewriting. Then force-pushed main: a1020ba → 905aa68 (worklog Task 28 + restore commit). Remote main now = verified 202/202 restored state incl. home-view.tsx + brand-icons.tsx (ls-tree confirmed).
- mudaala-redesign branch left at a1020ba (stale redesign line, untouched). Backup branch keeps Task 24 history reachable forever.

Stage Summary:
- GitHub is now the real backup: origin/main = full recovered Mudaala (home dashboard, real WhatsApp logos, mockup poster, Uganda-only), old history preserved on backup/task24-history. Future rule: push at the end of EVERY task, no exceptions.

---
Task ID: 29
Agent: main (Super Z)
Task: Dead code deep clean (user: "LOOK INTO APP FOR SCRAP AND DEAD CODE. DO A CLEANING").

Work Log:
- Built scripts/deadcode-scan.ts (cross-file usage scanner: exports with zero external references, whole files never imported, console/debug leftovers, TODO markers). knip crashed (oxc-parser ArrayBuffer allocation) and depcheck had false positives (@tailwindcss/postcss, tw-animate-css are used via config/CSS import); the custom scanner covers what matters for this tree.
- Deleted 31 never-imported files. Mostly shadcn template components the app never adopted: accordion, alert, aspect-ratio, avatar, breadcrumb, calendar, carousel, collapsible, command, context-menu, drawer, form, hover-card, input-otp, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, sidebar, slider, sonner, switch, table + cascade deaths (toggle-group killed ui/toggle; ui/sidebar killed hooks/use-mobile and later sheet + tooltip, which only sidebar imported) + old-branding duka-curve.tsx (superseded by mudaala-curve.tsx). ui dir: 48 -> 17 files.
- Unexported 34 symbols that were only used inside their own module (admin, auth, basket, client, constants, format, geo, listings, loved, postgres-settings, price-trends, rate-limit, shop, validation, category-icons, listing-card, skeletons). Deleted 7 fully dead ones: clearBasket, DEFAULT_CURRENCY, formatDate, shopTradeLabel, countryNameOf, ShopUserRow, listingPhotosSchema.
- Uninstalled 30 orphaned dependencies: 16 radix packages + react-tooltip, react-hook-form, react-day-picker, embla-carousel-react, cmdk, vaul, input-otp, react-resizable-panels, sonner, next-themes, react-icons, date-fns, docx (Task 24 one-off), bun-types. GOTCHA: @types/node had been arriving transitively and vanished with the uninstall (tsc broke on process/Buffer/node: imports everywhere) — re-pinned explicitly as devDep.
- Removed 30 unreferenced files in public/uploads (old session photos; zero db references; recoverable from git history). Kept seed images.
- Kept deliberately: layout viewport export (Next.js framework contract), shadcn sub-exports inside live ui files (anatomy compatibility for future shadcn updates), scripts/ one-off tools (worklog-documented recovery history), examples/ + mini-services/ (platform template), ui/toast system (app uses use-toast, NOT sonner — ui/sonner.tsx deleted instead).
- Verification: tsc clean, eslint clean, rescan = zero dead files/symbols outside the intentional keeps, suite 202/202, cleanup restored 8/16, browse page + home render perfectly with 0 console errors (verify-cleanup-home.png).

Stage Summary:
- The app shed ~2 dozen template files and 30 packages it never used; every remaining export earns its keep or is a framework contract. 202/202 green, pushed to GitHub.

---
Task ID: 30 (re-applied)
Agent: main (Super Z)
Task: Restore session lost Task 30 (CI fix) — workspace was reprovisioned from a Task-15-era platform checkpoint; GitHub main tip was Task 29. Re-applied from documented record.

Work Log:
- .github/workflows/ci.yml: ADMIN_PHONES "+254712000001" → "+256712000001" (normalizePhone is Uganda-only +256; the Kenya number made every section-9 admin assertion fail in CI) and on.push gained branches: [main] so feature-branch pushes don't burn Actions minutes.
- .env.example created (placeholder shapes matching the CI env block: DATABASE_URL, ADMIN_PHONES, CRON_SECRET, SETTINGS_ENC_KEY, AUTH_BEARER_FALLBACK) and .gitignore gained !.env.example.

Stage Summary:
- CI env block is Uganda-correct again. Baseline before this restore: 202/202 locally at Task 29.

---
Task ID: 31 (re-applied, condensed)
Agent: main (Super Z)
Task: Jiji Uganda audit (research only, no code). Original full worklog text lost with the Task 30/31 push; re-added as an honest condensed record.

Work Log:
- Audited jiji.ug via search-index mining (site blocked datacenter IPs with Cloudflare): ~400K monthly web visits, 46% of desktop traffic from organic search — an SEO machine, which validates per-listing ad pages as P0.
- URL architecture: category x location landing pages plus ad pages at slug+id. Contact: in-app chat, phone reveal, Contact on WhatsApp. Trust: KYC badges, shop verification, seller tenure — but scams still common. Monetization: TOP ads, Boost packages, pay-per-click Pro Sales (USh 10,000/day start) users compare to "resold Meta ads".
- Mudaala's real gaps vs Jiji: no honest price trends, no REQUEST-first model, no quantity/unit trade economics, no printable shop QR posters. Categories overlap already; the wedge is trade economics, not category count.
- User then approved Item one (per-listing ad pages) with the constraint: steal, refine, improve — no cloning; new feeling in Mudaala's own design language.

Stage Summary:
- 7-point ad-page spec locked: /listing/[id] with keyword slug + canonical redirect, metadata template + Product/Offer JSON-LD, OG image for WhatsApp preview, WhatsApp share + copy link, seller block (shop code + Active since), one-line safety tip, sitemap of active listings.

---
Task ID: 32
Agent: main (Super Z)
Task: Item one — per-listing ad pages (/listing/[slug]) per the approved 7-point spec, with the "steal, refine, improve, new feeling" constraint. Session also began with a disaster recovery: the workspace reprovisioned from a Task-15-era checkpoint.

Work Log:
- RESTORE FIRST: the provisioned workspace came back ~17 tasks stale (Duuka era, 136 tests, multi-country). GitHub main held the truth but was unreachable without the PAT (repo private, no stored credentials by design). User supplied mudaala-main.zip (GitHub export = Task 29 tip). rsync-restored the tree with anchored excludes (Task 30's lesson), kept .git/upload/.env/db/node_modules. Re-applied Task 30 (CI +256712000001, branches [main], .env.example + !.env.example) and re-added honest condensed Task 30/31 worklog records. Rebuilt .env with fresh CRON_SECRET/SETTINGS_ENC_KEY. bun install + prisma db push + reseed + clean restart; 202/202 verified; restore committed as fd4f17e so nothing is ever treeless again. NOTE: the Task 30/31 pushes of the previous session never landed on GitHub (zip tip = Task 29); push is still pending the user's PAT.
- Ad page route src/app/listing/[slug]/page.tsx (server component, force-dynamic): URL contract /listing/{keywords}-{id}; id is identity, keywords are presentation. Bare-id and stale-keyword URLs permanently redirect (Next permanentRedirect, 308) to the current canonical URL computed from the live title — links never rot, exactly one canonical copy per ad. React.cache loader shared by generateMetadata + page; expireOverdueListings() runs on every view so status stays truthful.
- generateMetadata: title template "Copper scrap, 99.5% clean — USh 20,000 / kg in Kisenyi, Kampala | Mudaala" (price + place in the title, the two things a buyer scans for); REQUESTs get "Wanted: ..." prefix. Description clipped word-safe at 140 chars. canonical + og:url + og:title + og:description + og:image (absolute, first 3 photos via metadataBase from src/lib/site.ts siteUrl = NEXT_PUBLIC_APP_URL ?? localhost). robots: index for ACTIVE, noindex otherwise (page still renders with honest status banner for link holders).
- JSON-LD: OFFERs get Product + Offer (price, UGX, InStock/SoldOut/OutOfStock from real status, seller = named shop). REQUESTs deliberately get NO Product markup — a wanted ad is not a product for sale; dishonest markup refused. No ratings, no verified claims: nothing Mudaala cannot prove.
- NEW FEELING (the refinements over Jiji): (1) Market check chip — when the cron-swept PriceSnapshot series exists for the ad's exact category/unit/currency (sample >= 5), the ad shows the honest weekly median with a pure-SVG sparkline; buyers enter the WhatsApp chat knowing the market, not just the ask. Absence stays invisible, never fabricated. (2) Ad title set in Fraunces display serif — the painted-signboard voice, newspaper-classified structure. (3) Seller block shows the real, stable shop code (MD-XXXX) with a "type it into search" hook tying ads back to the till-number identity. (4) "Active since {month year}" tenure from the real profile date — honest, unlike vague "3+ years" claims.
- Share row (src/components/commerce/share-row.tsx, client): WhatsApp broadcast (wa.me/?text= "Check this ad on Mudaala: {title} — {price}\n{canonical-url}"), Copy link with Copied flash + timer cleanup, native share sheet button when navigator.share exists; full URL rendered as visible text (trust + manual fallback). Wired BOTH on the ad page (server canonical URL) and in-app ListingDetail (window origin, derived during render — the react-hooks/set-state-in-effect compiler rule rejected the useState+useEffect version; derivation is the cleaner pattern and it caught a hooks-after-early-return ordering bug too).
- Ad page body: scroll-snap photo gallery (server-rendered CSS only) with category-glyph fallback, TypeBadge/StatusBadge, price + honest discount strike, details grid (quantity, location, posted, updated, availability = real expiry, views = real counter fire-and-forget increment like the API), description, contact trio (Call/WhatsApp/Directions) + the one-line safety habit "Meet in a public place and check the goods before you pay.", "Open in the app" deep link (/#/listing/{id}) cross-wiring ad page to SPA.
- Sitemap src/app/sitemap.ts (revalidate 3600): home + every ACTIVE non-expired listing under its canonical URL. robots.ts: allow all, disallow /api/, sitemap reference. Root not-found.tsx (warm Mudaala 404). CONFLICT FOUND: template static public/robots.txt shadowed app/robots.txt (Next 500 "conflicting public file and page") — removed the static file, dynamic one wins.
- Layout gained metadataBase; .env.example documents NEXT_PUBLIC_APP_URL for production canonical URLs.
- Tests: new section 12 (19 tests) locking the URL contract (bare 308, stale slug 308), title/canonical/OG in the HTML, Product JSON-LD in UGX, REQUEST honesty (no Product markup), share href, safety line, Active since, 404, sitemap listing the canonical URL, robots sitemap reference. 202 → 221, all green. tsc + eslint clean.
- E2E (agent-browser): desktop ad page (photos, badges, serif title, price, details), seller block (shop name, "Active since Oct 2026 · Kisenyi, Kampala", MD-1762 chip, description, hours, visit-in-app), contact trio + safety line, share row (wa.me href carries title + price + canonical URL; Copy → "Copied" flash), "Open in the app" deep-link lands on the SPA detail with its own share row showing the same canonical URL; mobile 390px: no horizontal overflow; screenshots verify-ad-page{,-mid,-bottom,-seller,-mobile}.png.

Stage Summary:
- Every listing now has a real, crawlable, shareable web page: /listing/{keywords}-{id} with full metadata, honest Product markup, WhatsApp-native share, real shop identity and the market-check chip that no Ugandan competitor has. The growth loop Jiji rides (Google → ad page → contact) now exists in Mudaala with honesty built in. 221/221. Push to GitHub still pending the user's PAT.

---
Task ID: T1 (starter-launch)
Agent: Main agent (Super Z)
Task: TASK 1 of the reissued five-task brief — a real web link for every listing and shop (/l/[id], /s/[code]), OG/Twitter metadata with APP_ORIGIN canonicals, friendly gone-page with similar ads, share row with navigator.share, paged sitemap of ACTIVE listings + shops, robots wiring. One commit on branch starter-launch.

Work Log:
- Recon: HEAD was ea0a3ec (Task 29 restore + ad pages /listing/[slug], 221 tests). New brief restates the URL contract as /l/[id] + /s/[code], so Task 1 became a precise delta, not a rebuild.
- Created branch starter-launch from main.
- New src/lib/ad-page.ts: shared server helpers (loadAdRow with React.cache — never throws, resolves bare id then dash-tail; photosOf, absolutePhoto, placeOf, priceLabelOf, metaTitle in the "title · USh price / unit · Mudaala" shape, metaDescription, similarListings).
- New src/app/l/[id]/page.tsx: canonical ad page. loadAd wrapper: missing or non-ACTIVE → notFound() (404); any non-bare-id param → permanentRedirect 308 to /l/{id}. generateMetadata: OG (first photo as og:image) + Twitter cards (summary_large_image) + canonical from APP_ORIGIN + robots; Product JSON-LD kept for OFFERs only, contact phone excluded from metadata and JSON-LD.
- New src/app/l/[id]/not-found.tsx: friendly "no longer available" 404; when the URL still points at a real (expired/fulfilled/archived) listing it names the ad and offers up to 4 live ads from the same category linking /l/{id}; never renders the contact phone. Works via src/proxy.ts stamping x-mudaala-path (matcher only /l/* and /s/*) because segment not-found boundaries get no params. Next 16 accepted proxy.ts (the middleware rename) without complaint.
- New src/app/s/[code]/page.tsx: shop page by shop code. normalizeShopCode forgiving input (case/spaces/dashes, DK- legacy prefix); canonical tag always the stored MD-#### form; identity card (name, avatar, Active since, area, hours, description, code chip) + live-ads grid linking /l/{id} + ShareAdRow("Share this shop") + Open-in-app deep link /#/shop/{userId}. No phone rendered anywhere on the page. Unknown/malformed code → friendly s/[code]/not-found.tsx 404.
- src/app/listing/[slug]/page.tsx replaced by a permanent-redirect shim to /l/{tail-id} (old shared links never rot); sitemap.ts deleted, replaced by src/app/sitemap.xml/route.ts: urlset of home + ACTIVE listings (/l/{id}) + live shops (/s/{code}); >2000 entries flips /sitemap.xml into a sitemapindex over ?page=N; invalid/out-of-range page → 404. robots.ts unchanged (already points at /sitemap.xml).
- src/lib/site.ts now reads APP_ORIGIN (NEXT_PUBLIC_APP_URL kept as alias); APP_ORIGIN added to .env and .env.example. format.ts: adSlug/adPath retired; listing-detail.tsx in-app share URL now {origin}/l/{id}; share-row.tsx gained a noun prop ("ad" vs "shop").
- Tests: section 12 rewritten + grown (suite 221 → 254). Locked: metadata/title shape, twitter tags, og:image absolute, canonical, phone kept out of head + JSON-LD, share link, safety line, tenure line; 308s for /l/{keywords}-{id} and both legacy /listing/* shapes; REQUEST page honest (no Product JSON-LD, "Wanted:" title); expired ad → 404 + similar ads + no phone; unknown ad/shop → friendly 404s; shop page by code incl. lowercase input, expired stock hidden; sitemap lists ACTIVE + shops, excludes expired, page-1/page-999/page-abc behavior; robots wiring.
- Debug journey: publish 401 in section 12 was alice's stale jar — section 10 signs her out, and call() does not auto-store cookies; fixed with storeCookie + token refresh after re-login. "Phone leak" on the shop page turned out to be Next 16 dev-only React debug chunks (self.__next_f); assertions on the 200 page now strip inline scripts (real DOM), while notFound() pages assert raw HTML because their UI ships inside the RSC payload (hidden body + template).
- QA: tsc clean, eslint clean, full suite 254/254 on a fresh server, cleanup-test-data run, smoke-checked seed pages (title/canonical/og/twitter/308/shop title/sitemap 23 URLs).

Stage Summary:
- Suite: 254 passed, 0 failed (was 221). tsc + eslint clean. Test uploads removed from public/uploads before commit.
- Every listing and shop now has a real, crawlable, shareable web page under the brief's URL contract; legacy links 308 forward; gone ads are honest 404s with doors back into the market.
- NOT DONE (honest gaps): true HTTP 410 for expired ads (Next App Router pages cannot emit 410; chose 404, "404/410 as appropriate" satisfied on the 404 side); HIDDEN status does not exist until Task 2 (non-ACTIVE branch already covers it); push to GitHub still blocked pending the user's PAT, so this commit lives on local branch starter-launch only.

---
Task ID: T1b (starter-launch)
Agent: Main agent (Super Z)
Task: User-approved Task 1 addendum — the seller's Account → My Shop card shows the shop's public web link (/s/{code}) with copy-to-clipboard, right under the existing shop-code line.

Work Log:
- src/components/commerce/account-view.tsx (BusinessProfileSection): once the profile has a shopCode, a link row renders under the code line — the full {origin}/s/{code} URL as a tappable anchor (title = full URL, truncates gracefully) plus a "Copy link" button using the same Copied-flash pattern as share-row (1.5 s flash, timer cleaned up on unmount). Clipboard-denied falls back to the visible URL text.
- URL derived during render from window.location.origin — same pattern as the in-app ad share (the profile query is client-only, so the origin is always real by the time a code exists).
- One line of microcopy under the row: "Anyone with this link lands straight on your public shop page — put it on WhatsApp, posters, business cards."
- Verification: tsc clean, eslint clean, full suite 254/254 with the dev server on starter-launch (scripts/verify-t1b.sh added: branch guard → tsc → eslint → server → suite). No new API tests — client-only change; the /s/{code} target page is already covered by the Task 1 suite.
- Workspace note: the platform flipped the branch back to main between tool calls repeatedly during this small task (guard caught it each time); account-view.tsx is identical on both branches so the edit survived every flip. Worklog + commit are now assembled in single atomic Bash calls to deny the flipper a window.

Stage Summary:
- Sellers can copy their real shop web link exactly where they see their code — the "what do I actually share?" question answered in one place. Committed on starter-launch as the Task 1 addendum commit.

---
Task ID: T1h (starter-launch)
Agent: Main agent (Super Z)
Task: User-directed Task 1 hygiene pass — "review and fix the failures from task one, whatever has been failing, then clean the deads from task one."

Work Log:
- Re-verified the whole Task 1 surface on starter-launch: tsc clean, eslint clean (full repo), no never-imported files, no debug leftovers.
- scripts/deadcode-scan.ts re-run: exactly one genuine Task 1 leftover — the exported AdRow type in src/lib/ad-page.ts, never referenced anywhere (the shop page defines its ShopRow locally). Deleted. The ui/* entries the scanner lists are the deliberate shadcn-anatomy keeps documented in Task 29; the validation.ts marker is a false positive (XXX in a phone-format doc comment).
- Line-by-line review of every Task 1 file: ad-page helpers, proxy stamp, site origin, /l/[id] page + gone-page, /s/[code] page + 404, sitemap.xml route, legacy /listing 308 shim, robots.ts, share wiring. No unused imports, no phone leaks (gone-page and shop page never render numbers; the ad page destructures passwordHash out of the rendered owner), sitemap pagination math + XML escaping correct, share URLs consistent.
- Fixed: the market-check chip hardcoded the 5-listing minimum as a literal while price-trends.ts exports MIN_SAMPLE = 5 (the page comment even named it). Now imports MIN_SAMPLE so the chip can never drift from the sweep's threshold.
- Fixed (suite robustness + honesty): section 12 hunted its OFFER/REQUEST fixtures in API page 1 — accumulated no-photo test offers pushed the seeded photo ads off page 1 and the suite crashed. Fixture hunt now goes through the DB (Prisma, already used by the suite elsewhere), tolerant of odd photos values; the redundant offerRow re-fetch folded into the fixture; a missing fixture now throws a clear message instead of crashing on undefined. Typing the fixture surfaced 13 real TS18048 strictness holes the old untyped-any scrape hid — fixed with a narrowing guard. Still 254 assertions, no coverage change.
- HTTP 410 verdict re-examined: Next App Router pages cannot emit custom status codes (notFound() is hardwired to 404); alternatives (route handler shadowing /l/[id], DB lookups in proxy) would duplicate expiry logic and add a DB hit to every ad view, for a status crawlers treat like 404 for deindexing. Kept 404 + honest gone-page + noindex on the gone branch. Revisit only if Task 2 HIDDEN takedowns need a deliberate-removal signal.
- Workspace note: the platform's forced revert-to-main wiped uncommitted edits to Task 1 files repeatedly (branch-differing files do not survive it; untracked and branch-identical files do). This pass applied edits, verified and committed inside single atomic guarded calls; only committed state is treated as durable. An intermediate commit with a non-compiling suite was amended away before anything was reported green.

Stage Summary:
- Task 1 leaves zero dead code and one less magic number behind; the suite no longer depends on feed pagination for its fixtures and is strictly typed through section 12; whole gauntlet green. starter-launch: Task 1 commit + T1b addendum + this hygiene commit, tree clean.
---
Task ID: 2 (starter-launch)
Agent: Main agent (Super Z)
Task: TASK 2 — Report ad + basic moderation (spec re-pasted by user after context loss): Report model + migration, report button everywhere (guests welcome), dedupe + 10/day ceiling, Listing HIDDEN status, auto-hide at 3 distinct reporters with owner notice, admin queue (/admin, ADMIN_PHONES) with Hide/Restore/Dismiss + AuditLog, prohibited-items filter at publish, safety tip card before Call/Chat, hidden listings invisible everywhere.

Work Log:
- Workspace fought back (the platform's forced revert-to-main flipped ~6 times mid-edit), so the whole task was authored in an untracked staging dir (.t2stage, survives flips) and applied/verified/committed in single atomic guarded calls. Same durability doctrine as T1h: only committed state is real.
- Schema: Report {reporterId?, reporterIp?, targetType LISTING|SHOP, targetId, reason SCAM|STOLEN_GOODS|PROHIBITED_ITEM|WRONG_INFO|OTHER, details(500), status OPEN|ACTIONED|DISMISSED} + AuditLog {actorId, action, targetType, targetId} (ids only — no phones, no details, no IPs). Migration 20261002090000_report_moderation committed (SQLite DDL) and applied with prisma db push (sandbox runtime keeps using push; the migration file is the deploy-ready record).
- lib/reports.ts owns the rules: reporter identity = account id else coarse client IP (x-forwarded-for first hop) — never rendered, never logged, never echoed; daily ceiling counts persisted rows (UTC day, durable across restarts) at 10 per reporter BEFORE dedupe so probing with duplicates earns nothing; one OPEN report per reporter per target (closed reports don't block a fresh flag on a new violation); auto-hide tripwire = 3 DISTINCT reporter keys among OPEN reports → HIDDEN + owner notification (explains why, points at [SUPPORT EMAIL] placeholder constant in constants.ts, fires once).
- HIDDEN: added to Listing status union + STATUS_UI ("Hidden" badge); ALLOWED_STATUS_TRANSITIONS[HIDDEN] = [] so owners have NO self-service path out; only admin Restore returns it to ACTIVE. GET /api/listings/[id] → 404 "no longer available" for everyone except the owner (owner needs to see the state; guests/buyers get the honest 404). searchListings already defaults to ACTIVE-only, shop catalogue and the paged sitemap filter ACTIVE — hidden now vanishes from browse, search, shop pages and sitemap with zero new query code.
- Admin: /admin page (server-gated via new isAdminUser; friendly "Admins only" screen for everyone else — an App Router page cannot emit 403, the /api/admin/* endpoints are the real 403 boundary and are tested). GET /api/admin/reports returns OPEN reports with target summaries (listing title/status, shop name/code/hidden count) and deliberately NO reporter identities. PATCH /api/admin/reports/[id] {action}: HIDE (→HIDDEN + owner notice + remaining OPEN reports ACTIONED), RESTORE (HIDDEN→ACTIVE + remaining OPEN reports DISMISSED so the same trio cannot instantly re-hide; 409 on non-hidden), DISMISS (report closed, listing untouched). requireAdmin gates all three.
- Prohibited items filter: PROHIBITED_ITEMS + findProhibitedItem() in constants.ts (word/phrase boundary matching so "gunia" sacks never trip "gun"; categories: weapons, drugs, stolen-goods wording incl. "no papers", government/police/military property, public infrastructure — electric cable, transformer, manhole, railway metal — and counterfeit). Enforced at publish AND on title/description edits with the rule's friendly label in the rejection.
- UI: SafetyTip card (meet in public / check goods before paying / never pay in advance) rendered BEFORE Call/WhatsApp on both the in-app detail and the public ad page; ReportButton+dialog (reason radio cards with plain-word hints, optional 500-char details, thank-you state, friendly 409/429 errors) wired on listing detail, /l/[id], shop view (non-owner), /s/[code]. AdminReportsView: live queue (30s refetch) with Hide/Restore/Dismiss.
- Tests: section 13 (~40 assertions): guest reporting + dedupe 409, auto-hide at 3 distinct reporters (2 guest IPs + 1 account), owner notification content, direct fetch 404 vs owner 200, gone from search + sitemap, owner cannot self-restore, admin gate 401/403, queue contents + no IP leak, dismiss-does-not-restore, hide idempotent + audited, restore + audited + open reports dismissed, restore-on-live 409, daily ceiling sweep (11th → 429, separate budget for a signed-in reporter), shop reports dismiss-only (HIDE → 409), prohibited publish rejections (weapon / "no papers" / electric cable) + clean publish passes + edit-path rejection, /admin friendly screen + noindex.
- Verification (this commit): tsc clean, eslint clean, full suite green on the restarted dev server.

Stage Summary:
- Mudaala can now be policed: anyone can flag, three distinct flags take an ad down automatically, the owner is told why with an appeals address, and the admin desk hides/restores/dismisses with an audit trail. Prohibited goods bounce at the door with friendly words, and every listing page teaches the three safety habits before it hands over a phone number. 254 → ~294 tests. Not done, on purpose: shop-level takedown (shop reports are dismiss-only in V1 — HIDDEN is a listing state), [SUPPORT EMAIL] still a placeholder constant, /admin page renders a friendly screen instead of a literal 403 (App Router limitation; the APIs are the enforced gate).
---
Task ID: 3 (starter-launch)
Agent: Main agent (Super Z)
Task: TASK 3 — Password reset by SMS code: SmsProvider interface (Africa's Talking + console), PasswordReset model (hashed 6-digit code, 10 min, 5 attempts), 3/phone/hour + 10/IP/hour request limits, zero account enumeration, register-grade password rules, full session revocation, forgot-password UI, tests.

Work Log:
- Schema: PasswordReset {userId, codeHash "salt:hash", expiresAt (+10 min), attempts (dead at 5), usedAt} + User.passwordResets; migration 20261002120000_password_reset committed (SQLite DDL, deploy-ready record) and applied via prisma db push (sandbox keeps using push).
- lib/password.ts (NEW, next-free): hashPassword/verifyPassword moved here from auth.ts (auth.ts re-exports — call sites unchanged) plus hashCode/verifyCode (salted sha256 — a 6-digit keyspace is tiny, the per-code salt kills rainbow tables) and generateCode (crypto randomInt, zero-padded). Being next-free is what lets the test suite mint KNOWN codes with the app's own primitive.
- lib/sms.ts (NEW): SmsProvider interface; AfricasTalkingSmsProvider (POST version1/messaging, apiKey/username/from headers+body from AT_API_KEY/AT_USERNAME/AT_SENDER_ID, 10s abort timeout, recipient status checked, HTTP-status-only errors — gateway bodies are never echoed into errors); ConsoleSmsProvider for every non-production environment (delivery simulated). sendSmsBestEffort never throws to callers and on failure logs provider name + reason ONLY — the phone number and the code never reach logs in any environment (red line). Provider choice: production → Africa's Talking, else console.
- lib/password-reset.ts (NEW): createPasswordReset (account-less phones no-op silently; one live code per account — a fresh request retires older ones; code hashed; SMS via best-effort provider) and confirmPasswordReset (ONE 'invalid' answer for unknown phone / no row / expired / used / dead / wrong code; wrong entries increment attempts atomically; success transaction = password flip + code burned + leftover codes deleted + ALL sessions revoked).
- Routes: POST /api/auth/password/reset/request — IP budget first, then phone budget consumed for every valid-format phone BEFORE the account lookup (429s are identical for real and ghost numbers), fixed 200 message for every valid request; POST /api/auth/password/reset/confirm — parse (register-grade password rules) → confirm → clearSessionCookie. Limits: RESET_PHONE_MAX=3/hour, RESET_IP_MAX=10/hour (rate-limit.ts; env-tunable).
- Validation: COMMON_PASSWORDS + passwordPolicyError(password, phone) in validation.ts; registerSchema gained a superRefine so register NOW ENFORCES the full rule set the spec names (min 8, not common, not the phone in any dial format) — previously only min-8 existed; passwordResetRequest/Confirm schemas share the same policy. Suite fixture passwords updated off the common list ('password123' → 'quiet-harbor-31'; seed/demo 'demo1234' deliberately kept — dev fixtures).
- db.ts: Prisma query logging is now OFF by default (PRISMA_QUERY_LOG=1 to re-enable) — every logged query echoes parameter values, and parameters include phone numbers. This was a standing red-line violation in dev logs; the suite now enforces the fix (14.7).
- Cron sweep: stale PasswordReset rows (expired > 24 h ago) are deleted; sweep response gained staleResets count.
- UI: sign-in form gained "Forgot password?" → in-dialog three-step flow (phone → code + new password → done) with one-time-code autocomplete, numeric-only 6-digit input, register-rule hint, honest "if that number has an account…" wording (the UI cannot know either), unified error surface for 400/429, and "Back to sign in" reset. Register form hint now states the real password rules.
- scripts/mint-reset-code.ts (NEW, dev-only, refuses NODE_ENV=production): mints a KNOWN code on a real account for hand-testing the dialog, since codes are by design unreadable from logs or the API.
- Hermetic suite fixtures (running the full suite twice on one sandbox DB in a single day exposed 6 cross-run failures, all state-dependence, none Task-3 bugs): section 11 retires stale ACTIVE OFFERs in its two median combos before rebuilding them (a median over accumulated junk is a lie); section 12's gone-page test ships its OWN fresh similar-ad instead of borrowing a seeded photo listing that earlier runs can crowd out of the take-4 rail; section 13's reporter IPs are run-unique because report rows persist and count per UTC day (a fixed IP from an earlier run is already spent); the 'Alice Test Shop' name is run-unique everywhere (profile puts AND the URL-encoded check-name queries) so check-name's exclude-their-own check never meets yesterday's shop.
- Tests: section 14 (28 assertions) — no enumeration on BOTH steps (byte-identical request responses; confirm-for-ghost = wrong-code), row exists + salted-hash shape, dev.log contains no phone after a real request, 3/phone/hour then 429, 10/IP/hour then 429 (distinct fake x-forwarded-for IPs so the suite never pollutes its own 'local' budgets), wrong code → unified message + attempt counted, 5 wrong entries kill the code (right code refused), attempts capped at 5, expired → unified 400, reused → unified 400, same code cannot reset twice after success, short/common/phone-equal new passwords → 400 with register wording and NO attempt burned, success → 200 + code marked used + sessions 3→0 + old password 401 + new password signs in.
- Workspace fought the usual flip-to-main battle; all branch-differing files were edited in the untracked .t3stage staging dir and applied/verified/committed in single atomic guarded calls. Only committed state is durable.

Stage Summary:
- A forgotten password is now a two-step, self-service fix: phone → SMS code → new password, with the account permanently guarded (hashed codes, burn-after-5-tries, 10-minute life, budgets at 3/phone and 10/IP per hour, no enumeration anywhere, every session revoked on success). SMS delivery is swappable by interface; production failures are loud but PII-free. Full suite green: 340 passed, 0 failed (28 new password-reset assertions + the de-skipped hermetic paths), tsc + eslint clean. NOT done, on purpose: no "your password was changed" notification (spec didn't ask; Notification types are listing-centric), AT credentials still placeholders in .env.example until real ones exist, push to GitHub still blocked pending the user's PAT.

---
Task ID: 4 (starter-launch)
Agent: Main agent (Super Z)
Task: TASK 4 — Legal pages + Phase 1 security fixes: /privacy /terms /safety from /content markdown, footer/register/Account links, required 18+/terms checkbox storing User.termsAcceptedAt + termsVersion, admin-only settings with AES-256-GCM at rest (SETTINGS_ENCRYPTION_KEY), constant-time x-cron-secret on the sweep, rate limits (login 5 failed/phone/15min + 20/IP, register 5/IP/hour, publish 20/user/day, upload 30/user/hour), login no-enumeration, ALLOW_BEARER_AUTH gate, CSRF Origin check, security headers, ownership audit + cross-user tests, ignoreBuildErrors already false, sharp EXIF/GPS strip + 1200px WebP (already in place — now proven by tests), startup env validation, .env.example, .env/db untracked.

Work Log:
- Recon on starter-launch found several spec items ALREADY shipped by earlier tasks (settings admin-gate + masking + enc: at rest, sweep secret with sha256+timingSafeEqual, sharp EXIF-rotate/1200px/WebP pipeline, ignoreBuildErrors=false, login 5/phone lockout + identical 401s, .gitignore covering .env + /db). The delta was implemented and is now test-pinned.
- Rate limits per spec: rate-limit.ts gained per-limit windows (register 5/IP/hour, publish 20/user/day, upload 30/user/hour; login IP cap 30→20, counts every attempt; phone cap counts failures only and clears on success). Wired into register, publish (POST /api/listings) and upload; messages stay friendly.
- Terms: register requires acceptTerms (server 400 with the confirm message; schema field optional so missing and false get the same friendly answer), User.termsAcceptedAt + termsVersion stamped at creation; migration 20261002150000_terms_accepted committed and applied via db push; TERMS_VERSION = '2026-10-02' in constants.ts (bump to force re-confirmation later).
- Legal pages: /privacy /terms /safety render content/*.md through a dependency-free markdown renderer (React nodes, no HTML injection path; URL schemes whitelisted). Loader reads the file per request, so pasting new text into /content shows up immediately; standalone build now copies content/ too. Site footer (layout-wide) + register-form checkbox links + Account legal row carry the three links.
- Bearer gate: bearerAuthEnabled() in env-flags.ts (next-free, unit-tested) — ALLOW_BEARER_AUTH=true/1 enables, legacy AUTH_BEARER_FALLBACK=1 still honoured, unset = cookie-only (production posture).
- CSRF: proxy widened to /api/* — any non-GET API request presenting a foreign Origin header is 403'd at the door (stronger than cookie-only: covers bearer too); no-Origin clients (server-to-server, the suite) pass.
- Security headers via next.config: CSP (frame-ancestors from FRAME_ANCESTORS env, default 'self' so the preview iframe keeps working — production sets 'none'), nosniff, Referrer-Policy strict-origin-when-cross-origin, HSTS 2y, Permissions-Policy, X-Frame-Options mirroring self/none.
- Env validation: src/lib/env.ts + src/instrumentation.ts — production boots only with DATABASE_URL, NEXT_PUBLIC_APP_URL, CRON_SECRET, SETTINGS_ENCRYPTION_KEY, ADMIN_PHONES present (named errors, fail fast); dev logs warnings. Bearer-in-production is a loud warning.
- Settings key now prefers SETTINGS_ENCRYPTION_KEY (spec name) with SETTINGS_ENC_KEY as the working legacy alias.
- Suite: .env is now parsed at suite start (CRON_SECRET etc. visible to the runner); every suite call carries a run-unique x-forwarded-for so the suite behaves like a crowd of devices and per-IP budgets never self-trip (explicit-IP tests still override); register() sends acceptTerms:true. New section 15 (40 assertions): bearer-gate + env-validator units, three legal pages + footer links, terms rejection/acceptance + DB version stamp, login 20/IP and register 5/IP floods, publish daily ceiling (cap read from env, 41 publishes) and upload 31-st flood, CSRF foreign/same/no-Origin, five security headers, EXIF/GPS strip proven with a GPS-tagged 2400px JPEG (stored WebP ≤1200px, exif undefined, tag bytes gone), cross-user matrix (saved-search check/delete, listing edit, mark-read no-op).
- Ownership audit (report): every id-taking route re-verified — listings/[id] PATCH/DELETE + refresh use getOwnedListingOr404 (foreign == missing, 404); saved-searches/[id] + check compare userId (404); notifications/mark-read scopes updateMany by userId (silent no-op); profile PUT is session-scoped upsert; settings + admin/reports gated by requireAdmin (403); shops/[id], sellers/[id], listings/[id] GET are public reads by design; reports POST is open (guests may report); cron/sweep is secret-gated. 404-for-foreign is deliberate (existence never confirmed).

Stage Summary:
- Suite 382 passed, 0 failed; tsc clean; eslint clean; dev server restarted on the new config before the run.
- NOT done, on purpose: nonce-based CSP (Next inline bootstrap needs unsafe-inline for now), X-Frame-Options omitted only when FRAME_ANCESTORS names custom origins, register form links open in a new tab (SPA dialog context), RATE_LIMIT_PUBLISH_MAX=40 in the sandbox .env purely as suite headroom — the shipped default is the spec's 20.
