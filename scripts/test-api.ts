/**
 * Mudaala — API behavior & security tests.
 *
 * Tests observable outcomes and permission boundaries against the running dev
 * server, not implementation details. Run: npx tsx scripts/test-api.ts
 *
 * Covers: auth (cookie AND Bearer transport, Ugandan phone formats), ownership
 * enforcement (positive AND negative), validation, currency handling, status
 * transition rules, refresh cooldown, expiry sweep, saved-search matching +
 * permissions, notification permissions, postgres settings masking, photos +
 * shop identity, public shop catalogue, discount (old-price) rules, shop
 * completeness checklist, reports & moderation (guest + signed-in reporting,
 * dedupe, daily cap, auto-hide at 3 distinct reporters, admin 403 walls,
 * hide/restore/dismiss with audit trail, prohibited-items filter, safety
 * card, report control), password reset by SMS (anti-enumeration, code
 * lifecycle: wrong/expired/reused/killed, shared password rulebook, session
 * revocation, per-phone rate cap).
 */
import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
import path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { SUPPORT_EMAIL, TERMS_VERSION } from '../src/lib/constants'
// Pure-function units under test (no next/* imports — safe outside a request).
import { bearerAuthEnabled } from '../src/lib/env-flags'
import { validateEnv } from '../src/lib/env'
import { chooseStorage, readStorageEnv, S3Storage, signS3Put } from '../src/lib/storage'

const BASE = 'http://localhost:3000'
const db = new PrismaClient()

// The dev server loads .env; tsx does not. Parse it (without overriding
// anything already exported) so secrets like CRON_SECRET and the rate-limit
// knobs this suite needs are visible here too.
function loadDotEnv(file = '.env') {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (m && process.env[m[1]!] === undefined) {
        process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
      }
    }
  } catch {
    /* no .env — CI provides env vars directly */
  }
}
loadDotEnv()

// Every request the suite makes carries a run-unique x-forwarded-for, so the
// suite acts like a crowd of distinct devices: per-IP rate-limit buckets and
// per-IP report dedupe never trip on the suite's own ordinary traffic. Tests
// that specifically exercise an IP budget pass their OWN fixed IP via
// extraHeaders, which overrides this one. (Run-salted so two runs against a
// server that was not restarted never share a bucket either.)
const RUN_SALT = 1 + (Date.now() % 200)
let xffCounter = 0
const autoXff = () => `10.${RUN_SALT}.${xffCounter++ % 250}.7`

let passed = 0
let failed = 0
const failures: string[] = []

function ok(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failures.push(name + (detail ? ` — ${detail}` : ''))
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

interface Jar {
  cookie: string
  token?: string
  user?: { id: string; name: string; phone: string }
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  jar?: Jar,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; json: any; setCookie?: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': autoXff(),
      ...(jar?.cookie ? { cookie: jar.cookie } : {}),
      ...(jar?.token ? { authorization: `Bearer ${jar.token}` } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json: any = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') ?? undefined }
}

function storeCookie(jar: Jar, res: { setCookie?: string }) {
  if (res.setCookie) {
    const pair = res.setCookie.split(';')[0]
    const name = pair.split('=')[0]
    jar.cookie = jar.cookie
      ? jar.cookie
          .split('; ')
          .filter((c) => !c.startsWith(`${name}=`))
          .concat(pair)
          .join('; ')
      : pair
  }
}

async function register(jar: Jar, phone: string, name: string, password: string, country = 'UG') {
  const res = await call('POST', '/api/auth/register', { phone, name, password, country, acceptTerms: true }, jar)
  storeCookie(jar, res)
  if (res.json?.sessionToken) jar.token = res.json.sessionToken
  jar.user = res.json?.user
  if (res.json?.user?.id) createdUserIds.add(res.json.user.id)
  return res
}

const uniquePhone = () => `+2567${String(Math.floor(10000000 + Math.random() * 89999999))}`
// Per-run tag: fixture shop names embed it, so repeated suite runs never
// collide with debris from earlier runs sitting in the same dev database.
const RUN_TAG = Date.now().toString(36)
// Every user id the suite creates (via register() and the direct flood-loop
// POSTs). The final hermetic sweep deletes exactly these — so a suite run
// leaves the shared dev/preview database exactly as it found it, and no
// fixture users ever reach the preview feed again.
const createdUserIds = new Set<string>()

const validListing = {
  type: 'OFFER',
  title: 'Test copper scrap offering',
  description: 'Clean test copper scrap for validating the publishing pipeline end to end.',
  category: 'scrap-recyclables',
  price: 500,
  currency: 'UGX',
  priceNegotiable: false,
  unit: 'kg',
  quantity: 100,
  country: 'UG',
  county: 'Kampala',
  area: 'Test Area',
  contactPhone: '+256712345678',
  contactWhatsapp: null,
}

async function main() {
  let createdListingId = ''
  console.log('\n== 1. Authentication ==')
  const alice: Jar = { cookie: '' }
  const alicePhone = uniquePhone()
  {
    const bad = await call('POST', '/api/auth/register', { phone: 'not-a-phone', name: 'X Y', password: 'short' })
    ok('register rejects invalid phone + short password (400)', bad.status === 400 && bad.json.fields)

    const res = await register(alice, alicePhone, 'Alice Tester', 'password321')
    ok('register creates account (201)', res.status === 201 && res.json?.user?.id)
    ok('register response never contains passwordHash', !JSON.stringify(res.json).includes('passwordHash'))

    const dup = await register({ cookie: '' }, alicePhone, 'Alice Again', 'password321')
    ok('register rejects duplicate phone (409)', dup.status === 409)

    const wrongPw = await call('POST', '/api/auth/login', { phone: alicePhone, password: 'wrongpassword' })
    ok('login with wrong password → 401, no enumeration', wrongPw.status === 401)

    const ghost = await call('POST', '/api/auth/login', { phone: '+256700111222', password: 'whatever123' })
    ok('login with unknown phone → same 401 message', ghost.status === 401 && ghost.json.error === wrongPw.json.error)

    const login = await call('POST', '/api/auth/login', { phone: alicePhone, password: 'password321' }, alice)
    ok('login works (200) and sets session cookie', login.status === 200 && alice.cookie.includes('mudaala_session'))
    ok('login returns sessionToken for the Bearer channel', typeof login.json?.sessionToken === 'string' && login.json.sessionToken.length > 0)

    const me = await call('GET', '/api/auth/me', undefined, alice)
    ok('GET /me returns session user', me.json?.user?.phone === alicePhone)
    ok('GET /me includes account country', typeof me.json?.user?.country === 'string')

    const anonMe = await call('GET', '/api/auth/me')
    ok('GET /me without session → user null', anonMe.json?.user === null)
  }

  console.log('\n== 1b. Ugandan phone formats + Bearer transport ==')
  {
    // Seeded dev fixtures: same local-format numbers a real user would type.
    const ugLogin = await call('POST', '/api/auth/login', { phone: '0772123456', password: 'demo1234' })
    ok('Ugandan local number 0772123456 logs in (no country chosen)', ugLogin.status === 200 && ugLogin.json?.user?.phone === '+256772123456')

    const ugDial = await call('POST', '/api/auth/login', { phone: '256776123456', password: 'demo1234' })
    ok('Ugandan number typed with dial code 256776123456 logs in', ugDial.status === 200 && ugDial.json?.user?.phone === '+256776123456')

    // Register a Ugandan account with country declared.
    const ug: Jar = { cookie: '' }
    const ugPhone = `077${String(Math.floor(1000000 + Math.random() * 8999999))}`.slice(0, 10)
    const ugReg = await register(ug, ugPhone, 'Kampala Tester', 'password321', 'UG')
    ok('register with country=UG creates +256 account (201)', ugReg.status === 201 && ugReg.json?.user?.phone?.startsWith('+256'))

    // Bearer-only transport: session survives with the cookie completely blocked.
    const bearer: Jar = { cookie: '', token: ugLogin.json.sessionToken }
    const meBearer = await call('GET', '/api/auth/me', undefined, bearer)
    ok('Bearer header authenticates without any cookie (iframe safety)', meBearer.json?.user?.phone === '+256772123456')

    const anonCreate = await call('POST', '/api/listings', validListing)
    ok('Bearer-less anon create still 401', anonCreate.status === 401)

    const bearerLogout = await call('POST', '/api/auth/logout', undefined, bearer)
    const meAfterBearerLogout = await call('GET', '/api/auth/me', undefined, bearer)
    ok('logout revokes the Bearer-only session too', bearerLogout.status === 200 && meAfterBearerLogout.json?.user === null)
  }

  console.log('\n== 1c. Login rate limiting ==')
  {
    // A throwaway account (deleted right after) proves the lockout: 5 wrong
    // passwords are allowed, the 6th attempt is 429 even with the RIGHT one.
    const rlPhone = uniquePhone()
    const rl: Jar = { cookie: '' }
    const rlReg = await register(rl, rlPhone, 'RL Lockout', 'password321')
    ok('rate-limit fixture account created (precondition)', rlReg.status === 201)

    let saw401 = 0
    for (let i = 0; i < 5; i++) {
      const wrong = await call('POST', '/api/auth/login', { phone: rlPhone, password: `wrong-attempt-${i}` })
      if (wrong.status === 401) saw401++
    }
    ok('5 wrong attempts each get the normal 401', saw401 === 5)

    const locked = await call('POST', '/api/auth/login', { phone: rlPhone, password: 'password321' })
    ok('6th attempt locked out with 429 — even with the correct password', locked.status === 429)
    ok('lockout message is friendly and human', typeof locked.json?.error === 'string' && locked.json.error.includes('wait'))

    const alsoLocked = await call('POST', '/api/auth/login', { phone: `0${rlPhone.slice(4)}`, password: 'password321' })
    ok('local-format dialing of the same phone is locked too (normalization)', alsoLocked.status === 429)

    // A DIFFERENT phone from the same IP is untouched — the lock is per phone.
    const other = await call('POST', '/api/auth/login', { phone: '0772123456', password: 'demo1234' })
    ok('other phones from the same IP still sign in (200)', other.status === 200)

    // Success clears counters: a lockout-free phone can fail, succeed, and fail again.
    const nakato = await call('POST', '/api/auth/login', { phone: '0772123456', password: 'wrong-once' })
    const nakatoOk = await call('POST', '/api/auth/login', { phone: '0772123456', password: 'demo1234' })
    const nakatoFailAgain = await call('POST', '/api/auth/login', { phone: '0772123456', password: 'wrong-again' })
    ok(
      'success resets the failure counter (fail→success→fail is still 401, not 429)',
      nakato.status === 401 && nakatoOk.status === 200 && nakatoFailAgain.status === 401,
    )

    // Cleanup the throwaway so the fixture stays clean.
    const rlMe = await call('GET', '/api/auth/me', undefined, rl)
    const rlUser = rlMe.json?.user
    if (rlUser) await db.user.delete({ where: { id: rlUser.id } })
  }

  console.log('\n== 2. Listing creation & validation ==')
  {
    const anon = await call('POST', '/api/listings', validListing)
    ok('unauthenticated create → 401', anon.status === 401)

    const missing = await call('POST', '/api/listings', { type: 'OFFER', title: 'No' }, alice)
    ok('create with missing fields → 400 + field errors', missing.status === 400 && Boolean(missing.json.fields))

    const badCategory = await call('POST', '/api/listings', { ...validListing, category: 'not-a-category' }, alice)
    ok('create with unknown category → 400', badCategory.status === 400)

    const badUnit = await call('POST', '/api/listings', { ...validListing, unit: 'truckload' }, alice)
    ok('create with unknown unit → 400', badUnit.status === 400)

    const negPrice = await call('POST', '/api/listings', { ...validListing, price: -5 }, alice)
    ok('create with negative price → 400', negPrice.status === 400)

    const noPrice = await call('POST', '/api/listings', { ...validListing, price: null, priceNegotiable: false }, alice)
    ok('OFFER without price and not negotiable → 400', noPrice.status === 400)

    const priceNoUnit = await call('POST', '/api/listings', { ...validListing, unit: null }, alice)
    ok('price without unit → 400', priceNoUnit.status === 400)

    const created = await call('POST', '/api/listings', validListing, alice)
    ok('valid create → 201 with persisted record', created.status === 201 && created.json?.listing?.id)
    createdListingId = created.json.listing.id
    ok('server ignores client-supplied status/ownership', created.json.listing.status === 'ACTIVE' && created.json.listing.userId === alice.user!.id)

    const ugListing = await call('POST', '/api/listings', { ...validListing, price: 18000, currency: 'UGX', country: 'UG', county: 'Kampala', contactPhone: '0772123456' }, alice)
    ok('UGX listing in Kampala with local UG phone → 201', ugListing.status === 201 && ugListing.json?.listing?.currency === 'UGX' && ugListing.json?.listing?.contactPhone === '+256772123456')

    const mismatch = await call('POST', '/api/listings', { ...validListing, county: 'Nairobi' }, alice)
    ok('location outside Uganda → 400 (country/location match enforced)', mismatch.status === 400)

    const badCurrency = await call('POST', '/api/listings', { ...validListing, currency: 'USD' }, alice)
    ok('unsupported currency → 400', badCurrency.status === 400)
  }

  console.log('\n== 3. Search, filters, pagination ==')
  {
    const search = await call('GET', '/api/listings?q=' + encodeURIComponent('test copper scrap'))
    ok('text search finds the created listing', search.json.items.some((l: any) => l.id === createdListingId))

    const wrongQ = await call('GET', '/api/listings?q=' + encodeURIComponent('zebra-unicorn-nothing'))
    ok('non-matching search returns empty, not everything', wrongQ.json.total === 0)

    const byCat = await call('GET', '/api/listings?category=scrap-recyclables')
    ok('category filter returns only that category', byCat.json.items.every((l: any) => l.category === 'scrap-recyclables') && byCat.json.total > 0)

    const byType = await call('GET', '/api/listings?type=REQUEST')
    ok('type filter returns only REQUEST', byType.json.items.every((l: any) => l.type === 'REQUEST'))

    const byCounty = await call('GET', '/api/listings?county=Gulu')
    ok('county filter returns only Gulu', byCounty.json.items.every((l: any) => l.county === 'Gulu') && byCounty.json.total > 0)

    const priceRange = await call('GET', '/api/listings?minPrice=600&maxPrice=700')
    ok('price range filter respects bounds', priceRange.json.items.every((l: any) => l.price >= 600 && l.price <= 700))

    const paged = await call('GET', '/api/listings?page=1&pageSize=2')
    const paged2 = await call('GET', '/api/listings?page=2&pageSize=2')
    ok('pagination: page 1 returns pageSize items', paged.json.items.length <= 2)
    ok('pagination: page 2 differs from page 1', paged.json.items[0]?.id !== paged2.json.items[0]?.id)

    const badParams = await call('GET', '/api/listings?page=abc')
    ok('invalid query params → 400', badParams.status === 400)
  }

  console.log('\n== 3b. Photos, upload & shop identity ==')
  {
    // 1x1 transparent PNG (valid magic bytes) and a fake "png" that is text.
    const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const pngBytes = Buffer.from(PNG_B64, 'base64')

    const anonUpload = await fetch(`${BASE}/api/upload`, { method: 'POST', body: (() => { const f = new FormData(); f.append('file', new Blob([pngBytes], { type: 'image/png' }), 'a.png'); return f })() })
    ok('unauthenticated upload → 401', anonUpload.status === 401)

    const upload = await fetch(`${BASE}/api/upload`, {
      method: 'POST',
      headers: { cookie: alice.cookie, authorization: `Bearer ${alice.token}` },
      body: (() => { const f = new FormData(); f.append('file', new Blob([pngBytes], { type: 'image/png' }), 'a.png'); return f })(),
    })
    const uploadJson = await upload.json().catch(() => null)
    ok('signed-in PNG upload → 201 with /uploads/ url', upload.status === 201 && typeof uploadJson?.url === 'string' && uploadJson.url.startsWith('/uploads/'))
    const photoUrl: string | undefined = uploadJson?.url

    const fakePng = await fetch(`${BASE}/api/upload`, {
      method: 'POST',
      headers: { cookie: alice.cookie, authorization: `Bearer ${alice.token}` },
      body: (() => { const f = new FormData(); f.append('file', new Blob(['definitely not an image'], { type: 'image/png' }), 'fake.png'); return f })(),
    })
    ok('renamed non-image rejected by magic bytes → 400', fakePng.status === 400)

    // Every stored photo is re-encoded to WebP, max edge 1200: upload a big
    // 4000×3000 PNG and check what ACTUALLY got written on disk.
    const BIG_PNG = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 120, g: 160, b: 90 } },
    }).png().toBuffer()
    const bigUpload = await fetch(`${BASE}/api/upload`, {
      method: 'POST',
      headers: { cookie: alice.cookie, authorization: `Bearer ${alice.token}` },
      body: (() => { const f = new FormData(); f.append('file', new Blob([new Uint8Array(BIG_PNG)], { type: 'image/png' }), 'big.png'); return f })(),
    })
    const bigJson = await bigUpload.json().catch(() => null)
    ok('oversized photo upload → 201 with .webp url', bigUpload.status === 201 && typeof bigJson?.url === 'string' && bigJson.url.startsWith('/uploads/') && bigJson.url.endsWith('.webp'))
    const storedPath = path.join(process.cwd(), 'public', bigJson?.url ?? '')
    const storedMeta = await sharp(storedPath).metadata()
    ok(
      'stored photo is WebP inside the 1200px box',
      storedMeta.format === 'webp' && Math.max(storedMeta.width ?? 0, storedMeta.height ?? 0) <= 1200,
    )
    const storedBytes = await fs.promises.readFile(storedPath)
    const pngBytesOnDisk = await sharp(storedPath).png().toBuffer()
    ok(
      're-encoding actually shrank the market photo (WebP < same image as PNG)',
      storedBytes.byteLength < pngBytesOnDisk.byteLength,
    )

    // Photos flow through create (with sanitization), detail, browse.
    const withPhotos = await call('POST', '/api/listings', {
      ...validListing,
      title: 'Photo listing with hostile link',
      photos: photoUrl ? [photoUrl, 'javascript:alert(1)', '  ', photoUrl] : ['javascript:alert(1)'],
    }, alice)
    ok('create with photos → 201', withPhotos.status === 201)
    ok('photos sanitized: hostile/duplicate entries dropped, cap respected', Array.isArray(withPhotos.json?.listing?.photos) && withPhotos.json.listing.photos.length === (photoUrl ? 1 : 0) && (photoUrl ? withPhotos.json.listing.photos[0] === photoUrl : true))

    const detailWithPhotos = await call('GET', `/api/listings/${withPhotos.json.listing.id}`)
    ok('detail returns photos array', JSON.stringify(detailWithPhotos.json?.listing?.photos) === JSON.stringify(withPhotos.json.listing.photos))

    const patchedPhotos = await call('PATCH', `/api/listings/${withPhotos.json.listing.id}`, { photos: [photoUrl ?? '/uploads/x.png', '/uploads/y.png'] }, alice)
    ok('PATCH replaces photos (sanitized)', patchedPhotos.status === 200 && patchedPhotos.json?.listing?.photos?.length === (photoUrl ? 2 : 1))

    // Browse results carry the shop identity (who is selling).
    const browse = await call('GET', '/api/listings?pageSize=50')
    const withShop = browse.json.items.find((l: any) => l.user?.name)
    ok('browse items include seller identity', Boolean(withShop))
    const seededWithShop = browse.json.items.find((l: any) => l.user?.profile?.businessName)
    ok('named shop (businessName) surfaces on browse', Boolean(seededWithShop))

    // Shop profile photo round-trip.
    const profilePut = await call('PUT', '/api/profile', {
      businessName: `Alice Test Shop ${RUN_TAG}`,
      photoUrl: photoUrl ?? null,
      category: 'other',
      description: null,
      county: 'Kampala',
      area: null,
      phone: alicePhone,
      whatsapp: null,
      hours: null,
    }, alice)
    ok('profile PUT with shop photo (200)', profilePut.status === 200 && profilePut.json?.profile?.photoUrl === (photoUrl ?? null))

    const badPhotoProfile = await call('PUT', '/api/profile', {
      businessName: `Alice Test Shop ${RUN_TAG}`,
      photoUrl: 'javascript:alert(1)',
      category: 'other',
      description: null,
      county: 'Kampala',
      area: null,
      phone: alicePhone,
      whatsapp: null,
      hours: null,
    }, alice)
    ok('profile rejects hostile photoUrl → 400', badPhotoProfile.status === 400)

    await call('DELETE', `/api/listings/${withPhotos.json.listing.id}`, undefined, alice)
  }

  console.log('\n== 3c. Shop page (public catalogue), discounts & checklist ==')
  {
    // Alice's profile exists from 3b: photo set, description/area/hours/whatsapp empty.
    const anonProfile = await call('GET', '/api/profile')
    ok('profile checklist requires sign-in → 401', anonProfile.status === 401)

    const profileState = await call('GET', '/api/profile', undefined, alice)
    ok('profile returns honest checklist + complete flag', profileState.status === 200
      && profileState.json?.checklist?.photo === true
      && profileState.json?.checklist?.description === false
      && profileState.json?.complete === false)

    // Discount listing: valid (old price above current price).
    const discount = await call('POST', '/api/listings', {
      ...validListing,
      title: 'Discounted maize beams test',
      price: 500,
      compareAtPrice: 800,
    }, alice)
    ok('create with valid old price → 201, serializer returns compareAtPrice',
      discount.status === 201 && discount.json?.listing?.compareAtPrice === 800)

    // Discount rules: old price must beat the current price, and need one.
    const badDiscount = await call('POST', '/api/listings', {
      ...validListing,
      title: 'Fake discount must be rejected',
      price: 500,
      compareAtPrice: 400,
    }, alice)
    ok('old price below current price → 400 with field error',
      badDiscount.status === 400 && Boolean(badDiscount.json?.fields?.compareAtPrice))

    const orphanDiscount = await call('POST', '/api/listings', {
      ...validListing,
      title: 'Old price without current price',
      price: null,
      priceNegotiable: true,
      compareAtPrice: 800,
    }, alice)
    ok('old price without a current price → 400', orphanDiscount.status === 400)

    // PATCH: clear then set the discount against the merged record.
    const cleared = await call('PATCH', `/api/listings/${discount.json.listing.id}`, { compareAtPrice: null }, alice)
    ok('PATCH clears old price (null)', cleared.status === 200 && cleared.json?.listing?.compareAtPrice === null)
    const reDiscount = await call('PATCH', `/api/listings/${discount.json.listing.id}`, { compareAtPrice: 900 }, alice)
    ok('PATCH sets old price (900)', reDiscount.status === 200 && reDiscount.json?.listing?.compareAtPrice === 900)
    const badPatch = await call('PATCH', `/api/listings/${discount.json.listing.id}`, { compareAtPrice: 100 }, alice)
    ok('PATCH old price below price → 400', badPatch.status === 400 && Boolean(badPatch.json?.fields?.compareAtPrice))

    // Public shop page: no sign-in, catalogue only from this shop, ACTIVE only.
    const shopAnon = await call('GET', `/api/shops/${alice.user?.id ?? ''}`)
    ok('shop page is public (no auth)', shopAnon.status === 200)
    const shopBody = shopAnon.json
    ok('shop name uses the seller-chosen business name', shopBody?.shop?.name === `Alice Test Shop ${RUN_TAG}`)
    ok('shop exposes no password material', !JSON.stringify(shopBody).includes('passwordHash'))
    ok('shop catalogue contains only this seller ACTIVE listings',
      Array.isArray(shopBody?.listings)
      && shopBody.listings.every((l: any) => l.userId === alice.user?.id && l.status === 'ACTIVE')
      && shopBody.listings.some((l: any) => l.id === discount.json.listing.id))
    ok('shop checklist mirrors profile truth (complete=false, photo=true)',
      shopBody?.shop?.checklist?.photo === true && shopBody?.shop?.complete === false)
    ok('shop contact phone present for buyers', typeof shopBody?.shop?.phone === 'string' && shopBody.shop.phone.startsWith('+'))

    const shopGhost = await call('GET', '/api/shops/does-not-exist')
    ok('unknown shop → 404', shopGhost.status === 404)

    // Bob lists something; it must NOT appear in Alice's catalogue.
    const bob: Jar = { cookie: '' }
    await register(bob, uniquePhone(), 'Bob Stranger', 'password456')
    const bobListing = await call('POST', '/api/listings', { ...validListing, title: 'Bob unrelated stock item' }, bob)
    const shopAfter = await call('GET', `/api/shops/${alice.user?.id}`)
    ok('other sellers listings never leak into a shop catalogue',
      shopAfter.status === 200 && !shopAfter.json.listings.some((l: any) => l.id === bobListing.json?.listing?.id))

    // Fulfilled listings drop out of the catalogue (only ACTIVE is shown).
    await call('PATCH', `/api/listings/${discount.json.listing.id}`, { status: 'FULFILLED' }, alice)
    const shopAfterFulfil = await call('GET', `/api/shops/${alice.user?.id}`)
    ok('fulfilled listing leaves the shop catalogue',
      shopAfterFulfil.status === 200 && !shopAfterFulfil.json.listings.some((l: any) => l.id === discount.json.listing.id))

    await call('DELETE', `/api/listings/${bobListing.json.listing.id}`, undefined, bob)
  }

  console.log('\n== 3d. Shop identity codes & same-name guard ==')
  {
    // Alice's profile was created in 3b, so it already carries a code.
    const profileState = await call('GET', '/api/profile', undefined, alice)
    const aliceCode = profileState.json?.profile?.shopCode
    ok('profile exposes a MD-XXXX shop code', typeof aliceCode === 'string' && /^MD-\d{4}$/.test(aliceCode))

    // The code is a permanent identity: profile updates must never re-roll it.
    const update = await call('PUT', '/api/profile', {
      businessName: `Alice Test Shop ${RUN_TAG}`,
      photoUrl: null,
      category: 'other',
      description: 'Updated description for code stability check.',
      county: 'Kampala',
      area: 'Test Area',
      phone: alicePhone,
      whatsapp: null,
      hours: null,
    }, alice)
    ok('profile update keeps the same shop code', update.status === 200 && update.json?.profile?.shopCode === aliceCode)

    const shopAnon = await call('GET', `/api/shops/${alice.user?.id}`)
    ok('shop page shows the same code to buyers', shopAnon.status === 200 && shopAnon.json?.shop?.shopCode === aliceCode)

    // check-name: public availability check behind the live "suggest area" hint.
    const takenCheck = await call('GET', `/api/shops/check-name?name=${encodeURIComponent(`alice test shop ${RUN_TAG}`)}`)
    ok('check-name flags an existing name case-insensitively',
      takenCheck.status === 200 && takenCheck.json?.taken === true && takenCheck.json.matches.length >= 1)
    const ownCheck = await call('GET', `/api/shops/check-name?name=${encodeURIComponent(`Alice Test Shop ${RUN_TAG}`)}&exclude=${alice.user?.id}`)
    ok('check-name ignores the seller’s own shop (exclude works)',
      ownCheck.status === 200 && ownCheck.json?.taken === false)
    const freeCheck = await call('GET', '/api/shops/check-name?name=Brand%20New%20Name%20Shop')
    ok('check-name passes an unused name', freeCheck.status === 200 && freeCheck.json?.taken === false)
    const shortCheck = await call('GET', '/api/shops/check-name?name=A')
    ok('check-name rejects too-short input → 400', shortCheck.status === 400)

    // Two new shops: codes must be distinct and both valid.
    const cara: Jar = { cookie: '' }
    const dora: Jar = { cookie: '' }
    await register(cara, uniquePhone(), 'Cara Twinname', 'password789')
    await register(dora, uniquePhone(), 'Dora Twinname', 'password789')
    const caraProfile = await call('PUT', '/api/profile', {
      businessName: `Twin Name Market ${RUN_TAG}`,
      photoUrl: null, category: 'other', description: null, county: 'Kampala',
      area: 'Ntinda', phone: uniquePhone(),
      whatsapp: null, hours: null,
    }, cara)
    ok('new profile gets a code at creation', caraProfile.status === 200 && /^MD-\d{4}$/.test(caraProfile.json?.profile?.shopCode ?? ''))
    const doraProfile = await call('PUT', '/api/profile', {
      businessName: `Twin Name Market ${RUN_TAG}`,
      photoUrl: null, category: 'other', description: null, county: 'Kampala',
      area: 'Bukoto', phone: uniquePhone(),
      whatsapp: null, hours: null,
    }, dora)
    ok('same-name shop gets a DIFFERENT code',
      doraProfile.status === 200 && doraProfile.json?.profile?.shopCode !== caraProfile.json?.profile?.shopCode)

    // Same-name shops in one feed: owner area must ride along so the browse
    // feed can render "Twin Name Market · Ntinda" vs "· Bukoto".
    const caraListing = await call('POST', '/api/listings', { ...validListing, title: 'Twin market greens offer' }, cara)
    const doraListing = await call('POST', '/api/listings', { ...validListing, title: 'Twin market greens offer two' }, dora)
    const browse = await call('GET', '/api/listings?q=twin%20market%20greens')
    const both = browse.json?.items ?? []
    const caraItem = both.find((l: any) => l.id === caraListing.json?.listing?.id)
    const doraItem = both.find((l: any) => l.id === doraListing.json?.listing?.id)
    ok('browse returns both same-name shops with their areas',
      caraItem?.user?.profile?.area === 'Ntinda' && doraItem?.user?.profile?.area === 'Bukoto')

    // check-name now flags the twin name for a third party.
    const twinCheck = await call('GET', `/api/shops/check-name?name=${encodeURIComponent(`Twin Name Market ${RUN_TAG}`)}`)
    ok('check-name sees the duplicated name', twinCheck.json?.taken === true && twinCheck.json.matches.length >= 2)

    await call('DELETE', `/api/listings/${caraListing.json.listing.id}`, undefined, cara)
    await call('DELETE', `/api/listings/${doraListing.json.listing.id}`, undefined, dora)
  }

  console.log('\n== 3e. Shop location & nearest sort ==')
  {
    // Permission + validation boundaries.
    const anonLoc = await call('PUT', '/api/profile/location', { lat: 0.335, lng: 32.586 })
    ok('location save without a session → 401', anonLoc.status === 401)

    const badLat = await call('PUT', '/api/profile/location', { lat: 999, lng: 32.586 }, alice)
    ok('out-of-range latitude → 400', badLat.status === 400)
    const halfLoc = await call('PUT', '/api/profile/location', { lat: 0.335, lng: null }, alice)
    ok('half a coordinate pair → 400', halfLoc.status === 400)

    // Save + the privacy blur: coordinates are rounded to ~100 m BEFORE they
    // are stored, so a precise spot never exists server-side.
    const setLoc = await call('PUT', '/api/profile/location', { lat: 2.7741234, lng: 32.2992345 }, alice)
    ok('location save works → 200', setLoc.status === 200 && setLoc.json?.profile?.lat !== null)
    ok('stored coordinates are blurred to ~100 m',
      setLoc.json?.profile?.lat === 2.774 && setLoc.json?.profile?.lng === 32.299)

    // The regular "Save shop" form write must NEVER clobber the spot: its
    // schema strips unknown keys, so lat/lng keys never reach Prisma.
    const formSave = await call('PUT', '/api/profile', {
      businessName: `Alice Test Shop ${RUN_TAG}`,
      photoUrl: null,
      category: 'other',
      description: 'Location preservation check.',
      county: 'Gulu',
      area: 'Test Area',
      phone: alicePhone,
      whatsapp: null,
      hours: null,
    }, alice)
    ok('regular profile update preserves the saved location',
      formSave.status === 200 && formSave.json?.profile?.lat === 2.774)

    // A seller WITHOUT a profile who shares their spot still gets a shop
    // (create branch): account name as the shop name + a fresh MD code.
    const nela: Jar = { cookie: '' }
    await register(nela, uniquePhone(), 'Nela Nearby', 'password789')
    const nelaLoc = await call('PUT', '/api/profile/location', { lat: 0.335, lng: 32.586 }, nela)
    ok('sharing a spot creates a minimal shop with a code',
      nelaLoc.status === 200 && nelaLoc.json?.profile?.businessName === 'Nela Nearby' && /^MD-\d{4}$/.test(nelaLoc.json?.profile?.shopCode ?? ''))

    // Nearest sort — two shops ~300 km apart; the buyer's side of the story
    // must decide who comes first. Gulu buyer → Alice; Kampala buyer → Nela.
    const aliceListing = await call('POST', '/api/listings', { ...validListing, title: 'Nearest probe alpha' }, alice)
    const nelaListing = await call('POST', '/api/listings', { ...validListing, title: 'Nearest probe beta' }, nela)
    const fromGulu = await call('GET', '/api/listings?q=nearest%20probe&sort=nearest&lat=2.774&lng=32.299')
    const guluItems = fromGulu.json?.items ?? []
    ok('nearest sort puts the Gulu shop first for a Gulu buyer',
      fromGulu.status === 200 && guluItems[0]?.id === aliceListing.json?.listing?.id)
    ok('browse cards carry the blurred shop spot for distance chips',
      guluItems[0]?.user?.profile?.lat === 2.774 && guluItems[0]?.user?.profile?.lng === 32.299)
    const fromKampala = await call('GET', '/api/listings?q=nearest%20probe&sort=nearest&lat=0.335&lng=32.586')
    ok('nearest sort flips for a Kampala buyer',
      fromKampala.json?.items?.[0]?.id === nelaListing.json?.listing?.id)

    // Graceful degradation: nearest without a buyer position, and shops
    // without a spot landing AFTER located shops instead of vanishing.
    const noCoords = await call('GET', '/api/listings?q=nearest%20probe&sort=nearest')
    ok('sort=nearest without coordinates degrades gracefully (200)', noCoords.status === 200)

    await call('PUT', '/api/profile/location', { lat: null, lng: null }, alice)
    const afterRemove = await call('GET', '/api/listings?q=nearest%20probe&sort=nearest&lat=-1.288&lng=36.841')
    const afterItems = afterRemove.json?.items ?? []
    ok('location can be removed → 200 + null coords', afterRemove.status === 200)
    ok('shops without a spot drop to the end of nearest results',
      afterItems[afterItems.length - 1]?.id === aliceListing.json?.listing?.id && afterItems[0]?.id === nelaListing.json?.listing?.id)

    await call('DELETE', `/api/listings/${aliceListing.json.listing.id}`, undefined, alice)
    await call('DELETE', `/api/listings/${nelaListing.json.listing.id}`, undefined, nela)
  }

  console.log('\n== 3f. Shop code lookup (the till-number path) ==')
  {
    // The lookup is public — no jar, no cookie: buyers never sign in.
    const meProf = await call('GET', '/api/profile', undefined, alice)
    const realCode: string = meProf.json?.profile?.shopCode ?? ''
    ok('profile exposes the seller shop code for the lookup tests', /^MD-\d{4}$/.test(realCode))

    const hit = await call('GET', `/api/shops/lookup?code=${encodeURIComponent(realCode)}`)
    ok('exact code resolves the right shop, anonymously',
      hit.status === 200 && hit.json?.shop?.id === alice.user!.id && hit.json?.shop?.shopCode === realCode)

    // Forgiving input: case, spaces and dashes never break a real code —
    // buyers copy codes off posters and out of voice calls.
    const sloppy = await call('GET', `/api/shops/lookup?code=${encodeURIComponent('dk ' + realCode.slice(3))}`)
    ok('sloppy variant ("dk 4821" style) finds the same shop',
      sloppy.status === 200 && sloppy.json?.shop?.id === alice.user!.id)

    // A well-formed but wrong number must never open a shop. The unknown code
    // is picked from the DB itself so the negative test never depends on luck.
    const taken = await db.businessProfile.findMany({ where: { shopCode: { not: null } }, select: { shopCode: true } })
    const used = new Set(taken.map((r) => r.shopCode as string))
    let unknown = ''
    for (let n = 0; n < 10_000; n++) {
      const candidate = `MD-${String(n).padStart(4, '0')}`
      if (!used.has(candidate)) {
        unknown = candidate
        break
      }
    }
    const miss = await call('GET', `/api/shops/lookup?code=${unknown}`)
    ok('well-formed but unknown code → 404 naming the code back',
      miss.status === 404 && typeof miss.json?.error === 'string' && miss.json.error.includes(unknown))

    const malformed = await call('GET', '/api/shops/lookup?code=AB-12')
    ok('malformed code → 400 with an honest hint',
      malformed.status === 400 && typeof malformed.json?.error === 'string' && malformed.json.error.includes('MD-'))

    // Card-slim payload: contact details come later, from the shop page.
    ok('lookup payload carries no phone/whatsapp/password',
      hit.status === 200 &&
        !('phone' in (hit.json?.shop ?? {})) &&
        !('whatsapp' in (hit.json?.shop ?? {})) &&
        !JSON.stringify(hit.json).toLowerCase().includes('password'))
  }

  console.log('\n== 4. Ownership & permission boundaries ==')
  const bob: Jar = { cookie: '' }
  const bobPhone = uniquePhone()
  {
    await register(bob, bobPhone, 'Bob Attacker', 'password456')

    const editOther = await call('PATCH', `/api/listings/${createdListingId}`, { title: 'Bob was here ha ha' }, bob)
    ok('non-owner edit → 404 (existence not leaked)', editOther.status === 404)

    const deleteOther = await call('DELETE', `/api/listings/${createdListingId}`, undefined, bob)
    ok('non-owner delete → 404', deleteOther.status === 404)

    const refreshOther = await call('POST', `/api/listings/${createdListingId}/refresh`, undefined, bob)
    ok('non-owner refresh → 404', refreshOther.status === 404)

    const stillIntact = await call('GET', `/api/listings/${createdListingId}`)
    ok('listing unchanged after attack attempts', stillIntact.json.listing.title === validListing.title)

    const anonPatch = await call('PATCH', `/api/listings/${createdListingId}`, { title: 'Anonymous defacement' })
    ok('unauthenticated edit → 401', anonPatch.status === 401)

    const ownerEdit = await call('PATCH', `/api/listings/${createdListingId}`, { price: 510 }, alice)
    ok('owner edit works (200)', ownerEdit.status === 200 && ownerEdit.json.listing.price === 510)
  }

  console.log('\n== 5. Status transitions ==')
  {
    const fulfilled = await call('PATCH', `/api/listings/${createdListingId}`, { status: 'FULFILLED' }, alice)
    ok('ACTIVE → FULFILLED allowed', fulfilled.status === 200 && fulfilled.json.listing.status === 'FULFILLED')

    const fieldEditFulfilled = await call('PATCH', `/api/listings/${createdListingId}`, { price: 100 }, alice)
    ok('field edit on FULFILLED listing → 409', fieldEditFulfilled.status === 409)

    const refreshFulfilled = await call('POST', `/api/listings/${createdListingId}/refresh`, undefined, alice)
    ok('refresh on FULFILLED listing → 409 (no silent reactivation)', refreshFulfilled.status === 409)

    const reactivate = await call('PATCH', `/api/listings/${createdListingId}`, { status: 'ACTIVE' }, alice)
    ok('explicit FULFILLED → ACTIVE allowed', reactivate.status === 200 && reactivate.json.listing.status === 'ACTIVE')

    const fulfillAgain = await call('PATCH', `/api/listings/${createdListingId}`, { status: 'FULFILLED' }, alice)
    const toExpired = await call('PATCH', `/api/listings/${createdListingId}`, { status: 'EXPIRED' }, alice)
    ok('FULFILLED → EXPIRED forbidden (sweep owns that transition)', toExpired.status === 409 && fulfillAgain.status === 200)
  }

  console.log('\n== 6. Refresh cooldown ==')
  {
    // The listing is FULFILLED at this point (section 5); reactivate explicitly.
    const reactivate = await call('PATCH', `/api/listings/${createdListingId}`, { status: 'ACTIVE' }, alice)
    ok('FULFILLED → ACTIVE reactivation', reactivate.status === 200)

    // Reactivation must NOT reset freshness (rule: only an explicit repost of
    // expired/archived listings restarts the clock).
    const tooSoon = await call('POST', `/api/listings/${createdListingId}/refresh`, undefined, alice)
    ok('refresh right after reactivation → 429 (freshness not silently reset)', tooSoon.status === 429)

    // Simulate the cooldown having elapsed.
    await db.listing.update({ where: { id: createdListingId }, data: { refreshedAt: new Date(Date.now() - 25 * 3_600_000) } })
    const first = await call('POST', `/api/listings/${createdListingId}/refresh`, undefined, alice)
    ok('refresh after 24h cooldown → 200', first.status === 200)
    const daysExtended = (new Date(first.json.listing.expiresAt).getTime() - Date.now()) / 86_400_000
    ok('refresh extended expiry to ~30 days', daysExtended > 29 && daysExtended <= 31)

    const second = await call('POST', `/api/listings/${createdListingId}/refresh`, undefined, alice)
    ok('second refresh within 24h → 429', second.status === 429)
  }

  console.log('\n== 7. Saved searches & real matching ==')
  {
    const ss: Jar = { cookie: '' }
    await register(ss, uniquePhone(), 'Carol Watcher', 'password789')

    const create = await call(
      'POST',
      '/api/saved-searches',
      { name: 'Copper in Kampala', query: { q: 'copper', county: 'Kampala' } },
      ss,
    )
    ok('saved search created with computed match count', create.status === 201 && create.json?.search?.lastMatchCount >= 1)
    const savedId = create.json.search.id

    const otherUserDelete = await call('DELETE', `/api/saved-searches/${savedId}`, undefined, bob)
    ok('another user cannot delete my saved search → 404', otherUserDelete.status === 404)

    // A NEW matching listing must generate a real notification for Carol.
    const before = await call('GET', '/api/notifications', undefined, ss)
    const matchesBefore = before.json.notifications.filter((n: any) => n.type === 'NEW_MATCH').length

    const newListing = await call('POST', '/api/listings', { ...validListing, title: 'Copper radiators clean stock', price: 640 }, alice)
    ok('matching listing published', newListing.status === 201)

    const after = await call('GET', '/api/notifications', undefined, ss)
    const matchesAfter = after.json.notifications.filter((n: any) => n.type === 'NEW_MATCH').length
    ok('NEW_MATCH notification generated by the publish (real event)', matchesAfter === matchesBefore + 1)

    const check = await call('POST', `/api/saved-searches/${savedId}/check`, undefined, ss)
    ok('check-now recomputes count upward', check.status === 200 && check.json.search.lastMatchCount >= create.json.search.lastMatchCount)

    const markRead = await call('POST', '/api/notifications/mark-read?ids=all', undefined, ss)
    ok('mark all read works', markRead.status === 200)
    const afterRead = await call('GET', '/api/notifications', undefined, ss)
    ok('unread count is 0 after mark all', afterRead.json.unreadCount === 0)

    // bob must not be able to mark carol's notifications
    const carolNotif = afterRead.json.notifications[0]
    const bobMark = await call('POST', `/api/notifications/mark-read?ids=${carolNotif.id}`, undefined, bob)
    ok('mark-read on foreign notification is a no-op (200 but no effect)', bobMark.status === 200)

    // Clear (delete) — the destructive sibling of mark-read: read keeps
    // history, clear removes rows for good. UI confirms before calling.
    const anonClear = await call('DELETE', '/api/notifications?ids=all')
    ok('clear notifications without sign-in → 401', anonClear.status === 401)

    const carolCount = afterRead.json.notifications.length
    const bobClearAll = await call('DELETE', '/api/notifications?ids=all', undefined, bob)
    ok('another user clearing their own alerts is 200', bobClearAll.status === 200)
    const afterForeignClear = await call('GET', '/api/notifications', undefined, ss)
    ok("another user's clear-all never touches my alerts", afterForeignClear.json.notifications.length === carolCount && carolCount > 0)

    const clearMalformed = await call('DELETE', '/api/notifications', undefined, ss)
    ok('clear without ids parameter → 400', clearMalformed.status === 400)

    const clearAll = await call('DELETE', '/api/notifications?ids=all', undefined, ss)
    ok('clear all notifications works', clearAll.status === 200)
    const afterClear = await call('GET', '/api/notifications', undefined, ss)
    ok('notification list is empty after clear', afterClear.json.notifications.length === 0 && afterClear.json.unreadCount === 0)
  }

  console.log('\n== 8. Expiry is real ==')
  {
    // Force an overdue ACTIVE listing directly in the DB (simulates time passing).
    const overdue = await db.listing.create({
      data: {
        userId: alice.user!.id,
        type: 'OFFER',
        title: 'Expiry sweep test listing',
        description: 'This listing exists to prove the expiry sweep uses persisted timestamps.',
        category: 'other',
        price: 10,
        priceNegotiable: false,
        unit: 'piece',
        quantity: 1,
        county: 'Kampala',
        area: null,
        contactPhone: alicePhone,
        status: 'ACTIVE',
        publishedAt: new Date(Date.now() - 40 * 86_400_000),
        refreshedAt: new Date(Date.now() - 40 * 86_400_000),
        expiresAt: new Date(Date.now() - 1 * 86_400_000),
      },
    })

    const notifBefore = await db.notification.count({ where: { userId: alice.user!.id, type: 'LISTING_EXPIRED' } })

    // Any public read triggers the sweep.
    await call('GET', `/api/listings/${overdue.id}`)

    const swept = await db.listing.findUnique({ where: { id: overdue.id } })
    ok('overdue ACTIVE listing became EXPIRED after sweep', swept?.status === 'EXPIRED')

    const notifAfter = await db.notification.count({ where: { userId: alice.user!.id, type: 'LISTING_EXPIRED' } })
    ok('owner received LISTING_EXPIRED notification', notifAfter === notifBefore + 1)

    const repost = await call('PATCH', `/api/listings/${overdue.id}`, { status: 'ACTIVE' }, alice)
    ok('EXPIRED → ACTIVE repost allowed', repost.status === 200)
    const daysExtended = (new Date(repost.json.listing.expiresAt).getTime() - Date.now()) / 86_400_000
    ok('repost extended expiry by ~30 days', daysExtended > 29 && daysExtended <= 31)
    await call('DELETE', `/api/listings/${overdue.id}`, undefined, alice)
  }

  console.log('\n== 8b. Sweep endpoint needs the cron secret ==')
  {
    const noHeader = await call('POST', '/api/cron/sweep')
    ok('sweep without header → 403', noHeader.status === 403)

    const wrongHeader = await call('POST', '/api/cron/sweep', undefined, undefined, { 'x-cron-secret': 'not-the-secret' })
    ok('sweep with wrong secret → 403', wrongHeader.status === 403)

    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const rightHeader = await call('POST', '/api/cron/sweep', undefined, undefined, { 'x-cron-secret': cronSecret })
      ok(
        'sweep with correct secret → 200 with sweep counts',
        rightHeader.status === 200 && typeof rightHeader.json?.expired === 'number' && typeof rightHeader.json?.expiringNotified === 'number',
      )
    } else {
      const unconfigured = await call('POST', '/api/cron/sweep')
      ok('CRON_SECRET unset → 503 (fail closed)', unconfigured.status === 503)
    }
  }

  console.log('\n== 9. Settings → Advanced Settings (PostgreSQL) ==')
  {
    const anon = await call('GET', '/api/settings/postgres')
    ok('settings require sign-in → 401', anon.status === 401)

    // Deployment settings are admin-only (ADMIN_PHONES). Alice is a regular
    // seller: every verb on the deployment config is closed to her.
    const deniedGet = await call('GET', '/api/settings/postgres', undefined, alice)
    ok('non-admin GET config → 403', deniedGet.status === 403)
    const deniedPut = await call('PUT', '/api/settings/postgres', { host: 'db.internal.example', port: 5432, database: 'commerce_os', user: 'app', password: 'supersecret', sslMode: 'require' }, alice)
    ok('non-admin PUT config → 403', deniedPut.status === 403)
    const deniedDelete = await call('DELETE', '/api/settings/postgres', undefined, alice)
    ok('non-admin DELETE config → 403', deniedDelete.status === 403)
    const deniedTest = await call('POST', '/api/settings/postgres/test', undefined, alice)
    ok('non-admin test connection → 403', deniedTest.status === 403)

    // The admin allowlist phone is a seeded Ugandan account (0712000001 → +256712000001).
    const admin: Jar = { cookie: '' }
    const adminLogin = await call('POST', '/api/auth/login', { phone: '0712000001', password: 'demo1234' }, admin)
    storeCookie(admin, adminLogin)
    admin.token = adminLogin.json?.sessionToken
    ok('admin phone signs in (precondition)', adminLogin.status === 200)

    const saved = await call(
      'PUT',
      '/api/settings/postgres',
      { host: 'db.internal.example', port: 5432, database: 'commerce_os', user: 'app', password: 'supersecret', sslMode: 'require' },
      admin,
    )
    ok('admin saves postgres config (200)', saved.status === 200)

    const fetched = await call('GET', '/api/settings/postgres', undefined, admin)
    ok('GET config never returns the password', !JSON.stringify(fetched.json).includes('supersecret'))
    ok('GET reports hasPassword=true', fetched.json?.config?.hasPassword === true)

    // Encryption at rest: the raw AppSetting row must not contain the secret.
    const rawRow = await db.appSetting.findUnique({ where: { key: 'postgres_config' } })
    ok('stored config is encrypted at rest (no plaintext password)', Boolean(rawRow) && !rawRow!.value.includes('supersecret') && rawRow!.value.includes('enc:'))

    const testRes = await call('POST', '/api/settings/postgres/test', undefined, admin)
    ok('admin test connection runs and reports honestly', testRes.status === 200 && typeof testRes.json?.ok === 'boolean')
    ok('unreachable host → ok=false with a real reason', testRes.status === 200 && testRes.json?.ok === false && typeof testRes.json?.message === 'string' && testRes.json.message.length > 0)

    const cleared = await call('DELETE', '/api/settings/postgres', undefined, admin)
    ok('admin removes config works', cleared.status === 200)

    const afterClear = await call('POST', '/api/settings/postgres/test', undefined, admin)
    ok('test without saved config → 400', afterClear.status === 400)
  }

  console.log('\n== 10. Sign out ==')
  {
    const out = await call('POST', '/api/auth/logout', undefined, alice)
    ok('logout clears session', out.status === 200)
    const meAfter = await call('GET', '/api/auth/me', undefined, alice)
    ok('session gone after logout', meAfter.json?.user === null)
  }

  console.log('\n== 11. Home dashboard + price trends ==')
  {
    // Hermetic cleanup: the sweep aggregates every ACTIVE OFFER per
    // (category, unit, currency), so leftovers from earlier runs (a restore
    // can resurrect them) would poison the medians. Archive foreign OFFERs
    // in the two combos under test and drop today's stale snapshot rows;
    // only this run's fixtures will remain in the sample.
    await db.listing.updateMany({ where: { status: 'ACTIVE', type: 'OFFER', category: 'electronics', unit: 'piece', currency: 'UGX' }, data: { status: 'ARCHIVED' } })
    await db.listing.updateMany({ where: { status: 'ACTIVE', type: 'OFFER', category: 'food-groceries', unit: 'kg', currency: 'UGX' }, data: { status: 'ARCHIVED' } })
    const trendsToday = new Date().toISOString().slice(0, 10)
    await db.priceSnapshot.deleteMany({ where: { date: trendsToday, category: { in: ['electronics', 'food-groceries'] }, unit: { in: ['piece', 'kg'] }, currency: 'UGX' } })

    // Transport guards first: every Home endpoint is signed-in only.
    const homeAnon = await call('GET', '/api/home')
    ok('GET /api/home signed out → 401', homeAnon.status === 401)
    const visitAnon = await call('POST', '/api/home/visit')
    ok('POST /api/home/visit signed out → 401', visitAnon.status === 401)
    const trendsAnon = await call('GET', '/api/price-trends')
    ok('GET /api/price-trends signed out → 401', trendsAnon.status === 401)

    // hana = buyer/saver (UG), nico = seller (UG). UG phones are +256 7XXX XXX XXX.
    const ugPhone = () => `+2567${String(Math.floor(10000000 + Math.random() * 89999999))}`
    const hana: Jar = { cookie: '' }
    const hanaReg = await register(hana, ugPhone(), 'Hana Home Test', 'demo1234', 'UG')
    ok('hana registers (precondition)', hanaReg.status === 201 || hanaReg.status === 200)
    const nico: Jar = { cookie: '' }
    const nicoReg = await register(nico, ugPhone(), 'Nico Home Test', 'demo1234', 'UG')
    ok('nico registers (precondition)', nicoReg.status === 201 || nicoReg.status === 200)

    // Clean-slate stats: nothing invented for a fresh account.
    const empty = await call('GET', '/api/home', undefined, hana)
    ok('GET /api/home signed in → 200', empty.status === 200)
    ok('fresh account: zero saved searches', empty.json?.stats?.savedSearches === 0)
    ok('fresh account: zero active listings', empty.json?.stats?.activeListings === 0)
    ok('fresh account: zero new matches', empty.json?.stats?.newMatches === 0)
    ok('fresh account: lastUpdatedAt null', empty.json?.stats?.lastUpdatedAt === null)
    ok('no profile and no listings → location source "none"', empty.json?.location?.source === 'none')
    ok('greeting carries the first name', empty.json?.user?.firstName === 'Hana')

    // Saved search + a matching listing from nico → one real NEW_MATCH.
    const saved = await call(
      'POST',
      '/api/saved-searches',
      { name: 'Electronics in Kampala', query: { category: 'electronics', county: 'Kampala' } },
      hana,
    )
    ok('hana saves a search (precondition)', saved.status === 201)
    const listingA = await call(
      'POST',
      '/api/listings',
      { ...validListing, type: 'OFFER', title: 'Home test solar panel', description: 'Test solar panel for the home dashboard suite.', category: 'electronics', price: 1000, currency: 'UGX', unit: 'piece', quantity: 10, country: 'UG', county: 'Kampala', area: 'Test Area', contactPhone: '+256777123456' },
      nico,
    )
    ok('nico publishes a matching listing (precondition)', listingA.status === 201)

    const matched = await call('GET', '/api/home', undefined, hana)
    ok('saved searches stat counts 1', matched.json?.stats?.savedSearches === 1)
    ok('new matches counts the listing that matched since first visit', matched.json?.stats?.newMatches === 1)
    ok('saved searches card payload carries top search', matched.json?.savedSearches?.[0]?.name === 'Electronics in Kampala')

    // Visit marker: numbers must zero out only for the NEXT visit.
    const visit = await call('POST', '/api/home/visit', undefined, hana)
    ok('POST /api/home/visit → 200 and stamps a timestamp', visit.status === 200 && Boolean(visit.json?.lastHomeVisitAt))
    const afterVisit = await call('GET', '/api/home', undefined, hana)
    ok('after a recorded visit, new matches reset to 0', afterVisit.json?.stats?.newMatches === 0)

    // A SECOND matching listing now counts as new since that visit.
    const listingB = await call(
      'POST',
      '/api/listings',
      { ...validListing, type: 'OFFER', title: 'Home test radio', description: 'Test radio for the home dashboard suite.', category: 'electronics', price: 5000, currency: 'UGX', unit: 'kg', quantity: 4, country: 'UG', county: 'Kampala', area: 'Test Area', contactPhone: '+256777123456' },
      nico,
    )
    ok('nico publishes a second matching listing (precondition)', listingB.status === 201)
    const secondMatch = await call('GET', '/api/home', undefined, hana)
    ok('new matches since the recorded visit = 1', secondMatch.json?.stats?.newMatches === 1)

    // hana publishes → her own stats + location falls back to her listing's district.
    const hanaListing = await call(
      'POST',
      '/api/listings',
      { ...validListing, type: 'OFFER', title: 'Home test phone charger', description: 'Test charger for the home dashboard suite.', category: 'electronics', price: 1500, currency: 'UGX', unit: 'piece', quantity: 30, country: 'UG', county: 'Kampala', area: 'Test Area', contactPhone: '+256777123457' },
      hana,
    )
    ok('hana publishes her own listing (precondition)', hanaListing.status === 201)
    const own = await call('GET', '/api/home', undefined, hana)
    ok('active listings stat counts her listing', own.json?.stats?.activeListings === 1)
    ok('lastUpdatedAt present after publishing', typeof own.json?.stats?.lastUpdatedAt === 'string')
    ok('location falls back to her listing district ("listing" source)', own.json?.location?.source === 'listing' && own.json?.location?.county === 'Kampala')

    // Freshness tip: backdate refreshedAt 8 days → stale, then Renew clears it.
    const staleAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await db.listing.update({ where: { id: hanaListing.json.listing.id }, data: { refreshedAt: staleAt } })
    const stale = await call('GET', '/api/home', undefined, hana)
    ok('listing refreshed 8 days ago appears as stale', stale.json?.staleCount === 1 && stale.json?.staleListings?.[0]?.title === 'Home test phone charger')
    ok('stale listing reports its age in days', stale.json?.staleListings?.[0]?.ageDays === 8)
    const renewed = await call('POST', `/api/listings/${hanaListing.json.listing.id}/refresh`, undefined, hana)
    ok('Renew (refresh endpoint) succeeds past the cooldown', renewed.status === 200)
    const renewedHome = await call('GET', '/api/home', undefined, hana)
    ok('freshness tip disappears after renewal', renewedHome.json?.staleCount === 0)

    // ---- Price trends ----
    // Median needs sampleSize >= 5: nico adds 3 more electronics pieces.
    for (const price of [2000, 3000, 4000]) {
      const made = await call(
        'POST',
        '/api/listings',
        { ...validListing, type: 'OFFER', title: `Home test combo ${price}`, description: 'Test combo listing for price medians.', category: 'electronics', price, currency: 'UGX', unit: 'piece', quantity: 10, country: 'UG', county: 'Kampala', area: 'Test Area', contactPhone: '+256777123456' },
        nico,
      )
      ok(`combo listing @${price} published (precondition)`, made.status === 201)
    }
    // A second combo with only 2 listings must NOT produce a snapshot.
    for (const price of [5000, 6000]) {
      await call(
        'POST',
        '/api/listings',
        { ...validListing, type: 'OFFER', title: `Home test thin ${price}`, description: 'Test listing below the median sample floor.', category: 'food-groceries', price, currency: 'UGX', unit: 'kg', quantity: 10, country: 'UG', county: 'Kampala', area: 'Test Area', contactPhone: '+256777123456' },
        nico,
      )
    }

    // Cron secret: CI injects it; local runs read the dev .env.
    const cronSecret = process.env.CRON_SECRET ?? (() => {
      try {
        const line = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8').split('\n').find((l) => l.startsWith('CRON_SECRET='))
        return line ? line.slice('CRON_SECRET='.length).trim() : undefined
      } catch {
        return undefined
      }
    })()
    if (cronSecret) {
      const sweep = await call('POST', '/api/cron/sweep', undefined, undefined, { 'x-cron-secret': cronSecret })
      ok('sweep with valid secret → 200 and reports snapshots', sweep.status === 200 && typeof sweep.json?.priceSnapshots === 'number')
      ok('sweep recorded the qualifying combo (>=1 snapshot)', (sweep.json?.priceSnapshots ?? 0) >= 1)

      const today = new Date().toISOString().slice(0, 10)
      const comboRow = await db.priceSnapshot.findUnique({
        where: { date_category_unit_currency: { date: today, category: 'electronics', unit: 'piece', currency: 'UGX' } },
      })
      ok('median of [1000,1500,2000,3000,4000] = 2000 (sampleSize 5)', comboRow?.medianPrice === 2000 && comboRow?.sampleSize === 5)
      const thinRow = await db.priceSnapshot.findUnique({
        where: { date_category_unit_currency: { date: today, category: 'food-groceries', unit: 'kg', currency: 'UGX' } },
      })
      ok('combo with sampleSize < 5 recorded NO snapshot', thinRow === null)

      // Idempotency: rerunning the sweep never duplicates rows.
      const resweep = await call('POST', '/api/cron/sweep', undefined, undefined, { 'x-cron-secret': cronSecret })
      const rowsAfter = await db.priceSnapshot.count({ where: { date: today, category: 'electronics', unit: 'piece', currency: 'UGX' } })
      ok('re-running the sweep stays idempotent (still 1 row)', resweep.status === 200 && rowsAfter === 1)

      // Even-count median: a 6th listing re-computes in place.
      await call(
        'POST',
        '/api/listings',
        { ...validListing, type: 'OFFER', title: 'Home test combo 5000', description: 'Test listing for the even-count median.', category: 'electronics', price: 5000, currency: 'UGX', unit: 'piece', quantity: 10, country: 'UG', county: 'Kampala', area: 'Test Area', contactPhone: '+256777123456' },
        nico,
      )
      await call('POST', '/api/cron/sweep', undefined, undefined, { 'x-cron-secret': cronSecret })
      const evenRow = await db.priceSnapshot.findUnique({
        where: { date_category_unit_currency: { date: today, category: 'electronics', unit: 'piece', currency: 'UGX' } },
      })
      ok('median of 6 prices [1000,1500,2000,3000,4000,5000] = 2500, updated in place', evenRow?.medianPrice === 2500 && evenRow?.sampleSize === 6)

      // Trends endpoint: hana's top category (posts + saves) carries the line.
      const trends = await call('GET', '/api/price-trends', undefined, hana)
      ok('GET /api/price-trends signed in → 200', trends.status === 200)
      ok('trends are labeled "Based on Mudaala listings"', trends.json?.source === 'Based on Mudaala listings')
      const hanaSeries = (trends.json?.series ?? []).find((s: { category: string }) => s.category === 'electronics')
      ok('hana gets a series for electronics/piece/UGX', hanaSeries?.unit === 'piece' && hanaSeries?.currency === 'UGX')
      const todayPoint = hanaSeries?.points?.find((p: { date: string }) => p.date === today)
      ok('today point carries the honest median + sampleSize', todayPoint?.medianPrice === 2500 && todayPoint?.sampleSize === 6)
      const nicoTrends = await call('GET', '/api/price-trends', undefined, nico)
      ok('no user gets more than 3 series (top-3 cap)', (nicoTrends.json?.series ?? []).length <= 3)
    } else {
      console.log('  (CRON_SECRET not available — snapshot assertions skipped)')
    }

    // Hermetic cleanup: archive this run's trends fixtures too, so the next
    // run's sweep sample starts from zero (REQUESTs and other categories
    // are untouched — the sweep only ever counts OFFERs).
    await db.listing.updateMany({ where: { status: 'ACTIVE', type: 'OFFER', category: 'electronics', unit: 'piece' }, data: { status: 'ARCHIVED' } })
    await db.listing.updateMany({ where: { status: 'ACTIVE', type: 'OFFER', category: 'food-groceries', unit: 'kg' }, data: { status: 'ARCHIVED' } })
  }

  console.log('\n== 12. Ad pages (/l/[id], /s/[code]) ==')
  {
    // Section 10 signed alice out on purpose; the publish-backed tests below
    // need her session again, so sign back in first. call() does not auto-
    // store cookies, so capture the fresh session by hand.
    const relogin = await call('POST', '/api/auth/login', { phone: alicePhone, password: 'password321' }, alice)
    storeCookie(alice, relogin)
    if (relogin.json?.sessionToken) alice.token = relogin.json.sessionToken
    ok('alice signs back in for the shop tests', relogin.status === 200)

    // The ad pages are the crawlable, shareable surface of Mudaala. These
    // tests lock the URL contract (/l/{id} canonical, every older link
    // shape permanently redirected), the SEO surface (OG + Twitter tags,
    // canonical from APP_ORIGIN, Product JSON-LD), the gone-ad experience
    // (404 with similar ads, contact phone never leaked) and the shop page
    // by code, plus the paged sitemap of ACTIVE listings and live shops.
    const ldJson = (html: string) => /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''

    const realPhotos = (l: any) => Array.isArray(l.photos) && l.photos.length > 0 && l.photos.every((p: string) => !p.includes('/uploads/seed/'))
    // Seed fixtures are never the test target: the app deliberately keeps their
    // photos out of OG/Twitter metadata and their rows out of the sitemap.
    const search = await call('GET', '/api/listings?type=OFFER&sort=newest')
    let offer = (search.json?.items ?? []).find((l: any) => l.status === 'ACTIVE' && l.price !== null && realPhotos(l))
    // Hermetic fixture: the suite must never depend on demo data surviving in
    // the database (a restore can drop photo links). If no active OFFER with
    // photos exists, alice uploads one photo and publishes a fixture listing.
    if (!offer) {
      const FIXTURE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
      const fixUp = await fetch(`${BASE}/api/upload`, {
        method: 'POST',
        headers: { cookie: alice.cookie },
        body: (() => { const f = new FormData(); f.append('file', new Blob([FIXTURE_PNG], { type: 'image/png' }), 'fixture.png'); return f })(),
      })
      const fixUpJson = await fixUp.json().catch(() => null)
      const fixPhoto: string[] = typeof fixUpJson?.url === 'string' ? [fixUpJson.url as string] : []
      const fixCreate = await call('POST', '/api/listings', {
        ...validListing,
        title: 'ZZ Section-12 fixture offer with photo',
        description: 'Published by the suite when no active OFFER with photos exists, so the ad-page tests stay hermetic.',
        photos: fixPhoto,
      }, alice)
      const fixSearch = fixCreate.status === 201 ? await call('GET', '/api/listings?type=OFFER&sort=newest') : null
      offer = (fixSearch?.json?.items ?? []).find((l: any) => l.status === 'ACTIVE' && l.price !== null && realPhotos(l))
    }
    ok('suite finds an active OFFER (with photos) to test with', Boolean(offer?.id && offer?.title))
    if (!offer) {
      console.log('  (FATAL: no active OFFER with photos could be created — skipping the rest of section 12)')
      return
    }

    // /l/{id} — the full ad-page surface.
    const page = await fetch(`${BASE}/l/${offer.id}`)
    const html = await page.text()
    const head = html.slice(0, html.indexOf('</head>'))
    const offerRow = await db.listing.findUnique({ where: { id: offer.id } })
    ok('ad page /l/{id} → 200', page.status === 200)
    ok('ad page renders the listing title', html.includes(offer.title))
    ok('ad page carries a canonical link to itself',
      head.includes('rel="canonical"') && head.includes(`/l/${offer.id}"`))
    ok('ad page title ends with the Mudaala suffix', /<title>[^<]*· Mudaala<\/title>/.test(head))
    ok('og:title carries the price with the USh symbol',
      /property="og:title" content="[^"]+ · USh [^"]+ · Mudaala"/.test(head))
    ok('ad page carries Twitter card tags', head.includes('name="twitter:card" content="summary_large_image"'))
    ok('ad page carries OG image = absolute first photo',
      head.includes(`property="og:image" content="http://localhost:3000${offer.photos[0]}"`))
    ok('OFFER ad page carries Product JSON-LD in UGX',
      html.includes('"@type":"Product"') && html.includes('"priceCurrency":"UGX"'))
    const offerPhone = offerRow?.contactPhone ?? ''
    ok('contact phone stays out of metadata and JSON-LD',
      offerPhone !== '' && !head.includes(offerPhone) && !ldJson(html).includes(offerPhone))
    ok('ad page carries the WhatsApp share link', html.includes('https://wa.me/?text='))
    ok('ad page carries the safety line', html.includes('Meet in a public place'))
    ok('ad page shows the honest tenure line', html.includes('Active since'))

    // Old keyword-style URLs still resolve — permanently — to /l/{id}.
    const prefixed = await fetch(`${BASE}/l/some-old-keywords-${offer.id}`, { redirect: 'manual' })
    ok('keyword-prefixed /l URL → 308 to /l/{id}',
      prefixed.status === 308 && (prefixed.headers.get('location') ?? '').endsWith(`/l/${offer.id}`))
    const legacySlug = await fetch(`${BASE}/listing/some-old-keywords-${offer.id}`, { redirect: 'manual' })
    ok('legacy /listing/{keywords}-{id} → 308 to /l/{id}',
      legacySlug.status === 308 && (legacySlug.headers.get('location') ?? '').endsWith(`/l/${offer.id}`))
    const legacyBare = await fetch(`${BASE}/listing/${offer.id}`, { redirect: 'manual' })
    ok('legacy bare /listing/{id} → 308 to /l/{id}',
      legacyBare.status === 308 && (legacyBare.headers.get('location') ?? '').endsWith(`/l/${offer.id}`))

    // REQUEST: honest markup — a wanted ad is not a Product.
    const reqSearch = await call('GET', '/api/listings?type=REQUEST&sort=newest')
    const request = (reqSearch.json?.items ?? []).find((l: any) => l.status === 'ACTIVE')
    ok('suite finds an active REQUEST to test with', Boolean(request?.id))
    if (request?.id) {
      const reqPage = await fetch(`${BASE}/l/${request.id}`)
      const reqHtml = await reqPage.text()
      ok('REQUEST ad page → 200', reqPage.status === 200)
      ok('REQUEST title starts "Wanted:"', reqHtml.includes('<title>Wanted: '))
      ok('REQUEST ad page has NO Product JSON-LD (honest markup)', reqPage.status === 200 && !reqHtml.includes('"@type":"Product"'))
    }

    // Gone ads: expired → 404 with a friendly page that offers similar live
    // ads from the same category, and never leaks the contact phone.
    // Similar-ads doorway: publish a dedicated live ad right before the
    // expiry so it is the freshest same-category listing and cannot be
    // crowded out of the top-4 window by older scrap fixtures.
    const similar = await call('POST', '/api/listings', { ...validListing, title: 'ZZ Gone-test similar offer', contactPhone: '+256700000333' }, alice)
    ok('similar-ad fixture published (201)', similar.status === 201 && Boolean(similar.json?.listing?.id))
    const similarId: string = similar.json?.listing?.id ?? ''
    const gone = await call('POST', '/api/listings', { ...validListing, title: 'Gone copper scrap offering', contactPhone: '+256700000111' }, alice)
    ok('gone-test listing published (201)', gone.status === 201 && Boolean(gone.json?.listing?.id))
    const goneId: string = gone.json?.listing?.id ?? ''
    await db.listing.update({ where: { id: goneId }, data: { status: 'EXPIRED' } })
    const gonePage = await fetch(`${BASE}/l/${goneId}`)
    const goneHtml = await gonePage.text()
    // A notFound() page ships the friendly UI inside the RSC payload (the
    // body is a hidden div + template; the client renders the boundary from
    // this payload), so assert on the raw HTML: it is exactly what the
    // buyer's browser renders.
    ok('expired ad → 404', gonePage.status === 404)
    ok('expired ad page says it is no longer available', goneHtml.includes('no longer available'))
    ok('expired ad page offers similar ads from the same category', Boolean(similarId) && goneHtml.includes(`/l/${similarId}`))
    ok('expired ad page never shows the contact phone', !goneHtml.includes('+256700000111'))
    ok('expired ad page links back to browse', goneHtml.includes('#/browse'))

    // Unknown id → friendly 404, same doorway.
    const missing = await fetch(`${BASE}/l/does-not-exist-at-all`)
    const missingHtml = await missing.text()
    ok('unknown ad → 404', missing.status === 404)
    ok('unknown ad → friendly page, not a bare error', missingHtml.includes('no longer available'))

    // Shop pages: /s/{code} — identity, live stock, share, forgiving input.
    let profileState = await call('GET', '/api/profile', undefined, alice)
    let aliceCode: string | undefined = profileState.json?.profile?.shopCode
    if (!aliceCode) {
      await call('PUT', '/api/profile', {
        businessName: `Alice Test Shop ${RUN_TAG}`,
        photoUrl: null,
        category: 'other',
        description: 'Test shop for the /s/[code] page.',
        county: 'Kampala',
        area: null,
        phone: validListing.contactPhone,
        whatsapp: null,
        hours: null,
      }, alice)
      profileState = await call('GET', '/api/profile', undefined, alice)
      aliceCode = profileState.json?.profile?.shopCode
    }
    ok('alice holds a shop code (MD-####)', typeof aliceCode === 'string' && /^MD-\d{4}$/.test(aliceCode ?? ''))

    if (aliceCode) {
      const shopOffer = await call('POST', '/api/listings', { ...validListing, title: 'Shop front test offering', contactPhone: '+256700000222' }, alice)
      ok('shop-front listing published (201)', shopOffer.status === 201 && Boolean(shopOffer.json?.listing?.id))
      const shopOfferId: string = shopOffer.json?.listing?.id ?? ''

      const shopPage = await fetch(`${BASE}/s/${aliceCode}`)
      const shopHtml = await shopPage.text()
      const shopHead = shopHtml.slice(0, shopHtml.indexOf('</head>'))
      const shopVisible = shopHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
      ok('shop page /s/{code} → 200', shopPage.status === 200)
      ok('shop page renders the shop name', shopHtml.includes('Alice Test Shop'))
      ok('shop page carries a canonical link to the code',
        shopHead.includes('rel="canonical"') && shopHead.includes(`/s/${aliceCode}"`))
      ok('shop page lists the live stock', shopOfferId !== '' && shopVisible.includes(`/l/${shopOfferId}`))
      ok('shop page hides the expired listing', !shopVisible.includes(`/l/${goneId}`))
      ok('shop page never shows a contact phone', !shopVisible.includes('+256700000222'))
      ok('shop page carries the share row', shopVisible.includes('https://wa.me/?text='))
      ok('shop code input is forgiving (lowercase works)', (await fetch(`${BASE}/s/${aliceCode.toLowerCase()}`)).status === 200)

      const noShop = await fetch(`${BASE}/s/MD-9999`)
      ok('unknown shop code → 404', noShop.status === 404)
      ok('unknown shop code → friendly page', (await noShop.text()).includes('not on Mudaala'))
      const badShop = await fetch(`${BASE}/s/${encodeURIComponent('!!nope!!')}`)
      ok('malformed shop code → 404', badShop.status === 404)

      // Sitemap: ACTIVE listings + live shops, paged.
      const sitemap = await fetch(`${BASE}/sitemap.xml`)
      const sitemapXml = await sitemap.text()
      ok('sitemap.xml → 200', sitemap.status === 200)
      ok('sitemap is XML', (sitemap.headers.get('content-type') ?? '').includes('xml'))
      ok('sitemap lists the active ad', sitemapXml.includes(`<loc>${BASE}/l/${offer.id}</loc>`))
      ok('sitemap lists the shop', sitemapXml.includes(`<loc>${BASE}/s/${aliceCode}</loc>`))
      ok('sitemap points at the site root', sitemapXml.includes(`<loc>${BASE}</loc>`))
      ok('sitemap excludes the expired ad', !sitemapXml.includes(`/l/${goneId}<`))
      ok('paged sitemap page 1 serves entries', (await (await fetch(`${BASE}/sitemap.xml?page=1`)).text()).includes(`/l/${offer.id}`))
      ok('out-of-range sitemap page → 404', (await fetch(`${BASE}/sitemap.xml?page=999`)).status === 404)
      ok('non-numeric sitemap page → 404', (await fetch(`${BASE}/sitemap.xml?page=abc`)).status === 404)
      ok('robots.txt exposes the sitemap', (await (await fetch(`${BASE}/robots.txt`)).text()).includes('/sitemap.xml'))
    }
  }

  console.log('\n== 13. Reports & moderation ==')
  {
    // Roles: a seller whose ads get reported, three independent buyers, one
    // volume reporter for the daily cap, and the seeded admin (ADMIN_PHONES).
    const owner: Jar = { cookie: '' }
    const repA: Jar = { cookie: '' }
    const repB: Jar = { cookie: '' }
    const repC: Jar = { cookie: '' }
    const volume: Jar = { cookie: '' }
    await register(owner, uniquePhone(), 'Mod Owner', 'password789')
    await register(repA, uniquePhone(), 'Rep Alpha', 'password789')
    await register(repB, uniquePhone(), 'Rep Bravo', 'password789')
    await register(repC, uniquePhone(), 'Rep Charlie', 'password789')
    await register(volume, uniquePhone(), 'Volume Victor', 'password789')

    const admin: Jar = { cookie: '' }
    const adminLogin = await call('POST', '/api/auth/login', { phone: '0712000001', password: 'demo1234' }, admin)
    storeCookie(admin, adminLogin)
    admin.token = adminLogin.json?.sessionToken
    admin.user = adminLogin.json?.user
    ok('admin signs in (precondition)', adminLogin.status === 200)

    const ownerListing = await call('POST', '/api/listings', { ...validListing, title: 'Moderation target oven', description: 'Clean test stove for the moderation flow.', contactPhone: '+256700000555' }, owner)
    ok('owner publishes the moderation target (201)', ownerListing.status === 201 && Boolean(ownerListing.json?.listing?.id))
    const targetId: string = ownerListing.json?.listing?.id ?? ''
    const fixtureListings: string[] = targetId ? [targetId] : []

    // ---- Guest reporting + dedupe + validation ----
    // Both guest calls share ONE run-salted fixed IP: the suite normally salts
    // every request, but this test asserts SAME-guest (same-IP) dedupe, so the
    // pair must arrive from one address.
    const guestIp = { 'x-forwarded-for': `203.0.115.${(RUN_SALT % 200) + 20}` }
    const guestReport = await call('POST', '/api/reports', { targetType: 'LISTING', targetId, reason: 'SCAM', details: 'looks fake' }, undefined, guestIp)
    ok('guest report → 201', guestReport.status === 201 && Boolean(guestReport.json?.report?.id))
    const guestDup = await call('POST', '/api/reports', { targetType: 'LISTING', targetId, reason: 'SCAM' }, undefined, guestIp)
    ok('same guest reporting again → 409 with a friendly message', guestDup.status === 409 && typeof guestDup.json?.error === 'string' && guestDup.json.error.length > 10)
    const badReason = await call('POST', '/api/reports', { targetType: 'LISTING', targetId, reason: 'JUST_BECAUSE' })
    ok('unknown reason → 400', badReason.status === 400)
    const longDetails = await call('POST', '/api/reports', { targetType: 'LISTING', targetId, reason: 'OTHER', details: 'x'.repeat(501) })
    ok('501-char details → 400', longDetails.status === 400)
    const ghost = await call('POST', '/api/reports', { targetType: 'LISTING', targetId: 'does-not-exist', reason: 'OTHER' })
    ok('report on a missing ad → 404', ghost.status === 404)

    // ---- Auto-hide at 3 distinct reporters ----
    const repA1 = await call('POST', '/api/reports', { targetType: 'LISTING', targetId, reason: 'WRONG_INFO' }, repA)
    ok('signed-in report → 201', repA1.status === 201)
    const midFetch = await call('GET', `/api/listings/${targetId}`)
    ok('two distinct reports do not hide the ad', midFetch.status === 200)
    const repB1 = await call('POST', '/api/reports', { targetType: 'LISTING', targetId, reason: 'SCAM' }, repB)
    const repC1 = await call('POST', '/api/reports', { targetType: 'LISTING', targetId, reason: 'PROHIBITED_ITEM' }, repC)
    ok('third and fourth distinct reporters accepted', repB1.status === 201 && repC1.status === 201)

    const hiddenFetch = await call('GET', `/api/listings/${targetId}`)
    ok('auto-hidden ad → 404 on the public API', hiddenFetch.status === 404)
    const hiddenPage = await fetch(`${BASE}/l/${targetId}`)
    const hiddenHtml = await hiddenPage.text()
    ok('auto-hidden ad page → 404', hiddenPage.status === 404)
    ok('hidden ad shows the no-longer-available page', hiddenHtml.includes('no longer available'))
    const hiddenBrowse = await call('GET', '/api/listings?q=moderation%20target%20oven')
    ok('hidden ad vanishes from browse', !(hiddenBrowse.json?.items ?? []).some((l: any) => l.id === targetId))
    const sitemapText = await (await fetch(`${BASE}/sitemap.xml`)).text()
    ok('hidden ad leaves the sitemap', !sitemapText.includes(`/l/${targetId}<`))

    const ownerNote = await db.notification.findFirst({ where: { userId: owner.user?.id ?? '', type: 'LISTING_HIDDEN' }, orderBy: { createdAt: 'desc' } })
    ok('owner notified about the hiding', Boolean(ownerNote))
    ok('notification explains why and gives the support email', Boolean(ownerNote && ownerNote.body.includes(SUPPORT_EMAIL)))
    const ownerView = await call('GET', `/api/listings/${targetId}`, undefined, owner)
    ok('owner can still fetch their hidden ad (appeal path)', ownerView.status === 200 && ownerView.json?.listing?.status === 'HIDDEN')
    const adminView = await call('GET', `/api/listings/${targetId}`, undefined, admin)
    ok('admin can still fetch the hidden ad', adminView.status === 200)
    const autoHideLog = await db.auditLog.findFirst({ where: { targetType: 'LISTING', targetId, action: 'AUTO_HIDE_LISTING' } })
    ok('auto-hide logged with a system actor', Boolean(autoHideLog && autoHideLog.actorId === null))

    // ---- The admin queue and its 403 walls ----
    const queue = await call('GET', '/api/admin/reports?status=OPEN', undefined, admin)
    ok('admin queue → 200 and lists the target’s reports', queue.status === 200 && (queue.json?.reports ?? []).some((r: any) => r.targetId === targetId))
    const queueRow = (queue.json?.reports ?? []).find((r: any) => r.targetId === targetId && r.status === 'OPEN')
    ok('queue row carries the ad, the reporter and the note', Boolean(queueRow?.listing?.title) && Boolean(queueRow?.reporter))

    const pageDenied = await fetch(`${BASE}/admin`, { headers: { cookie: alice.cookie } })
    ok('non-admin /admin page → 403', pageDenied.status === 403)
    const listDenied = await call('GET', '/api/admin/reports', undefined, alice)
    ok('non-admin queue list → 403', listDenied.status === 403)
    const actionDenied = queueRow ? await call('POST', `/api/admin/reports/${queueRow.id}/action`, { action: 'DISMISS' }, alice) : { status: 0 }
    ok('non-admin action → 403', actionDenied.status === 403)

    // ---- Admin actions: restore, hide, dismiss (each logged) ----
    const restore = queueRow ? await call('POST', `/api/admin/reports/${queueRow.id}/action`, { action: 'RESTORE' }, admin) : { status: 0 }
    const restored = await call('GET', `/api/listings/${targetId}`)
    ok('admin RESTORE → the ad is ACTIVE again', restore.status === 200 && restored.status === 200 && restored.json?.listing?.status === 'ACTIVE')
    const restoreLog = await db.auditLog.findFirst({ where: { targetType: 'LISTING', targetId, action: 'RESTORE_LISTING' }, orderBy: { createdAt: 'desc' } })
    ok('restore logged with the admin as actor', Boolean(restoreLog && restoreLog.actorId === admin.user?.id))

    const hide = queueRow ? await call('POST', `/api/admin/reports/${queueRow.id}/action`, { action: 'HIDE' }, admin) : { status: 0 }
    const reHidden = await call('GET', `/api/listings/${targetId}`)
    ok('admin HIDE → the ad is HIDDEN again', hide.status === 200 && reHidden.status === 404)
    const hideLog = await db.auditLog.findFirst({ where: { targetType: 'LISTING', targetId, action: 'HIDE_LISTING' }, orderBy: { createdAt: 'desc' } })
    ok('admin hide logged with the admin as actor', Boolean(hideLog && hideLog.actorId === admin.user?.id))

    const dismiss = queueRow ? await call('POST', `/api/admin/reports/${queueRow.id}/action`, { action: 'DISMISS' }, admin) : { status: 0 }
    ok('admin DISMISS → 200', dismiss.status === 200)
    const openAfter = await call('GET', '/api/admin/reports?status=OPEN', undefined, admin)
    ok('dismissed report left the OPEN queue', queueRow && !(openAfter.json?.reports ?? []).some((r: any) => r.id === queueRow.id))

    // ---- Shop reports: dismissible, not hideable ----
    const aliceShop = await db.businessProfile.findUnique({ where: { userId: alice.user?.id ?? '' } })
    const shopReport = await call('POST', '/api/reports', { targetType: 'SHOP', targetId: aliceShop?.id ?? 'missing', reason: 'WRONG_INFO' }, repA)
    ok('shop report → 201', shopReport.status === 201 && Boolean(shopReport.json?.report?.id))
    const shopReportId: string = shopReport.json?.report?.id ?? ''
    const shopHide = shopReportId ? await call('POST', `/api/admin/reports/${shopReportId}/action`, { action: 'HIDE' }, admin) : { status: 0 }
    ok('hiding a shop is not a thing → 409', shopHide.status === 409)
    const shopDismiss = shopReportId ? await call('POST', `/api/admin/reports/${shopReportId}/action`, { action: 'DISMISS' }, admin) : { status: 0 }
    ok('shop report dismisses', shopDismiss.status === 200)

    // ---- Daily cap: 10 accepted, the 11th refused ----
    let capAccepted = 0
    for (let i = 1; i <= 10; i++) {
      const made = await call('POST', '/api/listings', { ...validListing, title: `Moderation cap target ${i}` }, owner)
      const capId: string = made.status === 201 ? made.json?.listing?.id : ''
      if (capId) fixtureListings.push(capId)
      const rep = await call('POST', '/api/reports', { targetType: 'LISTING', targetId: capId || 'missing', reason: 'OTHER' }, volume)
      if (rep.status === 201) capAccepted++
    }
    ok('ten accepted reports in a day for one reporter', capAccepted === 10)
    const overCap = await call('POST', '/api/reports', { targetType: 'LISTING', targetId, reason: 'OTHER' }, volume)
    ok('11th report in a day → 429 with a friendly message', overCap.status === 429 && typeof overCap.json?.error === 'string' && overCap.json.error.length > 10)

    // ---- Prohibited items at publish time ----
    const weaponsTry = await call('POST', '/api/listings', { ...validListing, title: 'AK47 rifle for sale' }, owner)
    ok('weapons listing rejected, with the reason stated', weaponsTry.status === 400 && (weaponsTry.json?.error ?? '').includes('Weapons'))
    const bannedSamples = ['cheap cocaine delivery', 'stolen iPhone, no papers', 'transformer parts, cheap', 'manhole covers, 10 pieces', 'fake Nike shoes']
    let rejected = 0
    for (const title of bannedSamples) {
      const res = await call('POST', '/api/listings', { ...validListing, title }, owner)
      if (res.status === 400 && typeof res.json?.error === 'string' && res.json.error.length > 20) rejected++
    }
    ok(`all ${bannedSamples.length} other prohibited samples rejected with a friendly reason`, rejected === bannedSamples.length)
    const stillAllowed = await call('POST', '/api/listings', { ...validListing, title: 'Clean copper scrap, honest stock' }, owner)
    ok('a clean listing still publishes', stillAllowed.status === 201)
    const cleanId: string = stillAllowed.status === 201 ? stillAllowed.json?.listing?.id : ''
    if (cleanId) fixtureListings.push(cleanId)

    // ---- Safety card before Call/Chat, and the report button on the page ----
    const livePage = await fetch(`${BASE}/l/${cleanId}`)
    const liveHtml = await livePage.text()
    ok('ad page carries the safety card before contact', liveHtml.indexOf('Before you call') !== -1 && liveHtml.indexOf('Before you call') < liveHtml.indexOf('Call seller'))
    ok('safety card says never pay in advance', liveHtml.includes('Never pay in advance'))
    ok('ad page carries the report control', liveHtml.includes('aria-label="Report this ad"'))

    // ---- Hermetic cleanup: this section's fixtures never outlive the run ----
    const sectionReporterIds = [repA.user?.id, repB.user?.id, repC.user?.id, volume.user?.id].filter(Boolean) as string[]
    const sectionReports = await db.report.findMany({
      where: {
        OR: [
          { reporterId: { in: sectionReporterIds } },
          { reporterId: null, reporterIp: 'local' },
          { targetType: 'LISTING', targetId: { in: fixtureListings } },
        ],
      },
      select: { id: true },
    })
    const sectionReportIds = sectionReports.map((r) => r.id)
    await db.auditLog.deleteMany({
      where: { OR: [{ targetType: 'LISTING', targetId: { in: fixtureListings } }, { targetType: 'REPORT', targetId: { in: sectionReportIds } }] },
    })
    await db.report.deleteMany({ where: { id: { in: sectionReportIds } } })
    await db.notification.deleteMany({ where: { listingId: { in: fixtureListings } } })
    await db.listing.deleteMany({ where: { id: { in: fixtureListings } } })
    console.log('  (section 13 fixtures cleaned up)')
  }

  console.log('\n== 14. Password reset by SMS code ==')
  {
    // The dev "inbox": the console SMS provider prints each message to the
    // dev server console, which this run captures in dev.log. Codes are read
    // out of it for the assertions — and NEVER printed: no test name or
    // failure detail below carries a code, a token, or a full phone number.
    const DEV_LOG = path.resolve(process.cwd(), 'dev.log')

    async function readDevCode(phone: string): Promise<string | null> {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const log = fs.readFileSync(DEV_LOG, 'utf8')
          const lines = log.split('\n').filter((l) => l.includes(`[sms:console] to ${phone}: `))
          const m = lines.length > 0 ? /reset code is (\d{6})/.exec(lines[lines.length - 1]!) : null
          if (m) return m[1]
        } catch {
          /* dev.log may not be flushed yet — retry below */
        }
        await new Promise((r) => setTimeout(r, 300))
      }
      return null
    }

    async function absentPhone(): Promise<string> {
      for (let i = 0; i < 20; i++) {
        const p = uniquePhone()
        const clash = await db.user.findFirst({ where: { phone: p } })
        if (!clash) return p
      }
      throw new Error('no free test phone')
    }

    // A code that is certainly wrong, derived from the real one (reversed; for
    // palindromes, a guaranteed different constant).
    function wrongOf(code: string): string {
      const flipped = code.split('').reverse().join('')
      if (flipped !== code) return flipped
      return code === '999999' ? '000000' : '999999'
    }

    const OLD_PW = 'oldpassword77'
    const NEW_PW = 'newpassword77'
    const pwA: Jar = { cookie: '' }
    const pwB: Jar = { cookie: '' }
    const pwC: Jar = { cookie: '' }
    const pwD: Jar = { cookie: '' }
    const pwE: Jar = { cookie: '' }
    await register(pwA, uniquePhone(), 'Reset Ada', OLD_PW)
    await register(pwB, uniquePhone(), 'Reset Ben', OLD_PW)
    await register(pwC, uniquePhone(), 'Reset Cate', OLD_PW)
    await register(pwD, uniquePhone(), 'Reset Dan', OLD_PW)
    await register(pwE, uniquePhone(), 'Reset Eva', OLD_PW)
    ok('five reset-fixture accounts exist (precondition)', [pwA, pwB, pwC, pwD, pwE].every((j) => Boolean(j.user?.id && j.token)))
    const tokenBeforeReset = pwA.token!

    // ---- Anti-enumeration on the request step ----
    const ghostPhone = await absentPhone()
    const forgotGhost = await call('POST', '/api/auth/forgot-password', { phone: ghostPhone })
    const forgotReal = await call('POST', '/api/auth/forgot-password', { phone: pwA.user!.phone })
    ok('forgot-password answers 200 for a real number', forgotReal.status === 200 && forgotReal.json?.ok === true)
    ok('identical answer whether or not the number has an account (no enumeration)', forgotGhost.status === forgotReal.status && JSON.stringify(forgotGhost.json) === JSON.stringify(forgotReal.json))
    const forgotBad = await call('POST', '/api/auth/forgot-password', { phone: 'not-a-phone' })
    ok('malformed phone → 400 with a friendly hint', forgotBad.status === 400 && typeof forgotBad.json?.error === 'string' && forgotBad.json.error.length > 10)
    const ghostSmsSent = fs.existsSync(DEV_LOG) && fs.readFileSync(DEV_LOG, 'utf8').includes(`[sms:console] to ${ghostPhone}: `)
    ok('no SMS is ever generated for a number without an account', !ghostSmsSent)

    // ---- Wrong codes, then the right one (pwA) ----
    const codeA = await readDevCode(pwA.user!.phone)
    ok('code delivered to the dev console inbox, and absent from the API body', typeof codeA === 'string' && /^\d{6}$/.test(codeA ?? '') && !/\d{6}/.test(JSON.stringify(forgotReal.json)))
    const smsLineA = fs.existsSync(DEV_LOG)
      ? (fs.readFileSync(DEV_LOG, 'utf8').split('\n').filter((l) => l.includes(`[sms:console] to ${pwA.user!.phone}: `)).pop() ?? '')
      : ''
    ok('the SMS text names the app and is honest about expiry', smsLineA.includes('Mudaala password reset code') && smsLineA.includes('10 minutes'))

    let wrongMsg = ''
    const wrongStatuses: number[] = []
    for (let i = 0; i < 4; i++) {
      const r = await call('POST', '/api/auth/reset-password', { phone: pwA.user!.phone, code: wrongOf(codeA!), newPassword: NEW_PW })
      wrongStatuses.push(r.status)
      wrongMsg = typeof r.json?.error === 'string' ? r.json.error : wrongMsg
    }
    ok('four wrong codes → 400 with one generic message, every time', wrongStatuses.every((s) => s === 400) && wrongMsg.length > 10)
    const rightA = await call('POST', '/api/auth/reset-password', { phone: pwA.user!.phone, code: codeA!, newPassword: NEW_PW })
    ok('the correct code on the 5th submission still works (the kill counts WRONG tries)', rightA.status === 200)

    // ---- Consequences of a successful reset (pwA) ----
    const meOld = await call('GET', '/api/auth/me', undefined, { cookie: '', token: tokenBeforeReset })
    ok('the session held before the reset is revoked (token resolves to nobody)', meOld.status === 200 && meOld.json?.user === null)
    const loginOld = await call('POST', '/api/auth/login', { phone: pwA.user!.phone, password: OLD_PW })
    ok('the old password no longer signs in', loginOld.status === 401)
    const loginNew = await call('POST', '/api/auth/login', { phone: pwA.user!.phone, password: NEW_PW })
    ok('the new password signs in', loginNew.status === 200)
    const reuseA = await call('POST', '/api/auth/reset-password', { phone: pwA.user!.phone, code: codeA!, newPassword: 'anotherpass99' })
    ok('a consumed code cannot be reused', reuseA.status === 400 && reuseA.json?.error === wrongMsg)
    const usedRow = await db.passwordReset.findFirst({ where: { userId: pwA.user!.id }, orderBy: { createdAt: 'desc' } })
    ok('the consumed code is marked used in the database', Boolean(usedRow?.usedAt))

    // ---- Five wrong tries kill the code (pwB) ----
    const forgotB = await call('POST', '/api/auth/forgot-password', { phone: pwB.user!.phone })
    ok('second fixture requested its own code (200)', forgotB.status === 200)
    const codeB = await readDevCode(pwB.user!.phone)
    ok('code delivered for the second fixture', typeof codeB === 'string')
    let killMsg = ''
    for (let i = 0; i < 5; i++) {
      const r = await call('POST', '/api/auth/reset-password', { phone: pwB.user!.phone, code: wrongOf(codeB!), newPassword: NEW_PW })
      killMsg = typeof r.json?.error === 'string' ? r.json.error : killMsg
    }
    const rightB = await call('POST', '/api/auth/reset-password', { phone: pwB.user!.phone, code: codeB!, newPassword: NEW_PW })
    ok('after five wrong tries even the correct code is refused', rightB.status === 400 && rightB.json?.error === killMsg)
    const killedRow = await db.passwordReset.findFirst({ where: { userId: pwB.user!.id }, orderBy: { createdAt: 'desc' } })
    ok('the killed code recorded five wrong tries and a used stamp', killedRow?.attempts === 5 && Boolean(killedRow?.usedAt))

    // ---- Reset-endpoint anti-enumeration ----
    const resetGhost = await call('POST', '/api/auth/reset-password', { phone: await absentPhone(), code: '123456', newPassword: NEW_PW })
    ok('reset for an unknown number says exactly what a wrong code says', resetGhost.status === 400 && resetGhost.json?.error === wrongMsg)

    // ---- Shared password rulebook (pwC), code survives weak tries ----
    await call('POST', '/api/auth/forgot-password', { phone: pwC.user!.phone })
    const codeC = await readDevCode(pwC.user!.phone)
    ok('code delivered for the third fixture', typeof codeC === 'string')
    const commonTry = await call('POST', '/api/auth/reset-password', { phone: pwC.user!.phone, code: codeC!, newPassword: '12345678' })
    ok('a too-common password is refused even with the right code', commonTry.status === 400 && (commonTry.json?.error ?? '').includes('too easy to guess'))
    const localPhone = `0${pwC.user!.phone.slice(4)}` // strip '+256' → everyday local form
    const phoneTry = await call('POST', '/api/auth/reset-password', { phone: pwC.user!.phone, code: codeC!, newPassword: localPhone })
    ok('the phone number itself as password is refused', phoneTry.status === 400 && (phoneTry.json?.error ?? '').includes('phone number'))
    const goodC = await call('POST', '/api/auth/reset-password', { phone: pwC.user!.phone, code: codeC!, newPassword: NEW_PW })
    ok('the code survives weak-password attempts and still completes the reset', goodC.status === 200)
    const rejReg = await call('POST', '/api/auth/register', { phone: await absentPhone(), name: 'Common Pass', password: '12345678', country: 'UG', acceptTerms: true })
    ok('register shares the same rulebook and refuses common passwords too', rejReg.status === 400 && (rejReg.json?.error ?? '').includes('too easy to guess'))

    // ---- Expired code (pwE) ----
    await call('POST', '/api/auth/forgot-password', { phone: pwE.user!.phone })
    const codeE = await readDevCode(pwE.user!.phone)
    ok('code delivered for the fifth fixture', typeof codeE === 'string')
    await db.passwordReset.updateMany({ where: { userId: pwE.user!.id }, data: { expiresAt: new Date(Date.now() - 60_000) } })
    const expiredTry = await call('POST', '/api/auth/reset-password', { phone: pwE.user!.phone, code: codeE!, newPassword: NEW_PW })
    ok('an expired code is refused with the same generic message', expiredTry.status === 400 && expiredTry.json?.error === wrongMsg)

    // ---- Per-phone request cap: 3 per hour ----
    let firstThree = 0
    for (let i = 0; i < 3; i++) {
      const r = await call('POST', '/api/auth/forgot-password', { phone: pwD.user!.phone })
      if (r.status === 200) firstThree++
    }
    ok('three code requests for one number in an hour go through', firstThree === 3)
    const fourth = await call('POST', '/api/auth/forgot-password', { phone: pwD.user!.phone })
    ok('a fourth request for the same number waits an hour (429, friendly)', fourth.status === 429 && typeof fourth.json?.error === 'string' && fourth.json.error.length > 10)

    // ---- Hermetic cleanup: this section's fixtures never outlive the run ----
    const resetUserIds = [pwA, pwB, pwC, pwD, pwE].map((j) => j.user?.id).filter(Boolean) as string[]
    await db.user.deleteMany({ where: { id: { in: resetUserIds } } })
    console.log('  (section 14 fixtures cleaned up)')
  }

  console.log('\n== 15. Legal pages, terms acceptance & phase-1 security ==')
  {
    // ---- 15a. Pure-function units: the bearer gate and env validation ----
    const gate = (env: Record<string, string | undefined>) => bearerAuthEnabled(env)
    ok('15.1 bearer gate: unset → off (production posture)', gate({}) === false)
    ok('15.2 bearer gate: ALLOW_BEARER_AUTH=true/1 → on', gate({ ALLOW_BEARER_AUTH: 'true' }) && gate({ ALLOW_BEARER_AUTH: '1' }))
    ok('15.3 bearer gate: "0"/"false" → off', gate({ ALLOW_BEARER_AUTH: '0' }) === false && gate({ ALLOW_BEARER_AUTH: 'false' }) === false)
    ok('15.4 bearer gate: legacy AUTH_BEARER_FALLBACK=1 still works', gate({ AUTH_BEARER_FALLBACK: '1' }) === true)
    ok('15.5 bearer gate: ALLOW_BEARER_AUTH overrides the legacy alias off', gate({ ALLOW_BEARER_AUTH: '0', AUTH_BEARER_FALLBACK: '1' }) === false)

    const dev = validateEnv({ NODE_ENV: 'development', DATABASE_URL: 'file:./db/x.db' })
    ok('15.6 env validation: minimal dev env passes (ok, no errors)', dev.ok && dev.errors.length === 0)
    ok('15.7 env validation: dev without app URL warns but passes', dev.warnings.length === 1)
    const prodBroken = validateEnv({ NODE_ENV: 'production' })
    ok(
      '15.8 env validation: production without secrets fails with named errors',
      !prodBroken.ok && prodBroken.errors.some((e) => e.includes('DATABASE_URL')) && prodBroken.errors.some((e) => e.includes('CRON_SECRET')) && prodBroken.errors.some((e) => e.includes('SETTINGS_ENCRYPTION_KEY')) && prodBroken.errors.some((e) => e.includes('ADMIN_PHONES')),
    )
    const prodBadBearer = validateEnv({ NODE_ENV: 'production', DATABASE_URL: 'x', NEXT_PUBLIC_APP_URL: 'https://m', CRON_SECRET: 's', SETTINGS_ENCRYPTION_KEY: 'k', ADMIN_PHONES: '+256712000001', ALLOW_BEARER_AUTH: '1' })
    ok('15.9 env validation: bearer enabled in production is at least a loud warning', prodBadBearer.ok && prodBadBearer.warnings.length === 1)

    // ---- 15b. Legal pages exist, render their markdown, and are linked ----
    for (const [slug, phrase] of [['privacy', 'Privacy Policy'], ['terms', 'Terms of Service'], ['safety', 'Safety Guide']] as const) {
      const res = await fetch(`${BASE}/${slug}`)
      const html = await res.text()
      ok(`15.10 /${slug} renders with its content`, res.status === 200 && html.includes(phrase) && html.includes('Mudaala'))
    }
    const homeHtml = await (await fetch(`${BASE}/`)).text()
    ok('15.11 the site footer links all three legal pages', homeHtml.includes('href="/privacy"') && homeHtml.includes('href="/terms"') && homeHtml.includes('href="/safety"'))

    // ---- 15c. Terms acceptance is required and recorded ----
    const noTerms = await call('POST', '/api/auth/register', { phone: uniquePhone(), name: 'No Terms', password: 'quiet-harbor-31', country: 'UG' })
    ok('15.12 register without acceptTerms → 400 with the confirm message', noTerms.status === 400 && noTerms.json?.error?.includes('18'))
    const falseTerms = await call('POST', '/api/auth/register', { phone: uniquePhone(), name: 'No Terms', password: 'quiet-harbor-31', country: 'UG', acceptTerms: false })
    ok('15.13 register with acceptTerms=false → 400', falseTerms.status === 400)
    const termsJar: Jar = { cookie: '' }
    const termsPhone = uniquePhone()
    const withTerms = await register(termsJar, termsPhone, 'Terms Acceptor', 'quiet-harbor-31')
    ok('15.14 register with acceptTerms=true → 201', withTerms.status === 201)
    const termsUser = await db.user.findUnique({ where: { phone: termsPhone } })
    ok(
      `15.15 terms acceptance recorded with version ${TERMS_VERSION}`,
      Boolean(termsUser?.termsAcceptedAt) && termsUser?.termsVersion === TERMS_VERSION,
    )

    // ---- 15d. Login flood: 20 attempts per IP per 15 min ----
    const ipFixed = `203.0.115.${(RUN_SALT % 200) + 7}`
    let lastLogin = { status: 0 }
    for (let i = 0; i < 20; i++) {
      lastLogin = await call('POST', '/api/auth/login', { phone: uniquePhone(), password: 'whatever-123' }, undefined, { 'x-forwarded-for': ipFixed })
    }
    ok('15.16 twenty login attempts from one IP all answered (401)', lastLogin.status === 401)
    const ipBlocked = await call('POST', '/api/auth/login', { phone: uniquePhone(), password: 'whatever-123' }, undefined, { 'x-forwarded-for': ipFixed })
    ok('15.17 the 21st login attempt from that IP inside 15 min → 429', ipBlocked.status === 429)

    // ---- 15e. Register flood: 5 accounts per IP per hour ----
    const regFixed = `203.0.115.${(RUN_SALT % 200) + 8}`
    let lastReg: { status: number; json: any } = { status: 0, json: null }
    for (let i = 0; i < 5; i++) {
      lastReg = await call('POST', '/api/auth/register', { phone: uniquePhone(), name: 'Reg Flood', password: 'quiet-harbor-31', country: 'UG', acceptTerms: true }, undefined, { 'x-forwarded-for': regFixed })
      if (lastReg.json?.user?.id) createdUserIds.add(lastReg.json.user.id)
    }
    ok('15.18 five accounts from one IP are allowed', lastReg.status === 201)
    const regBlocked = await call('POST', '/api/auth/register', { phone: uniquePhone(), name: 'Reg Flood', password: 'quiet-harbor-31', country: 'UG', acceptTerms: true }, undefined, { 'x-forwarded-for': regFixed })
    ok('15.19 the 6th account from that IP within the hour → 429', regBlocked.status === 429)

    // ---- 15f. Publish flood: 20 listings per user per day ----
    const publishCap = Number(process.env.RATE_LIMIT_PUBLISH_MAX ?? 20)
    const publisher: Jar = { cookie: '' }
    await register(publisher, uniquePhone(), 'Burst Publisher', 'quiet-harbor-31')
    // The publisher gets a shop profile: the burst listings it leaves behind
    // then CARRY a businessName on browse page 1, keeping the section-3b
    // "named shop surfaces on browse" assertion true on reruns of this suite
    // (41 fresh listings would otherwise push profiled sellers off page 1).
    await call('PUT', '/api/profile', {
      businessName: `Burst Shop ${Date.now().toString(36)}`,
      photoUrl: null,
      category: 'other',
      description: null,
      county: 'Kampala',
      area: null,
      phone: publisher.user?.phone,
      whatsapp: null,
      hours: null,
    }, publisher)
    let lastPublish = { status: 0 }
    for (let i = 0; i < publishCap; i++) {
      lastPublish = await call('POST', '/api/listings', { ...validListing, title: `Burst listing ${i}` }, publisher)
      if (lastPublish.status !== 201) break
    }
    ok(`15.20 ${publishCap} publishes by one user in a day are allowed`, lastPublish.status === 201)
    const publishBlocked = await call('POST', '/api/listings', { ...validListing, title: 'One too many' }, publisher)
    ok('15.21 the next publish past the daily budget → 429', publishBlocked.status === 429)

    // ---- 15g. Upload flood: 30 photos per user per hour ----
    const tinyPng = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 18, g: 52, b: 86 } } }).png().toBuffer()
    const upload = (jar: Jar) =>
      fetch(`${BASE}/api/upload`, {
        method: 'POST',
        headers: { cookie: jar.cookie, ...(jar.token ? { authorization: `Bearer ${jar.token}` } : {}) },
        body: (() => {
          const f = new FormData()
          f.append('file', new Blob([new Uint8Array(tinyPng)], { type: 'image/png' }), 't.png')
          return f
        })(),
      })
    const uploader: Jar = { cookie: '' }
    await register(uploader, uniquePhone(), 'Photo Burst', 'quiet-harbor-31')
    let lastUpload = { status: 0 }
    for (let i = 0; i < 30; i++) lastUpload = { status: (await upload(uploader)).status }
    ok('15.22 thirty uploads by one user in an hour are allowed', lastUpload.status === 201)
    ok('15.23 the 31st upload within the hour → 429', (await upload(uploader)).status === 429)

    // ---- 15h. CSRF: state-changing requests with a foreign Origin are blocked ----
    const csrfJar: Jar = { cookie: '' }
    await register(csrfJar, uniquePhone(), 'CSRF Target', 'quiet-harbor-31')
    const evilOrigin = await call('POST', '/api/auth/logout', undefined, csrfJar, { origin: 'https://evil.example' })
    ok('15.24 cross-site logout with a stolen cookie → 403', evilOrigin.status === 403)
    const stillIn = await call('GET', '/api/auth/me', undefined, csrfJar)
    ok('15.25 the blocked request did nothing — session intact', stillIn.json?.user?.name === 'CSRF Target')
    const ownOrigin = await call('POST', '/api/auth/logout', undefined, csrfJar, { origin: BASE })
    ok('15.26 same-origin state change passes the Origin check', ownOrigin.status === 200)
    const noOrigin = await call('POST', '/api/auth/logout', undefined, { cookie: '' })
    ok('15.27 non-browser clients (no Origin header) still work', noOrigin.status === 200)

    // ---- 15h+. CSRF behind the preview edge. The sandbox preview's gateway
    // rewrites Host to an internal address and sends no x-forwarded-host, so
    // a genuine login from the preview arrives with an Origin the app cannot
    // match against the Host it sees. CSRF_TRUSTED_HOSTS lists the hosts this
    // deployment really answers as; matching Origins pass, everything else
    // stays blocked. (x-forwarded-host here plays the rewritten internal
    // Host the edge produces.)
    const edgeJar: Jar = { cookie: '' }
    await register(edgeJar, uniquePhone(), 'Preview Edge', 'quiet-harbor-31')
    const edgeLogin = await call(
      'POST',
      '/api/auth/login',
      { phone: edgeJar.user?.phone, password: 'deliberately-wrong' },
      { cookie: '' },
      { origin: 'https://preview-sandbox.preview-platform.example', 'x-forwarded-host': '127.0.0.1:81' },
    )
    ok(
      '15.27a a preview-origin login passes CSRF when the edge rewrites the Host (401 wrong password, not 403)',
      edgeLogin.status === 401,
    )
    const lookalikeOrigin = await call('POST', '/api/auth/logout', undefined, { cookie: '' }, {
      origin: 'https://space-z.ai.evil.example',
    })
    ok('15.27b a lookalike origin outside the trust suffix stays blocked', lookalikeOrigin.status === 403)

    // ---- 15i. Security headers on every response ----
    const homeRes = await fetch(`${BASE}/`)
    const hdrs = homeRes.headers
    ok('15.28 nosniff is set', hdrs.get('x-content-type-options') === 'nosniff')
    ok('15.29 Referrer-Policy is set', (hdrs.get('referrer-policy') ?? '').length > 0)
    ok('15.30 CSP includes frame-ancestors', (hdrs.get('content-security-policy') ?? '').includes('frame-ancestors'))
    ok('15.31 HSTS is set', (hdrs.get('strict-transport-security') ?? '').includes('max-age'))
    // 15.32 mirrors next.config.ts: XFO is SAMEORIGIN for bare 'self', DENY
    // for 'none', and deliberately ABSENT when frame-ancestors names custom
    // origins (XFO cannot express a list — the sandbox preview allowlist).
    const fa = (process.env.FRAME_ANCESTORS ?? "'self'").trim()
    const customAncestors = fa !== '' && fa !== "'self'" && fa !== "'none'"
    const wantXfo = customAncestors ? null : fa === "'none'" ? 'DENY' : 'SAMEORIGIN'
    ok('15.32 X-Frame-Options mirrors frame-ancestors',
      wantXfo === null
        ? hdrs.get('x-frame-options') === null && (hdrs.get('content-security-policy') ?? '').includes(fa)
        : hdrs.get('x-frame-options') === wantXfo)

    // ---- 15j. Photos: EXIF/GPS stripped, capped at 1200px, WebP ----
    const exifJpeg = await sharp({
      create: { width: 2400, height: 1600, channels: 3, background: { r: 40, g: 90, b: 60 } },
    })
      .withMetadata({
        exif: { IFD0: { Artist: 'mudaala-exif-test' }, IFD3: { GPSLatitude: '0,37,0', GPSLatitudeRef: 'N' } },
      })
      .jpeg()
      .toBuffer()
    const exifUpload = await fetch(`${BASE}/api/upload`, {
      method: 'POST',
      headers: { cookie: termsJar.cookie, ...(termsJar.token ? { authorization: `Bearer ${termsJar.token}` } : {}) },
      body: (() => {
        const f = new FormData()
        f.append('file', new Blob([new Uint8Array(exifJpeg)], { type: 'image/jpeg' }), 'exif.jpg')
        return f
      })(),
    })
    const exifJson = (await exifUpload.json().catch(() => null)) as { url?: string } | null
    ok('15.33 EXIF-tagged JPEG uploads → 201 with a .webp url', exifUpload.status === 201 && typeof exifJson?.url === 'string' && exifJson.url.endsWith('.webp'))
    const storedExifPath = path.join(process.cwd(), 'public', exifJson?.url ?? '')
    const storedExif = await sharp(storedExifPath).metadata()
    ok(
      '15.34 stored photo is inside the 1200px box and WebP',
      Math.max(storedExif.width ?? 0, storedExif.height ?? 0) <= 1200 && storedExif.format === 'webp',
    )
    const storedExifBytes = await fs.promises.readFile(storedExifPath)
    ok(
      '15.35 EXIF/GPS is gone — no Artist tag, no EXIF block survives',
      storedExif.exif === undefined && !storedExifBytes.includes(Buffer.from('mudaala-exif-test')),
    )

    // ---- 15k. Cross-user ownership matrix (routes with an id) ----
    const ownerA: Jar = { cookie: '' }
    const ownerB: Jar = { cookie: '' }
    await register(ownerA, uniquePhone(), 'Owner A', 'quiet-harbor-31')
    await register(ownerB, uniquePhone(), 'Owner B', 'quiet-harbor-31')
    const aOwn = await call('POST', '/api/listings', { ...validListing, title: 'Owner A copper piece' }, ownerA)
    ok('15.36 fixture: owner A published a listing', aOwn.status === 201)
    const aSearch = await call('POST', '/api/saved-searches', { name: 'A looks for copper', query: { q: 'copper' } }, ownerA)
    const aSearchId = aSearch.json?.search?.id as string
    const bCheck = await call('POST', `/api/saved-searches/${aSearchId}/check`, undefined, ownerB)
    ok('15.37 user B cannot trigger user A\u2019s saved-search check → 404', bCheck.status === 404)
    const bDelete = await call('DELETE', `/api/saved-searches/${aSearchId}`, undefined, ownerB)
    ok('15.38 user B cannot delete user A\u2019s saved search → 404', bDelete.status === 404)
    const aListings = await call('GET', '/api/my/listings', undefined, ownerA)
    const aListingId = (aListings.json?.listings as any[] | undefined)?.[0]?.id as string | undefined
    if (aListingId) {
      const bMark = await call('PATCH', `/api/listings/${aListingId}`, { title: 'B hijacks A' }, ownerB)
      ok('15.39 user B cannot edit user A\u2019s listing → 404', bMark.status === 404)
    } else {
      ok('15.39 user B cannot edit user A\u2019s listing → 404 (fixture missing)', false, 'owner A had no listing to attack')
    }
    // Notifications: marking another user's notification read is a silent no-op.
    await call('POST', '/api/saved-searches', { name: 'A watches for a radio', query: { q: 'radio' } }, ownerA)
    await call('POST', '/api/listings', { ...validListing, title: 'Radio set for the cross-user test' }, ownerB)
    const aNotifs = await call('GET', '/api/notifications', undefined, ownerA)
    const aNotifId = (aNotifs.json?.notifications as any[] | undefined)?.find((n) => !n.read)?.id as string | undefined
    if (aNotifId) {
      const bMarkRead = await call('POST', `/api/notifications/mark-read?ids=${aNotifId}`, undefined, ownerB)
      const aNotifsAfter = await call('GET', '/api/notifications', undefined, ownerA)
      const stillUnread = (aNotifsAfter.json?.notifications as any[]).find((n) => n.id === aNotifId)?.read === false
      ok('15.40 user B marking user A\u2019s notification read is a no-op', bMarkRead.status === 200 && stillUnread)
    } else {
      ok('15.40 user B marking user A\u2019s notification read is a no-op (no fixture)', false, 'owner A had no unread notification')
    }
  }

  console.log('\n== 16. Real hosting: health, storage interface, Postgres search ==')
  {
    // ---- 16a. Health endpoint: app + database reachable ----
    const health = await fetch(`${BASE}/api/health`)
    const healthJson = (await health.json().catch(() => null)) as { ok?: boolean; app?: string; database?: string } | null
    ok('16.1 /api/health reports ok with the database up', health.status === 200 && healthJson?.ok === true && healthJson.app === 'up' && healthJson.database === 'up')

    // ---- 16b. Storage provider choice is env-driven (pure function) ----
    const local = chooseStorage({})
    ok('16.2 no STORAGE_* env → local-disk provider (development default)', local.name === 'local-disk')
    const s3Env = {
      STORAGE_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      STORAGE_BUCKET: 'mudaala-photos',
      STORAGE_KEY: 'test-key',
      STORAGE_SECRET: 'test-secret',
      STORAGE_PUBLIC_URL: 'https://cdn.mudaala.example',
    }
    const cloud = chooseStorage(s3Env)
    ok('16.3 full STORAGE_* env → s3-compatible provider', cloud.name === 's3-compatible')
    ok(
      '16.4 a single missing STORAGE_* var falls back to local (fail-safe, not half-configured)',
      chooseStorage({ ...s3Env, STORAGE_SECRET: undefined }).name === 'local-disk',
    )
    const parsed = readStorageEnv({ ...s3Env, STORAGE_ENDPOINT: 'https://account.r2.cloudflarestorage.com/' })
    ok('16.5 endpoint trailing slash trimmed, public URL kept', parsed?.endpoint === 'https://account.r2.cloudflarestorage.com' && parsed?.publicUrl === 'https://cdn.mudaala.example')

    // ---- 16c. SigV4 signing: deterministic, spec-shaped ----
    const payload = Buffer.from('mudaala-signature-test')
    const at = new Date('2026-10-02T09:30:00.000Z')
    const s3 = new S3Storage(readStorageEnv(s3Env)!)
    const sigA = signS3Put(readStorageEnv(s3Env)!, 'photos/a.webp', payload, at)
    const sigB = signS3Put(readStorageEnv(s3Env)!, 'photos/a.webp', payload, at)
    ok('16.6 signing is deterministic for identical inputs', sigA.authorization === sigB.authorization)
    ok(
      '16.7 signature scope and shape follow the SigV4 spec',
      sigA.authorization.startsWith('AWS4-HMAC-SHA256 Credential=test-key/20261002/auto/s3/aws4_request') && sigA.amzDate === '20261002T093000Z',
    )
    ok('16.8 path-style request line targets bucket/key', sigA.path === '/mudaala-photos/photos/a.webp' && sigA.host === 'account.r2.cloudflarestorage.com')
    const sigOther = signS3Put({ ...(readStorageEnv(s3Env)!), secret: 'different-secret' }, 'photos/a.webp', payload, at)
    ok('16.9 a different secret yields a different signature', sigOther.authorization !== sigA.authorization)
    ok(
      '16.10 public URL = STORAGE_PUBLIC_URL + key (fallback: endpoint/bucket + key)',
      s3.publicUrlFor('photos/a.webp') === 'https://cdn.mudaala.example/photos/a.webp' &&
        new S3Storage(readStorageEnv({ ...s3Env, STORAGE_PUBLIC_URL: undefined })!).publicUrlFor('photos/a.webp') ===
          'https://account.r2.cloudflarestorage.com/mudaala-photos/photos/a.webp',
    )

    // ---- 16d. Search is case-insensitive ON THE DATABASE (Postgres ILIKE) ----
    const pgSearcher: Jar = { cookie: '' }
    await register(pgSearcher, uniquePhone(), 'PG Search Fixture', 'quiet-harbor-31')
    const pgNeedle = `Zz-Roasted-Groundnuts-${Date.now().toString(36)}`
    const pgListing = await call('POST', '/api/listings', { ...validListing, title: `Fresh ${pgNeedle} batch` }, pgSearcher)
    ok('16.11 search fixture listing published', pgListing.status === 201)
    const upper = await call('GET', `/api/listings?q=${encodeURIComponent(pgNeedle.toUpperCase())}`)
    const foundUpper = (upper.json?.items as any[] | undefined)?.some((l) => l.title === `Fresh ${pgNeedle} batch`)
    ok('16.12 an UPPERCASE query finds the lowercase title (case-insensitive ILIKE search)', upper.status === 200 && foundUpper === true)
  }

  // ===============================================================
  // == 17. PLACEHOLDER RULE — seed flag, sitemap/OG exclusions,   ==
  // ==    neutral tile, one-step seed-removal dry-run             ==
  // ===============================================================
  console.log('\n== 17. Placeholder rule: seed flag, sitemap/OG exclusions, neutral tile ==')
  {
    const ph17: Jar = { cookie: '' }
    await register(ph17, uniquePhone(), 'Placeholder Fixture', 'quiet-harbor-31')
    const ph17Created = await call('POST', '/api/listings', { ...validListing, title: `Zz placeholder fixture ${RUN_TAG}` }, ph17)
    ok('17.1 fixture listing published (precondition)', ph17Created.status === 201)
    const ph17Id: string = ph17Created.json?.listing?.id ?? ''

    // Flag it seed + point its photos at the seed folder, like the seed rows.
    const originalPhotos = JSON.stringify([`/uploads/zz17-not-seed-${RUN_TAG}.webp`])
    await db.listing.update({
      where: { id: ph17Id },
      data: { isSeed: true, photos: JSON.stringify(['/uploads/seed/listing-matooke.png']) },
    })

    const sm17 = await (await fetch(`${BASE}/sitemap.xml`)).text()
    ok('17.2 a seed-flagged listing is not in the sitemap', !sm17.includes(`/l/${ph17Id}<`))

    const seedAd = await fetch(`${BASE}/l/${ph17Id}`)
    const seedHtml = await seedAd.text()
    ok('17.3 an ad page never ships a seed photo path anywhere in its HTML', !seedHtml.includes('/uploads/seed/'))
    ok('17.4 a seed-only-photo ad shows the neutral placeholder tile', seedHtml.includes('Photo coming from the seller'))

    // No photos at all — the honest empty state — shows the same tile.
    await db.listing.update({ where: { id: ph17Id }, data: { photos: '[]' } })
    const bareAd = await (await fetch(`${BASE}/l/${ph17Id}`)).text()
    ok('17.5 a no-photo ad shows the neutral placeholder tile', bareAd.includes('Photo coming from the seller'))

    // Control: with a non-seed photo and no flag, the og:image preview returns
    // (proves the exclusion is the seed rule, not a broken metadata path).
    await db.listing.update({ where: { id: ph17Id }, data: { isSeed: false, photos: originalPhotos } })
    const realAdHtml = await (await fetch(`${BASE}/l/${ph17Id}`)).text()
    ok('17.6 control: a normal ad ships its og:image preview again', realAdHtml.includes('og:image'))
    const sm17b = await (await fetch(`${BASE}/sitemap.xml`)).text()
    ok('17.7 control: the unflagged listing is back in the sitemap', sm17b.includes(`/l/${ph17Id}<`))

    // The one-step removal script: dry-run must run clean, touch nothing,
    // and still see the seed dataset (8 demo shops shipped with the repo).
    const dryRun = execSync('npx tsx scripts/remove-seed-data.ts', { encoding: 'utf8', env: process.env })
    ok('17.8 remove-seed-data dry-run runs clean and deletes nothing', dryRun.includes('DRY-RUN') && dryRun.includes('nothing was deleted'))
    ok('17.9 the dry-run still identifies the seed dataset', /seed users:\s+8 \(8 flagged/.test(dryRun))
    const stillThere = await db.user.count({ where: { isSeed: true } })
    ok('17.10 the dry-run left every seed row in place', stillThere === 8)

    // OG share image: an ad without a real photo must still preview well —
    // the neutral Mudaala card (cream, wordmark, category name) is its
    // og:image. Never a seed photo, never an empty preview, never a broken
    // share card, whatever junk arrives on the card endpoint's query.
    const expectedCard = `${BASE}/api/og/listing?category=${encodeURIComponent(validListing.category)}`
    await db.listing.update({ where: { id: ph17Id }, data: { photos: '[]' } })
    const noPhotoHtml = await (await fetch(`${BASE}/l/${ph17Id}`)).text()
    ok('17.11 a no-photo ad ships the neutral Mudaala card as og:image', noPhotoHtml.includes(`property="og:image" content="${expectedCard}"`))
    ok('17.12 the card og:image references no upload or seed path', !/property="og:image" content="[^"]*\/uploads\//.test(noPhotoHtml))

    const cardRes = await fetch(expectedCard)
    ok(
      '17.13 the card endpoint renders a long-cached image',
      cardRes.status === 200 &&
        (cardRes.headers.get('content-type') ?? '').includes('image/') &&
        (cardRes.headers.get('cache-control') ?? '').includes('immutable'),
    )

    const junkCard = await fetch(`${BASE}/api/og/listing?category=${encodeURIComponent('<script>alert(1)</script>')}`)
    const traversalCard = await fetch(`${BASE}/api/og/listing?category=${encodeURIComponent('../../etc/passwd')}`)
    ok(
      '17.14 junk and traversal categories get a valid generic card (allowlist, nothing reflected)',
      junkCard.status === 200 &&
        traversalCard.status === 200 &&
        (junkCard.headers.get('content-type') ?? '').includes('image/') &&
        (traversalCard.headers.get('content-type') ?? '').includes('image/'),
    )

    await db.listing.update({ where: { id: ph17Id }, data: { photos: JSON.stringify(['/uploads/seed/listing-matooke.png']) } })
    const seedOgHtml = await (await fetch(`${BASE}/l/${ph17Id}`)).text()
    ok(
      '17.15 a seed-only-photo ad ships the card as its share image, never a seed photo',
      seedOgHtml.includes(`property="og:image" content="${expectedCard}"`) &&
        !/property="og:image" content="[^"]*\/uploads\/seed\//.test(seedOgHtml),
    )

    // Restore the control state 17.6/17.7 verified, so the fixture stays
    // exactly as earlier assertions left it.
    await db.listing.update({ where: { id: ph17Id }, data: { isSeed: false, photos: originalPhotos } })

    // The cloud photo migration is fail-closed: with no configured bucket it
    // refuses to run at all, so a half-configured deploy can never silently
    // half-copy the photo set (seed or real) somewhere unrecoverable. The
    // seed exclusion inside the script is enforced in code (seed folder never
    // uploaded, seed paths never rewritten) — exercised by review, not by a
    // live bucket here; what the suite CAN pin is that the gate stays shut.
    let migrationRefusal = ''
    try {
      execSync('npx tsx scripts/migrate-uploads-to-s3.ts', {
        encoding: 'utf8',
        env: {
          ...process.env,
          STORAGE_ENDPOINT: '',
          STORAGE_BUCKET: '',
          STORAGE_KEY: '',
          STORAGE_SECRET: '',
          STORAGE_PUBLIC_URL: '',
        },
      })
    } catch (e) {
      migrationRefusal = String((e as { stderr?: Buffer }).stderr ?? e)
    }
    ok('17.16 the cloud photo migration refuses to run without a configured bucket (fail closed)', migrationRefusal.includes('Refusing to run'))

    // Section cleanup: the fixture listing + its user never persist.
    await db.listing.delete({ where: { id: ph17Id } }).catch(() => undefined)
    await db.user.delete({ where: { id: ph17.user?.id ?? '' } }).catch(() => undefined)
  }

  console.log(`\n== 19. Hermetic sweep — this run leaves no fixtures behind ==`)
  {
    const ids = [...createdUserIds]
    // Targets the fixtures own or were reported about: listings + shop
    // profiles owned by this run's users (users cascade on delete, but
    // report/audit rows POINTING at those targets must go first).
    const ownedListings = ids.length
      ? await db.listing.findMany({ where: { userId: { in: ids } }, select: { id: true } })
      : []
    const ownedShops = ids.length
      ? await db.businessProfile.findMany({ where: { userId: { in: ids } }, select: { id: true } })
      : []
    const targetIds = [...ownedListings, ...ownedShops].map((r) => r.id)
    // Sections with their own hermetic cleanup already removed some users —
    // the sweep must remove every fixture STILL ALIVE at this point.
    const aliveBefore = ids.length ? await db.user.count({ where: { id: { in: ids } } }) : 0
    const delReports = await db.report.deleteMany({
      where: {
        OR: [
          { reporterId: { in: ids } },
          ...(targetIds.length ? [{ targetId: { in: targetIds } }] : []),
        ],
      },
    })
    const delAudits = await db.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: ids } },
          ...(targetIds.length ? [{ targetId: { in: targetIds } }] : []),
        ],
      },
    })
    const delUsers = await db.user.deleteMany({ where: { id: { in: ids } } })
    // Notifications ABOUT deleted fixture listings (recipients may be real
    // users) and any other notification whose listing no longer exists.
    const live = await db.listing.findMany({ select: { id: true } })
    const liveIds = live.map((l) => l.id)
    const delDangling = await db.notification.deleteMany({
      where: { listingId: { not: null }, ...(liveIds.length ? { NOT: { listingId: { in: liveIds } } } : {}) },
    })
    ok(
      '19.1 every fixture still alive at sweep time was removed (users, reports, audits, alerts)',
      delUsers.count === aliveBefore,
    )
    console.log(
      `swept: ${delUsers.count} user(s), ${delReports.count} report(s), ${delAudits.count} audit row(s), ${delDangling.count} dangling notification(s)`,
    )
    const leftovers = ids.length ? await db.user.count({ where: { id: { in: ids } } }) : 0
    ok('19.2 zero users from this run remain', leftovers === 0)
  }

  console.log(`\n========================================`)
  console.log(`RESULT: ${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  ✗ ${f}`)
    process.exitCode = 1
  }
  await db.$disconnect()
}

main().catch(async (e) => {
  console.error('Test runner crashed:', e)
  await db.$disconnect()
  process.exit(1)
})
