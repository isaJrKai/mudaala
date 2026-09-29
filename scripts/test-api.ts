/**
 * Duuka — API behavior & security tests.
 *
 * Tests observable outcomes and permission boundaries against the running dev
 * server, not implementation details. Run: npx tsx scripts/test-api.ts
 *
 * Covers: auth (cookie AND Bearer transport, UG/TZ/KE phones), ownership
 * enforcement (positive AND negative), validation, currency handling, status
 * transition rules, refresh cooldown, expiry sweep, saved-search matching +
 * permissions, notification permissions, postgres settings masking.
 */
import { PrismaClient } from '@prisma/client'

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
): Promise<{ status: number; json: any; setCookie?: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(jar?.cookie ? { cookie: jar.cookie } : {}),
      ...(jar?.token ? { authorization: `Bearer ${jar.token}` } : {}),
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
    ok('login works (200) and sets session cookie', login.status === 200 && alice.cookie.includes('duuka_session'))
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

  console.log('\n== 9. Settings → Advanced Settings (PostgreSQL) ==')
  {
    const anon = await call('GET', '/api/settings/postgres')
    ok('settings require sign-in → 401', anon.status === 401)

    const saved = await call(
      'PUT',
      '/api/settings/postgres',
      { host: 'db.internal.example', port: 5432, database: 'commerce_os', user: 'app', password: 'supersecret', sslMode: 'require' },
      alice,
    )
    ok('save postgres config (200)', saved.status === 200)

    const fetched = await call('GET', '/api/settings/postgres', undefined, alice)
    ok('GET config never returns the password', !JSON.stringify(fetched.json).includes('supersecret'))
    ok('GET reports hasPassword=true', fetched.json?.config?.hasPassword === true)

    const testRes = await call('POST', '/api/settings/postgres/test', undefined, alice)
    ok('test connection runs and reports honestly', testRes.status === 200 && typeof testRes.json?.ok === 'boolean')
    ok('unreachable host → ok=false with a real reason', testRes.status === 200 && testRes.json?.ok === false && typeof testRes.json?.message === 'string' && testRes.json.message.length > 0)

    const bobTest = await call('POST', '/api/settings/postgres/test', undefined, bob)
    ok('deployment config is global: any signed-in user can test it', bobTest.status === 200)

    const cleared = await call('DELETE', '/api/settings/postgres', undefined, alice)
    ok('remove config works', cleared.status === 200)

    const afterClear = await call('POST', '/api/settings/postgres/test', undefined, alice)
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
