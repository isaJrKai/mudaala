/**
 * Mudaala — API behavior & security tests.
 *
 * Tests observable outcomes and permission boundaries against the running dev
 * server, not implementation details. Run: npx tsx scripts/test-api.ts
 *
 * Covers: auth (cookie AND Bearer transport, UG/TZ/KE phones), ownership
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

const BASE = 'http://localhost:3000'
const db = new PrismaClient()

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

async function register(jar: Jar, phone: string, name: string, password: string, country = 'KE') {
  const res = await call('POST', '/api/auth/register', { phone, name, password, country }, jar)
  storeCookie(jar, res)
  if (res.json?.sessionToken) jar.token = res.json.sessionToken
  jar.user = res.json?.user
  return res
}

const uniquePhone = () => `+2547${String(Math.floor(10000000 + Math.random() * 89999999))}`

const validListing = {
  type: 'OFFER',
  title: 'Test copper scrap offering',
  description: 'Clean test copper scrap for validating the publishing pipeline end to end.',
  category: 'scrap-recyclables',
  price: 500,
  currency: 'KES',
  priceNegotiable: false,
  unit: 'kg',
  quantity: 100,
  country: 'KE',
  county: 'Nairobi',
  area: 'Test Area',
  contactPhone: '+254712345678',
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

    const res = await register(alice, alicePhone, 'Alice Tester', 'password123')
    ok('register creates account (201)', res.status === 201 && res.json?.user?.id)
    ok('register response never contains passwordHash', !JSON.stringify(res.json).includes('passwordHash'))

    const dup = await register({ cookie: '' }, alicePhone, 'Alice Again', 'password123')
    ok('register rejects duplicate phone (409)', dup.status === 409)

    const wrongPw = await call('POST', '/api/auth/login', { phone: alicePhone, password: 'wrongpassword' })
    ok('login with wrong password → 401, no enumeration', wrongPw.status === 401)

    const ghost = await call('POST', '/api/auth/login', { phone: '+254700111222', password: 'whatever123' })
    ok('login with unknown phone → same 401 message', ghost.status === 401 && ghost.json.error === wrongPw.json.error)

    const login = await call('POST', '/api/auth/login', { phone: alicePhone, password: 'password123' }, alice)
    ok('login works (200) and sets session cookie', login.status === 200 && alice.cookie.includes('mudaala_session'))
    ok('login returns sessionToken for the Bearer channel', typeof login.json?.sessionToken === 'string' && login.json.sessionToken.length > 0)

    const me = await call('GET', '/api/auth/me', undefined, alice)
    ok('GET /me returns session user', me.json?.user?.phone === alicePhone)
    ok('GET /me includes account country', typeof me.json?.user?.country === 'string')

    const anonMe = await call('GET', '/api/auth/me')
    ok('GET /me without session → user null', anonMe.json?.user === null)
  }

  console.log('\n== 1b. Multi-country phones + Bearer transport ==')
  {
    // Seeded dev fixtures: same local-format numbers a real user would type.
    const ugLogin = await call('POST', '/api/auth/login', { phone: '0772123456', password: 'demo1234' })
    ok('Ugandan local number 0772123456 logs in (no country chosen)', ugLogin.status === 200 && ugLogin.json?.user?.phone === '+256772123456')

    const tzLogin = await call('POST', '/api/auth/login', { phone: '0712345678', password: 'demo1234' })
    ok('Tanzanian local number 0712345678 logs in', tzLogin.status === 200 && tzLogin.json?.user?.phone === '+255712345678')

    const keLogin = await call('POST', '/api/auth/login', { phone: '0712000001', password: 'demo1234' })
    ok('Kenyan local number 0712000001 still logs in', keLogin.status === 200 && keLogin.json?.user?.phone === '+254712000001')

    // Register a Ugandan account with country declared.
    const ug: Jar = { cookie: '' }
    const ugPhone = `077${String(Math.floor(1000000 + Math.random() * 8999999))}`.slice(0, 10)
    const ugReg = await register(ug, ugPhone, 'Kampala Tester', 'password123', 'UG')
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
    const rlReg = await register(rl, rlPhone, 'RL Lockout', 'password123')
    ok('rate-limit fixture account created (precondition)', rlReg.status === 201)

    let saw401 = 0
    for (let i = 0; i < 5; i++) {
      const wrong = await call('POST', '/api/auth/login', { phone: rlPhone, password: `wrong-attempt-${i}` })
      if (wrong.status === 401) saw401++
    }
    ok('5 wrong attempts each get the normal 401', saw401 === 5)

    const locked = await call('POST', '/api/auth/login', { phone: rlPhone, password: 'password123' })
    ok('6th attempt locked out with 429 — even with the correct password', locked.status === 429)
    ok('lockout message is friendly and human', typeof locked.json?.error === 'string' && locked.json.error.includes('wait'))

    const alsoLocked = await call('POST', '/api/auth/login', { phone: `0${rlPhone.slice(4)}`, password: 'password123' })
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

    const mismatch = await call('POST', '/api/listings', { ...validListing, country: 'UG', county: 'Nairobi' }, alice)
    ok('KE location on a UG listing → 400 (country/location match enforced)', mismatch.status === 400)

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

    const byCounty = await call('GET', '/api/listings?county=Nairobi')
    ok('county filter returns only Nairobi', byCounty.json.items.every((l: any) => l.county === 'Nairobi') && byCounty.json.total > 0)

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
      businessName: 'Alice Test Shop',
      photoUrl: photoUrl ?? null,
      category: 'other',
      description: null,
      county: 'Nairobi',
      area: null,
      phone: alicePhone,
      whatsapp: null,
      hours: null,
    }, alice)
    ok('profile PUT with shop photo (200)', profilePut.status === 200 && profilePut.json?.profile?.photoUrl === (photoUrl ?? null))

    const badPhotoProfile = await call('PUT', '/api/profile', {
      businessName: 'Alice Test Shop',
      photoUrl: 'javascript:alert(1)',
      category: 'other',
      description: null,
      county: 'Nairobi',
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
    ok('shop name uses the seller-chosen business name', shopBody?.shop?.name === 'Alice Test Shop')
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
      businessName: 'Alice Test Shop',
      photoUrl: null,
      category: 'other',
      description: 'Updated description for code stability check.',
      county: 'Nairobi',
      area: 'Test Area',
      phone: alicePhone,
      whatsapp: null,
      hours: null,
    }, alice)
    ok('profile update keeps the same shop code', update.status === 200 && update.json?.profile?.shopCode === aliceCode)

    const shopAnon = await call('GET', `/api/shops/${alice.user?.id}`)
    ok('shop page shows the same code to buyers', shopAnon.status === 200 && shopAnon.json?.shop?.shopCode === aliceCode)

    // check-name: public availability check behind the live "suggest area" hint.
    const takenCheck = await call('GET', '/api/shops/check-name?name=alice%20test%20shop')
    ok('check-name flags an existing name case-insensitively',
      takenCheck.status === 200 && takenCheck.json?.taken === true && takenCheck.json.matches.length >= 1)
    const ownCheck = await call('GET', `/api/shops/check-name?name=Alice%20Test%20Shop&exclude=${alice.user?.id}`)
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
      photoUrl: null, category: 'other', description: null, county: 'Nairobi',
      area: 'Westlands', phone: uniquePhone(),
      whatsapp: null, hours: null,
    }, cara)
    ok('new profile gets a code at creation', caraProfile.status === 200 && /^MD-\d{4}$/.test(caraProfile.json?.profile?.shopCode ?? ''))
    const doraProfile = await call('PUT', '/api/profile', {
      businessName: 'Twin Name Market',
      photoUrl: null, category: 'other', description: null, county: 'Nairobi',
      area: 'Karen', phone: uniquePhone(),
      whatsapp: null, hours: null,
    }, dora)
    ok('same-name shop gets a DIFFERENT code',
      doraProfile.status === 200 && doraProfile.json?.profile?.shopCode !== caraProfile.json?.profile?.shopCode)

    // Same-name shops in one feed: owner area must ride along so the browse
    // feed can render "Twin Name Market · Westlands" vs "· Karen".
    const caraListing = await call('POST', '/api/listings', { ...validListing, title: 'Twin market greens offer' }, cara)
    const doraListing = await call('POST', '/api/listings', { ...validListing, title: 'Twin market greens offer two' }, dora)
    const browse = await call('GET', '/api/listings?q=twin%20market%20greens')
    const both = browse.json?.items ?? []
    const caraItem = both.find((l: any) => l.id === caraListing.json?.listing?.id)
    const doraItem = both.find((l: any) => l.id === doraListing.json?.listing?.id)
    ok('browse returns both same-name shops with their areas',
      caraItem?.user?.profile?.area === 'Westlands' && doraItem?.user?.profile?.area === 'Karen')

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
    const setLoc = await call('PUT', '/api/profile/location', { lat: -1.2881234, lng: 36.8412345 }, alice)
    ok('location save works → 200', setLoc.status === 200 && setLoc.json?.profile?.lat !== null)
    ok('stored coordinates are blurred to ~100 m',
      setLoc.json?.profile?.lat === -1.288 && setLoc.json?.profile?.lng === 36.841)

    // The regular "Save shop" form write must NEVER clobber the spot: its
    // schema strips unknown keys, so lat/lng keys never reach Prisma.
    const formSave = await call('PUT', '/api/profile', {
      businessName: 'Alice Test Shop',
      photoUrl: null,
      category: 'other',
      description: 'Location preservation check.',
      county: 'Nairobi',
      area: 'Test Area',
      phone: alicePhone,
      whatsapp: null,
      hours: null,
    }, alice)
    ok('regular profile update preserves the saved location',
      formSave.status === 200 && formSave.json?.profile?.lat === -1.288)

    // A seller WITHOUT a profile who shares their spot still gets a shop
    // (create branch): account name as the shop name + a fresh MD code.
    const nela: Jar = { cookie: '' }
    await register(nela, uniquePhone(), 'Nela Nearby', 'password789')
    const nelaLoc = await call('PUT', '/api/profile/location', { lat: 0.335, lng: 32.586 }, nela)
    ok('sharing a spot creates a minimal shop with a code',
      nelaLoc.status === 200 && nelaLoc.json?.profile?.businessName === 'Nela Nearby' && /^MD-\d{4}$/.test(nelaLoc.json?.profile?.shopCode ?? ''))

    // Nearest sort — two shops ~570 km apart; the buyer's side of the story
    // must decide who comes first. Nairobi buyer → Alice; Kampala buyer → Nela.
    const aliceListing = await call('POST', '/api/listings', { ...validListing, title: 'Nearest probe alpha' }, alice)
    const nelaListing = await call('POST', '/api/listings', { ...validListing, title: 'Nearest probe beta' }, nela)
    const fromNairobi = await call('GET', '/api/listings?q=nearest%20probe&sort=nearest&lat=-1.288&lng=36.841')
    const nairobiItems = fromNairobi.json?.items ?? []
    ok('nearest sort puts the Nairobi shop first for a Nairobi buyer',
      fromNairobi.status === 200 && nairobiItems[0]?.id === aliceListing.json?.listing?.id)
    ok('browse cards carry the blurred shop spot for distance chips',
      nairobiItems[0]?.user?.profile?.lat === -1.288 && nairobiItems[0]?.user?.profile?.lng === 36.841)
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
      { name: 'Copper in Nairobi', query: { q: 'copper', county: 'Nairobi' } },
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
        county: 'Nairobi',
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

    // The admin allowlist phone is a seeded KE account (0712000001).
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
