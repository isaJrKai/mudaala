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
 * completeness checklist.
 */
import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
import path from 'node:path'
import * as fs from 'node:fs'
// The app's own code-hash primitive — the suite mints KNOWN codes with the
// exact same hashing the request endpoint uses (password.ts is next-free).
import { hashCode } from '../src/lib/password'
// Pure-function units under test (no next/* imports — safe outside a request).
import { bearerAuthEnabled } from '../src/lib/env-flags'
import { validateEnv } from '../src/lib/env'
import { TERMS_VERSION } from '../src/lib/constants'

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
  return res
}

const uniquePhone = () => `+2567${String(Math.floor(10000000 + Math.random() * 89999999))}`

// A shop name unique to THIS run — earlier suite runs leave shops behind, and
// name-equality checks (check-name exclude) must never trip over them.
const SHOP_NAME = `Alice Test Shop ${Date.now().toString(36)}`

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

    const res = await register(alice, alicePhone, 'Alice Tester', 'quiet-harbor-31')
    ok('register creates account (201)', res.status === 201 && res.json?.user?.id)
    ok('register response never contains passwordHash', !JSON.stringify(res.json).includes('passwordHash'))

    const dup = await register({ cookie: '' }, alicePhone, 'Alice Again', 'quiet-harbor-31')
    ok('register rejects duplicate phone (409)', dup.status === 409)

    const wrongPw = await call('POST', '/api/auth/login', { phone: alicePhone, password: 'wrongpassword' })
    ok('login with wrong password → 401, no enumeration', wrongPw.status === 401)

    const ghost = await call('POST', '/api/auth/login', { phone: '+256700111222', password: 'whatever123' })
    ok('login with unknown phone → same 401 message', ghost.status === 401 && ghost.json.error === wrongPw.json.error)

    const login = await call('POST', '/api/auth/login', { phone: alicePhone, password: 'quiet-harbor-31' }, alice)
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
    const ugReg = await register(ug, ugPhone, 'Kampala Tester', 'quiet-harbor-31', 'UG')
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
    const rlReg = await register(rl, rlPhone, 'RL Lockout', 'quiet-harbor-31')
    ok('rate-limit fixture account created (precondition)', rlReg.status === 201)

    let saw401 = 0
    for (let i = 0; i < 5; i++) {
      const wrong = await call('POST', '/api/auth/login', { phone: rlPhone, password: `wrong-attempt-${i}` })
      if (wrong.status === 401) saw401++
    }
    ok('5 wrong attempts each get the normal 401', saw401 === 5)

    const locked = await call('POST', '/api/auth/login', { phone: rlPhone, password: 'quiet-harbor-31' })
    ok('6th attempt locked out with 429 — even with the correct password', locked.status === 429)
    ok('lockout message is friendly and human', typeof locked.json?.error === 'string' && locked.json.error.includes('wait'))

    const alsoLocked = await call('POST', '/api/auth/login', { phone: `0${rlPhone.slice(4)}`, password: 'quiet-harbor-31' })
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
      businessName: SHOP_NAME,
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
      businessName: SHOP_NAME,
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
    ok('shop name uses the seller-chosen business name', shopBody?.shop?.name === SHOP_NAME)
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
      businessName: SHOP_NAME,
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
    const takenCheck = await call('GET', `/api/shops/check-name?name=${encodeURIComponent(SHOP_NAME)}`)
    ok('check-name flags an existing name case-insensitively',
      takenCheck.status === 200 && takenCheck.json?.taken === true && takenCheck.json.matches.length >= 1)
    const ownCheck = await call('GET', `/api/shops/check-name?name=${encodeURIComponent(SHOP_NAME)}&exclude=${alice.user?.id}`)
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
      businessName: 'Twin Name Market',
      photoUrl: null, category: 'other', description: null, county: 'Kampala',
      area: 'Ntinda', phone: uniquePhone(),
      whatsapp: null, hours: null,
    }, cara)
    ok('new profile gets a code at creation', caraProfile.status === 200 && /^MD-\d{4}$/.test(caraProfile.json?.profile?.shopCode ?? ''))
    const doraProfile = await call('PUT', '/api/profile', {
      businessName: 'Twin Name Market',
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
    const twinCheck = await call('GET', '/api/shops/check-name?name=Twin%20Name%20Market')
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
      businessName: SHOP_NAME,
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
        searchText: 'expiry sweep test listing',
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

    // Hermetic medians: a median computed over accumulated test listings from
    // earlier runs would be a lie. The sandbox owns its data — retire every
    // ACTIVE OFFER in exactly the two combos this section measures, then
    // rebuild them from scratch below.
    await db.listing.updateMany({
      where: {
        type: 'OFFER',
        status: 'ACTIVE',
        OR: [
          { category: 'electronics', unit: 'piece' },
          { category: 'food-groceries', unit: 'kg' },
        ],
      },
      data: { status: 'EXPIRED' },
    })
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
  }

  console.log('\n== 12. Ad pages (/l/[id], /s/[code]) ==')
  {
    // Section 10 signed alice out on purpose; the publish-backed tests below
    // need her session again, so sign back in first. call() does not auto-
    // store cookies, so capture the fresh session by hand.
    const relogin = await call('POST', '/api/auth/login', { phone: alicePhone, password: 'quiet-harbor-31' }, alice)
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

    // Fixture hunt goes through the DB, not API page 1: enough no-photo test
    // offers push the seeded photo ads past the first page, and the ad-page
    // tests must not depend on feed pagination.
    const offerCandidates = await db.listing.findMany({
      where: { type: 'OFFER', status: 'ACTIVE', price: { not: null } },
      orderBy: { refreshedAt: 'desc' },
      take: 200,
    })
    const offerFixture = offerCandidates.find((l) => {
      try {
        return JSON.parse(l.photos).length > 0
      } catch {
        return false
      }
    })
    const offer = offerFixture
      ? { ...offerFixture, photos: JSON.parse(offerFixture.photos) as string[] }
      : undefined
    ok('suite finds an active OFFER (with photos) to test with', Boolean(offer?.id && offer?.title))
    if (!offer) throw new Error('ad-page fixture missing: need an active OFFER with photos')

    // /l/{id} — the full ad-page surface.
    const page = await fetch(`${BASE}/l/${offer.id}`)
    const html = await page.text()
    const head = html.slice(0, html.indexOf('</head>'))
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
    const offerPhone = offerFixture?.contactPhone ?? ''
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
    const request = await db.listing.findFirst({
      where: { type: 'REQUEST', status: 'ACTIVE' },
      orderBy: { refreshedAt: 'desc' },
    })
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
    // The similar-ads rail shows the 4 FRESHEST ACTIVE ads of the category —
    // fixtures left by earlier runs could crowd the expected ad out of the
    // take-4 window. The suite therefore ships its own: created seconds ago,
    // nothing in the category is fresher, so the assertion holds on a clean
    // or a dirty database alike.
    const similarKeep = await call('POST', '/api/listings', { ...validListing, title: 'Similar copper scrap offering', contactPhone: '+256700000222' }, alice)
    ok('similar-ad fixture published (201)', similarKeep.status === 201 && Boolean(similarKeep.json?.listing?.id))
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
    ok('expired ad page offers similar ads from the same category', goneHtml.includes(`/l/${similarKeep.json?.listing?.id ?? ''}`))
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
        businessName: SHOP_NAME,
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
      ok('shop page renders the shop name', shopHtml.includes(SHOP_NAME))
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
    // Fixture: an owner whose listing gets ganged up on, plus fresh listings
    // for the daily-ceiling sweep. All guest reporters send explicit
    // x-forwarded-for values — the server keys guest dedupe/limits on IP.
    const owner: Jar = { cookie: '' }
    await register(owner, uniquePhone(), 'Report Owner', 'quiet-harbor-31')
    const mkListing = async (title: string): Promise<string> => {
      const res = await call('POST', '/api/listings', { ...validListing, title, contactPhone: owner.user?.phone }, owner)
      return res.json?.listing?.id
    }
    const victim = await mkListing('Fresh beans from Mbale bulk')
    ok('fixture listing published (precondition)', Boolean(victim))

    // 13.1 shape and targets
    const ghost = await call('POST', '/api/reports', { targetType: 'LISTING', targetId: 'nonexistent', reason: 'SCAM' }, undefined, { 'x-forwarded-for': '10.99.0.1' })
    ok('report on a missing listing → 404', ghost.status === 404)
    const badReason = await call('POST', '/api/reports', { targetType: 'LISTING', targetId: victim, reason: 'SPAM' }, undefined, { 'x-forwarded-for': '10.99.0.2' })
    ok('invalid reason → 400', badReason.status === 400)

    // Run-unique reporter IPs: report rows persist and count per UTC day, so
    // fixed IPs would stay exhausted from earlier suite runs on the same day.
    const runIpSeed = Math.floor(Math.random() * 200) + 20
    const guestIp = (n: number) => `10.${runIpSeed}.0.${n}`

    // 13.2 guests may report; one OPEN report per reporter per target
    const g1 = await call('POST', '/api/reports', { targetType: 'LISTING', targetId: victim, reason: 'SCAM', details: 'Asked for money before showing the goods' }, undefined, { 'x-forwarded-for': guestIp(1) })
    ok('guest report accepted (201)', g1.status === 201 && g1.json?.report?.id)
    ok('report response never echoes reporter identity', !JSON.stringify(g1.json).toLowerCase().includes('ip'))
    const g1dup = await call('POST', '/api/reports', { targetType: 'LISTING', targetId: victim, reason: 'OTHER' }, undefined, { 'x-forwarded-for': guestIp(1) })
    ok('same guest reporting again → 409 (one open report per reporter)', g1dup.status === 409)

    // 13.3 auto-hide at three DISTINCT reporters + the owner notice
    const g2 = await call('POST', '/api/reports', { targetType: 'LISTING', targetId: victim, reason: 'STOLEN_GOODS' }, undefined, { 'x-forwarded-for': guestIp(2) })
    ok('second distinct guest report accepted (201)', g2.status === 201)
    const second: Jar = { cookie: '' }
    await register(second, uniquePhone(), 'Second Reporter', 'quiet-harbor-31')
    const u1 = await call('POST', '/api/reports', { targetType: 'LISTING', targetId: victim, reason: 'WRONG_INFO' }, second)
    ok('signed-in report accepted (201)', u1.status === 201)
    const victimAfter = await db.listing.findUnique({ where: { id: victim } })
    ok('listing auto-hidden at 3 distinct reporters', victimAfter?.status === 'HIDDEN')
    const ownerNotified = await db.notification.findFirst({ where: { userId: owner.user!.id, type: 'LISTING_HIDDEN' } })
    ok('owner notified with the support-email appeal path', Boolean(ownerNotified) && ownerNotified!.body.includes('[SUPPORT EMAIL]'))

    const direct = await call('GET', `/api/listings/${victim}`)
    ok('hidden listing direct fetch → 404', direct.status === 404 && direct.json?.error === 'This listing is no longer available')
    const ownerFetch = await call('GET', `/api/listings/${victim}`, undefined, owner)
    ok('owner still sees their hidden listing (with status)', ownerFetch.status === 200 && ownerFetch.json?.listing?.status === 'HIDDEN')
    const searchRes = await call('GET', `/api/listings?q=${encodeURIComponent('Fresh beans from Mbale bulk')}`)
    ok('hidden listing gone from browse/search', !JSON.stringify(searchRes.json).includes(victim))
    const sitemapXml = await (await fetch(`${BASE}/sitemap.xml`)).text()
    ok('hidden listing gone from the sitemap', !sitemapXml.includes(`/l/${victim}<`))
    const selfRestore = await call('PATCH', `/api/listings/${victim}`, { status: 'ACTIVE' }, owner)
    ok('owner cannot self-restore a hidden listing (409)', selfRestore.status === 409)

    // 13.4 the admin gate: /api/admin/* is 401/403 for everyone else
    const anonQueue = await call('GET', '/api/admin/reports')
    ok('admin queue signed out → 401', anonQueue.status === 401)
    const civilian: Jar = { cookie: '' }
    await register(civilian, uniquePhone(), 'Civilian Reporter', 'quiet-harbor-31')
    const nonAdminQueue = await call('GET', '/api/admin/reports', undefined, civilian)
    ok('admin queue non-admin → 403', nonAdminQueue.status === 403)
    const nonAdminAct = await call('PATCH', `/api/admin/reports/${g1.json.report.id}`, { action: 'DISMISS' }, civilian)
    ok('admin action non-admin → 403', nonAdminAct.status === 403)

    const admin: Jar = { cookie: '' }
    const adminLogin = await call('POST', '/api/auth/login', { phone: '0712000001', password: 'demo1234' }, admin)
    storeCookie(admin, adminLogin)
    admin.token = adminLogin.json?.sessionToken
    ok('admin signs in (precondition)', adminLogin.status === 200)

    const queue = await call('GET', '/api/admin/reports', undefined, admin)
    ok('admin queue opens (200)', queue.status === 200)
    const queueRows: any[] = queue.json?.reports ?? []
    ok('queue lists the victim reports', queueRows.some((r) => r.targetId === victim))
    ok('queue rows carry reason + details', queueRows.some((r) => r.targetId === victim && r.reason === 'SCAM' && typeof r.details === 'string'))
    ok('queue never contains reporter IPs or identities', !JSON.stringify(queue.json).includes('10.0.0.'))

    // 13.5 the three actions, audited
    const dismissOne = await call('PATCH', `/api/admin/reports/${g1.json.report.id}`, { action: 'DISMISS' }, admin)
    ok('dismiss report works (200)', dismissOne.status === 200)
    const afterDismiss = await db.listing.findUnique({ where: { id: victim } })
    ok('dismiss alone does not restore the listing', afterDismiss?.status === 'HIDDEN')
    ok('dismiss action audited', Boolean(await db.auditLog.findFirst({ where: { action: 'DISMISS_REPORT', targetId: g1.json.report.id } })))

    const hideAct = await call('PATCH', `/api/admin/reports/${g2.json.report.id}`, { action: 'HIDE' }, admin)
    ok('admin hide works (200, idempotent on hidden)', hideAct.status === 200)
    ok('hide action audited', Boolean(await db.auditLog.findFirst({ where: { action: 'HIDE_LISTING', targetId: victim } })))
    const restoreAct = await call('PATCH', `/api/admin/reports/${g2.json.report.id}`, { action: 'RESTORE' }, admin)
    ok('admin restore works (200)', restoreAct.status === 200)
    ok('restore action audited', Boolean(await db.auditLog.findFirst({ where: { action: 'RESTORE_LISTING', targetId: victim } })))
    const afterRestore = await db.listing.findUnique({ where: { id: victim } })
    ok('restore returns the listing to ACTIVE', afterRestore?.status === 'ACTIVE')
    const restoreFetch = await call('GET', `/api/listings/${victim}`)
    ok('restored listing fetchable again (200)', restoreFetch.status === 200)
    const openAfterRestore = await db.report.count({ where: { targetType: 'LISTING', targetId: victim, status: 'OPEN' } })
    ok('restore dismisses the remaining open reports', openAfterRestore === 0)
    const restoreAgain = await call('PATCH', `/api/admin/reports/${g2.json.report.id}`, { action: 'RESTORE' }, admin)
    ok('restore on a live listing → 409', restoreAgain.status === 409)

    // 13.6 the daily ceiling: 10 reports per day per reporter (guest IP here)
    const targets: string[] = []
    for (let i = 0; i < 12; i++) targets.push(await mkListing(`Bulk floor maize lot number ${i}`))
    ok('ceiling sweep fixtures published (precondition)', targets.every(Boolean))
    let limitAt: number | null = null
    for (let i = 0; i < targets.length; i++) {
      const res = await call('POST', '/api/reports', { targetType: 'LISTING', targetId: targets[i], reason: 'OTHER', details: `sweep ${i}` }, undefined, { 'x-forwarded-for': `10.${runIpSeed}.9.1` })
      if (res.status === 429) {
        limitAt = i
        break
      }
      ok(`sweep report ${i + 1} accepted`, res.status === 201)
    }
    ok('11th report in a day → 429', limitAt === 10)
    const third: Jar = { cookie: '' }
    await register(third, uniquePhone(), 'Third Reporter', 'quiet-harbor-31')
    const separateBudget = await call('POST', '/api/reports', { targetType: 'LISTING', targetId: targets[0], reason: 'OTHER' }, third)
    ok('signed-in reporter has a separate daily budget (201)', separateBudget.status === 201)

    // 13.7 shop reports — Dismiss-only in V1 (HIDDEN is a listing state)
    const shopReport = await call('POST', '/api/reports', { targetType: 'SHOP', targetId: owner.user!.id, reason: 'SCAM' }, undefined, { 'x-forwarded-for': '10.7.7.7' })
    ok('shop report accepted (201)', shopReport.status === 201)
    const hideShop = await call('PATCH', `/api/admin/reports/${shopReport.json.report.id}`, { action: 'HIDE' }, admin)
    ok('hide on a shop report → 409 (dismiss-only in V1)', hideShop.status === 409)
    const dismissShop = await call('PATCH', `/api/admin/reports/${shopReport.json.report.id}`, { action: 'DISMISS' }, admin)
    ok('dismiss shop report works (200)', dismissShop.status === 200)

    // 13.8 prohibited items at publish time (and on edits)
    const gun = await call('POST', '/api/listings', { ...validListing, title: 'Clean rust gun metal piece', description: 'Heavy metal piece for the workshop, solid and ready for pickup today.' }, owner)
    ok('weapon wording rejected with a friendly explanation', gun.status === 400 && gun.json.error.includes('does not allow'))
    const stolen = await call('POST', '/api/listings', { ...validListing, title: 'Cheap laptop deal today', description: 'Laptop for sale, no papers, cash only — genuine and working.' }, owner)
    ok('stolen-goods wording rejected (no papers)', stolen.status === 400)
    const cable = await call('POST', '/api/listings', { ...validListing, title: 'Electric cable rolls for sale', description: 'Electric cable on rolls, best price in the market this week.' }, owner)
    ok('public-infrastructure items rejected (electric cable)', cable.status === 400)
    const cleanOk = await call('POST', '/api/listings', { ...validListing, title: 'Roofing sheets clean stock', description: 'Twenty pieces of iron sheets, clean and ready for pickup.' }, owner)
    ok('clean listing still publishes (201)', cleanOk.status === 201 && cleanOk.json?.listing?.id)
    const editBad = await call('PATCH', `/api/listings/${cleanOk.json.listing.id}`, { description: 'Iron sheets, stolen last week, very cheap for you.' }, owner)
    ok('editing stolen wording into a listing → 400', editBad.status === 400)

    // 13.9 the /admin page: friendly gate for humans (APIs are the real 403)
    const adminPage = await fetch(`${BASE}/admin`)
    const adminPageText = await adminPage.text()
    ok('/admin page reachable with an admins-only screen for guests', adminPage.status === 200 && adminPageText.includes('Admins only'))
    ok('/admin page asks crawlers to stay away (noindex)', adminPageText.toLowerCase().includes('noindex'))
  }

  console.log('\n== 14. Password reset by SMS code ==')
  {
    const REQUEST_PATH = '/api/auth/password/reset/request'
    const CONFIRM_PATH = '/api/auth/password/reset/confirm'
    const INVALID_MESSAGE = 'That code is not valid or has expired. Request a new code and try again.'
    const xff = (ip: string): Record<string, string> => ({ 'x-forwarded-for': ip })

    // Fixture: a user with a strong password and three live sessions
    // (register creates one, two more logins follow).
    const rita: Jar = { cookie: '' }
    const ritaPhone = uniquePhone()
    const ritaReg = await register(rita, ritaPhone, 'Reset Rita', 'quiet-harbor-31')
    ok('14.1 reset fixture user registered (201)', ritaReg.status === 201 && Boolean(rita.user?.id))
    await call('POST', '/api/auth/login', { phone: ritaPhone, password: 'quiet-harbor-31' })
    await call('POST', '/api/auth/login', { phone: ritaPhone, password: 'quiet-harbor-31' })
    const sessionsBefore = await db.session.count({ where: { userId: rita.user!.id } })
    ok('14.2 fixture has three live sessions before the reset', sessionsBefore === 3)

    // Step 1 — request a code. THE no-enumeration test: identical status and
    // body for a phone with an account and a phone without one.
    const known = await call('POST', REQUEST_PATH, { phone: ritaPhone }, undefined, xff('203.0.113.51'))
    const ghostPhone = uniquePhone()
    const unknown = await call('POST', REQUEST_PATH, { phone: ghostPhone }, undefined, xff('203.0.113.51'))
    ok('14.3 request for an account → 200 with the fixed message', known.status === 200 && typeof known.json?.message === 'string' && known.json.message.includes('6-digit'))
    ok('14.4 request for a non-account → IDENTICAL status + body (no enumeration)', unknown.status === known.status && JSON.stringify(unknown.json) === JSON.stringify(known.json))

    const storedRow = await db.passwordReset.findFirst({ where: { user: { phone: ritaPhone } }, orderBy: { createdAt: 'desc' } })
    ok('14.5 a real account got a PasswordReset row', Boolean(storedRow))
    ok('14.6 the code is stored as salted sha256, never plaintext', Boolean(storedRow && /^[0-9a-f]{32}:[0-9a-f]{64}$/.test(storedRow.codeHash)))

    // The delivery path (console provider in dev) must not leak the phone
    // into server logs — a project red line, checked against the live log.
    await new Promise((r) => setTimeout(r, 400))
    let phoneInLog = false
    if (fs.existsSync('dev.log')) {
      phoneInLog = fs.readFileSync('dev.log', 'utf8').includes(ritaPhone)
    }
    ok('14.7 the delivery path never logs the phone number', !phoneInLog)

    // Per-phone budget: 3 codes per hour (each dial format shares one budget).
    const budgetPhone = uniquePhone()
    const b1 = await call('POST', REQUEST_PATH, { phone: budgetPhone }, undefined, xff('203.0.113.52'))
    const b2 = await call('POST', REQUEST_PATH, { phone: budgetPhone }, undefined, xff('203.0.113.52'))
    const b3 = await call('POST', REQUEST_PATH, { phone: budgetPhone }, undefined, xff('203.0.113.52'))
    const b4 = await call('POST', REQUEST_PATH, { phone: budgetPhone }, undefined, xff('203.0.113.52'))
    ok('14.8 three codes per phone per hour pass', b1.status === 200 && b2.status === 200 && b3.status === 200)
    ok('14.9 the 4th code request for the same phone inside the hour → 429', b4.status === 429)

    // Per-IP budget: 10 codes per hour across any numbers (distinct phones so
    // only the IP bucket fills).
    let lastOk = { status: 0 }
    for (let i = 0; i < 10; i++) {
      lastOk = await call('POST', REQUEST_PATH, { phone: uniquePhone() }, undefined, xff('203.0.113.53'))
    }
    ok('14.10 ten code requests from one IP pass', lastOk.status === 200)
    const eleventh = await call('POST', REQUEST_PATH, { phone: uniquePhone() }, undefined, xff('203.0.113.53'))
    ok('14.11 the 11th code request from the same IP inside the hour → 429', eleventh.status === 429)

    // Step 2 — confirm. The app never reveals a code over HTTP, so the suite
    // mints a row with a KNOWN code using the app's own hash primitive.
    const KNOWN_CODE = '482013'
    await db.passwordReset.deleteMany({ where: { user: { phone: ritaPhone } } })
    const minted = await db.passwordReset.create({
      data: { userId: rita.user!.id, codeHash: hashCode(KNOWN_CODE), expiresAt: new Date(Date.now() + 10 * 60_000) },
    })

    const wrong = await call('POST', CONFIRM_PATH, { phone: ritaPhone, code: '000000', newPassword: 'another-strong-77' })
    ok('14.12 wrong code → the one unified 400 message', wrong.status === 400 && wrong.json?.error === INVALID_MESSAGE)
    ok('14.13 a wrong entry counts an attempt', (await db.passwordReset.findUnique({ where: { id: minted.id } }))?.attempts === 1)

    // Five wrong entries kill the code — even the RIGHT code dies with them.
    for (let i = 0; i < 4; i++) {
      await call('POST', CONFIRM_PATH, { phone: ritaPhone, code: '000000', newPassword: 'another-strong-77' })
    }
    ok('14.14 attempts stopped counting at 5', (await db.passwordReset.findUnique({ where: { id: minted.id } }))?.attempts === 5)
    const rightButDead = await call('POST', CONFIRM_PATH, { phone: ritaPhone, code: KNOWN_CODE, newPassword: 'another-strong-77' })
    ok('14.15 five wrong entries kill the code — the right code is refused too', rightButDead.status === 400)

    await db.passwordReset.update({ where: { id: minted.id }, data: { attempts: 0, expiresAt: new Date(Date.now() - 1000) } })
    const expired = await call('POST', CONFIRM_PATH, { phone: ritaPhone, code: KNOWN_CODE, newPassword: 'another-strong-77' })
    ok('14.16 expired code → unified 400', expired.status === 400 && expired.json?.error === INVALID_MESSAGE)

    await db.passwordReset.update({ where: { id: minted.id }, data: { expiresAt: new Date(Date.now() + 10 * 60_000), usedAt: new Date() } })
    const reused = await call('POST', CONFIRM_PATH, { phone: ritaPhone, code: KNOWN_CODE, newPassword: 'another-strong-77' })
    ok('14.17 reused (already-used) code → unified 400', reused.status === 400 && reused.json?.error === INVALID_MESSAGE)

    const ghostConfirm = await call('POST', CONFIRM_PATH, { phone: ghostPhone, code: '123456', newPassword: 'strong-enough-9' })
    ok('14.18 confirm for a phone without an account = wrong-code answer (no enumeration)', ghostConfirm.status === 400 && ghostConfirm.json?.error === INVALID_MESSAGE)

    // Fresh live code again; the new password must pass the REGISTER rules.
    await db.passwordReset.update({ where: { id: minted.id }, data: { usedAt: null, attempts: 0, expiresAt: new Date(Date.now() + 10 * 60_000) } })
    const shortPw = await call('POST', CONFIRM_PATH, { phone: ritaPhone, code: KNOWN_CODE, newPassword: 'short' })
    ok('14.19 short new password → 400 with the register wording', shortPw.status === 400 && Boolean(shortPw.json?.fields?.newPassword))
    const commonPw = await call('POST', CONFIRM_PATH, { phone: ritaPhone, code: KNOWN_CODE, newPassword: 'password1234' })
    ok('14.20 common new password → 400', commonPw.status === 400 && Boolean(commonPw.json?.fields?.newPassword))
    const phonePw = await call('POST', CONFIRM_PATH, { phone: ritaPhone, code: KNOWN_CODE, newPassword: `0${ritaPhone.slice(4)}` })
    ok('14.21 password equal to the phone number → 400', phonePw.status === 400 && Boolean(phonePw.json?.fields?.newPassword))
    ok('14.22 rule rejections did not burn code attempts', (await db.passwordReset.findUnique({ where: { id: minted.id } }))?.attempts === 0)

    // Happy path: password flips, code burns, sessions die.
    const good = await call('POST', CONFIRM_PATH, { phone: ritaPhone, code: KNOWN_CODE, newPassword: 'final-strong-88' })
    ok('14.23 correct code + strong password → 200', good.status === 200)
    ok('14.24 the code is marked used', Boolean((await db.passwordReset.findUnique({ where: { id: minted.id } }))?.usedAt))
    const sessionsAfter = await db.session.count({ where: { userId: rita.user!.id } })
    ok('14.25 every session for the user is revoked', sessionsAfter === 0)
    const oldLogin = await call('POST', '/api/auth/login', { phone: ritaPhone, password: 'quiet-harbor-31' })
    ok('14.26 the old password no longer signs in', oldLogin.status === 401)
    const newLogin = await call('POST', '/api/auth/login', { phone: ritaPhone, password: 'final-strong-88' })
    ok('14.27 the new password signs in', newLogin.status === 200)
    const reuse = await call('POST', CONFIRM_PATH, { phone: ritaPhone, code: KNOWN_CODE, newPassword: 'final-strong-88' })
    ok('14.28 the same code cannot reset twice', reuse.status === 400)
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
    const ipFixed = '203.0.115.7'
    let lastLogin = { status: 0 }
    for (let i = 0; i < 20; i++) {
      lastLogin = await call('POST', '/api/auth/login', { phone: uniquePhone(), password: 'whatever-123' }, undefined, { 'x-forwarded-for': ipFixed })
    }
    ok('15.16 twenty login attempts from one IP all answered (401)', lastLogin.status === 401)
    const ipBlocked = await call('POST', '/api/auth/login', { phone: uniquePhone(), password: 'whatever-123' }, undefined, { 'x-forwarded-for': ipFixed })
    ok('15.17 the 21st login attempt from that IP inside 15 min → 429', ipBlocked.status === 429)

    // ---- 15e. Register flood: 5 accounts per IP per hour ----
    const regFixed = '203.0.115.8'
    let lastReg = { status: 0 }
    for (let i = 0; i < 5; i++) {
      lastReg = await call('POST', '/api/auth/register', { phone: uniquePhone(), name: 'Reg Flood', password: 'quiet-harbor-31', country: 'UG', acceptTerms: true }, undefined, { 'x-forwarded-for': regFixed })
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

    // ---- 15i. Security headers on every response ----
    const homeRes = await fetch(`${BASE}/`)
    const hdrs = homeRes.headers
    ok('15.28 nosniff is set', hdrs.get('x-content-type-options') === 'nosniff')
    ok('15.29 Referrer-Policy is set', (hdrs.get('referrer-policy') ?? '').length > 0)
    ok('15.30 CSP includes frame-ancestors', (hdrs.get('content-security-policy') ?? '').includes('frame-ancestors'))
    ok('15.31 HSTS is set', (hdrs.get('strict-transport-security') ?? '').includes('max-age'))
    ok('15.32 X-Frame-Options mirrors frame-ancestors', hdrs.get('x-frame-options') === 'SAMEORIGIN')

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
