/**
 * Mudaala — development seed.
 *
 * These are DEVELOPMENT FIXTURES for reviewing the product, clearly labeled as
 * such in the repository. Fixture users have demo passwords and 0000xxx phone
 * numbers. Production must never run this seed.
 *
 * PLACEHOLDER RULE: the seed ships NO photos — not listings, not shop covers.
 * Every surface falls back to the neutral grey tile (category name / shop
 * name + camera icon). No stock, no AI images, nothing to migrate: seed rows
 * are flagged isSeed and removed in one step pre-launch (remove-seed-data.ts).
 *
 * The ads are written the way real sellers write: short, direct, sometimes
 * capitals, always with a phone line. Areas are real market places (Owino,
 * Nakasero, Kisenyi, Ntinda).
 *
 * Run: bun scripts/seed.ts   (with the sandbox Postgres DATABASE_URL)
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'node:crypto'
import { LISTING_ACTIVE_DAYS } from '../src/lib/constants'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000)

interface SeedListing {
  ownerIdx: number
  type: 'OFFER' | 'REQUEST'
  title: string
  description: string
  category: string
  price: number | null
  compareAtPrice?: number | null // optional "was" price — renders as a discount
  currency?: string
  priceNegotiable?: boolean
  unit: string | null
  quantity: number | null
  county: string
  country: string
  area: string | null
  refreshedHoursAgo: number
  views: number
  status?: string
  expiresInDaysOverride?: number
}

const users = [
  // Uganda — the one market Mudaala serves. All fixtures are Ugandan shops
  // with Ugandan phone numbers and real district placement. No shop photos:
  // the grey tile stands in until a real seller uploads a real photo.
  { name: 'Nakato Fresh Produce', phone: '+256772123456', country: 'UG', profile: { businessName: 'Nakato Fresh Produce', photoUrl: null, category: 'farm-produce', county: 'Kampala', area: 'Nakasero', description: 'Fresh matooke and vegetables from farms around Mpigi. Wholesale and retail. Call or WhatsApp 0772 123 456.', hours: 'Daily, 6am-6pm', lat: 0.334, lng: 32.585 } },
  { name: 'Kisenyi Scrap Dealers', phone: '+256776123456', country: 'UG', profile: { businessName: 'Kisenyi Scrap Dealers', photoUrl: null, category: 'scrap-recyclables', county: 'Kampala', area: 'Kisenyi', description: 'We buy copper, brass, aluminium and plastics. Honest weighing on a certified scale, same-day payment. 0776 123 456.', hours: 'Mon-Sat, 7am-5pm', lat: 0.316, lng: 32.571 } },
  { name: 'Jinja Hardware Centre', phone: '+256758123456', country: 'UG', profile: { businessName: 'Jinja Hardware Centre', photoUrl: null, category: 'hardware-building', county: 'Jinja', area: 'Kimaka', description: 'Cement, iron sheets, steel bars and general hardware. Friendly prices, delivery around Jinja. 0758 123 456.', hours: 'Mon-Sat, 8am-6pm', lat: 0.443, lng: 33.244 } },
  { name: 'Gulu Agri Supplies', phone: '+256712000001', country: 'UG', profile: { businessName: 'Gulu Agri Supplies', photoUrl: null, category: 'farm-produce', county: 'Gulu', area: 'Pece', description: 'Cooking oil, beans and maize supplied to shops and institutions around Gulu. Weighing in the open, prices marked. 0712 000 001.', hours: 'Mon-Sat, 7am-5pm', lat: 2.774, lng: 32.299 } },
  { name: 'Mbale Flour Millers', phone: '+256702234567', country: 'UG', profile: { businessName: 'Mbale Flour Millers', photoUrl: null, category: 'food-groceries', county: 'Mbale', area: 'Wanale', description: 'Millers of wheat and maize flour for shops and institutions around Mbale. Offcut firewood from our pallets sold cheap. 0702 234 567.', hours: 'Mon-Fri, 8am-4pm', lat: 1.082, lng: 34.175 } },
  { name: 'Ntinda Home & Kitchen', phone: '+256703234567', country: 'UG', profile: { businessName: 'Ntinda Home & Kitchen', photoUrl: null, category: 'home-kitchen', county: 'Kampala', area: 'Ntinda', description: 'Charcoal by the sack, gas refills, cookware and stoves for homes and chapati vendors around Ntinda. 0703 234 567.', hours: 'Daily, 7am-8pm', lat: 0.352, lng: 32.613 } },
  { name: 'Masaka Chapati Supplies', phone: '+256704234567', country: 'UG', profile: { businessName: 'Masaka Chapati Supplies', photoUrl: null, category: 'food-groceries', county: 'Masaka', area: 'Kyabakuza', description: 'Wholesale supplies for chapati and mandazi vendors around Masaka. Cooking oil, charcoal and packing flour. 0704 234 567.', hours: 'Daily, 6am-2pm', lat: -0.344, lng: 31.734 } },
  { name: 'Owino Second Hand', phone: '+256705234567', country: 'UG', profile: { businessName: 'Owino Second Hand', photoUrl: null, category: 'textiles-clothing', county: 'Kampala', area: 'Owino', description: 'Original mixed bales opened in front of you at our Owino stall. Ladies, gents and children mixes. 0705 234 567.', hours: 'Mon-Sat, 7am-6pm', lat: 0.311, lng: 32.57 } },
]

const listings: SeedListing[] = [
  // Uganda (UGX). Seller voice: short, direct, sometimes capitals, phone line.
  { ownerIdx: 0, type: 'OFFER', title: 'FRESH MATOOKE from Mpigi', description: 'Green matooke, big bunches from 8kg. Hand-picked this morning.\nUSh 18,000 per bunch, was 22,000.\nCall or WhatsApp 0772 123 456. Delivery around Kampala, or bring your own transport.', category: 'farm-produce', price: 18000, compareAtPrice: 22000, currency: 'UGX', unit: 'bunch', quantity: 250, county: 'Kampala', country: 'UG', area: 'Nakasero', refreshedHoursAgo: 3, views: 41 },
  { ownerIdx: 0, type: 'OFFER', title: 'Grade A eggs in crates of 30', description: 'Eggs from our layers in Mukono, collected daily.\nUSh 12,000 per crate of 30. 180 crates ready.\nCall 0772 123 456. Nakasero market gate.', category: 'farm-produce', price: 12000, currency: 'UGX', unit: 'crate', quantity: 180, county: 'Kampala', country: 'UG', area: null, refreshedHoursAgo: 6, views: 27 },
  { ownerIdx: 1, type: 'OFFER', title: 'COPPER SCRAP 99.5% clean', description: 'Clean copper wire scrap, no insulation, sorted and ready.\nUSh 20,000 per kg on the certified scale, weighed in front of you.\nKisenyi yard, call 0776 123 456. Same-day mobile money.', category: 'scrap-recyclables', price: 20000, currency: 'UGX', unit: 'kg', quantity: 600, county: 'Kampala', country: 'UG', area: 'Kisenyi', refreshedHoursAgo: 2, views: 55 },
  { ownerIdx: 1, type: 'REQUEST', title: 'Aluminium scrap wanted, monthly bulk', description: 'WANTED: aluminium scrap every month. Ingots, sheets, castings.\nWe pay per kg on graded weight, mobile money same day.\nWhatsApp 0776 123 456 with quantity and location.', category: 'scrap-recyclables', price: 6500, currency: 'UGX', unit: 'kg', quantity: 1500, county: 'Kampala', country: 'UG', area: null, refreshedHoursAgo: 20, views: 14 },
  { ownerIdx: 2, type: 'OFFER', title: 'Cement 42.5N, 50kg bags', description: 'Tororo cement 42.5N in 50kg bags, stored dry in our Kimaka godown.\nUSh 32,000 per bag, was 36,000. Discount above 100 bags.\nCall 0758 123 456. Delivery around Jinja town.', category: 'hardware-building', price: 32000, compareAtPrice: 36000, currency: 'UGX', priceNegotiable: true, unit: 'bag', quantity: 900, county: 'Jinja', country: 'UG', area: 'Kimaka', refreshedHoursAgo: 30, views: 33 },
  { ownerIdx: 2, type: 'OFFER', title: 'Iron sheets 30 gauge, 3m', description: 'Pre-painted 30 gauge iron sheets, box profile. Colours in stock: red, green, grey.\nUSh 38,000 per piece for 3 metre lengths.\nCall 0758 123 456. Delivery Jinja and Iganga.', category: 'hardware-building', price: 38000, currency: 'UGX', unit: 'piece', quantity: 320, county: 'Jinja', country: 'UG', area: null, refreshedHoursAgo: 96, views: 19 },
  { ownerIdx: 0, type: 'REQUEST', title: 'Red onions wanted, weekly supply', description: 'Looking for a steady weekly supplier of red onions for our Nakasero stall.\nAt least 300kg per week. Payment on delivery.\nCall 0772 123 456.', category: 'farm-produce', price: 5200, currency: 'UGX', unit: 'kg', quantity: 300, county: 'Kampala', country: 'UG', area: null, refreshedHoursAgo: 50, views: 9 },
  // Uganda (UGX) — upcountry fixtures.
  { ownerIdx: 3, type: 'OFFER', title: 'Sunflower cooking oil, 20L jerrycans', description: 'Pure sunflower cooking oil in 20L jerrycans, packed at our Gulu store.\nUSh 130,000 per jerrycan, was 145,000.\nCall 0712 000 001. Delivery around Gulu town for vendors and institutions.', category: 'food-groceries', price: 130000, compareAtPrice: 145000, currency: 'UGX', unit: 'piece', quantity: 120, county: 'Gulu', country: 'UG', area: 'Pece', refreshedHoursAgo: 8, views: 22 },
  { ownerIdx: 3, type: 'OFFER', title: 'Dry maize grade 1', description: 'Grade 1 dry maize, moisture 13%, this season harvest around Agago.\nUSh 1,100 per kg, or per tonne with weighing at our Pece store.\nCall 0712 000 001.', category: 'farm-produce', price: 1100, currency: 'UGX', unit: 'kg', quantity: 15000, county: 'Gulu', country: 'UG', area: null, refreshedHoursAgo: 60, views: 47 },
  { ownerIdx: 4, type: 'OFFER', title: 'Wheat flour premium, 50kg bags', description: 'Baking-grade wheat flour, milled this week at our Wanale mill.\nUSh 185,000 per 50kg bag, negotiable.\nFree delivery in Mbale town above 20 bags. Call 0702 234 567.', category: 'food-groceries', price: 185000, currency: 'UGX', priceNegotiable: true, unit: 'bag', quantity: 120, county: 'Mbale', country: 'UG', area: 'Wanale', refreshedHoursAgo: 24, views: 21 },
  { ownerIdx: 4, type: 'OFFER', title: 'Offcut firewood bundles for ovens', description: 'Split eucalyptus firewood bundles from pallet offcuts at the mill.\nDry and long burning, about 20kg per bundle. USh 7,000.\nCall 0702 234 567. Institutions and ovens welcome.', category: 'other', price: 7000, currency: 'UGX', unit: 'bunch', quantity: 500, county: 'Mbale', country: 'UG', area: 'Wanale', refreshedHoursAgo: 768, views: 11, expiresInDaysOverride: -1 },
  { ownerIdx: 5, type: 'OFFER', title: 'CHARCOAL sacks 50kg, acacia hardwood', description: 'Hardwood acacia charcoal, long burning, packed in 50kg sacks.\nUSh 35,000 per sack. 80 sacks at the shop.\nCall or WhatsApp 0703 234 567. Ntinda, opposite the market.', category: 'home-kitchen', price: 35000, currency: 'UGX', unit: 'sack', quantity: 80, county: 'Kampala', country: 'UG', area: 'Ntinda', refreshedHoursAgo: 4, views: 38 },
  { ownerIdx: 5, type: 'OFFER', title: 'Gas cylinder 13kg refill', description: 'Gas refill 13kg while you wait, also 6kg and 3kg.\nUSh 65,000 for the 13kg.\nCall 0703 234 567. Ntinda Home & Kitchen, open daily 7am-8pm.', category: 'home-kitchen', price: 65000, currency: 'UGX', unit: 'piece', quantity: 40, county: 'Kampala', country: 'UG', area: 'Ntinda', refreshedHoursAgo: 7, views: 25 },
  { ownerIdx: 6, type: 'REQUEST', title: 'Cooking oil 20L needed weekly', description: 'WANTED: consistent weekly supplier of cooking oil in 20L jerrycans for our chapati vendors around Masaka.\nAbout 15 jerrycans a week, payment on delivery.\nWhatsApp 0704 234 567. Kyabakuza and Kijabwemi.', category: 'food-groceries', price: 135000, currency: 'UGX', unit: 'piece', quantity: 15, county: 'Masaka', country: 'UG', area: 'Kyabakuza', refreshedHoursAgo: 72, views: 8 },
  { ownerIdx: 6, type: 'OFFER', title: 'Charcoal 50kg sacks, acacia', description: 'Hardwood acacia charcoal in 50kg sacks, long burning.\nUSh 33,000 per sack. Delivery for 10 sacks and above within Masaka town.\nCall 0704 234 567.', category: 'home-kitchen', price: 33000, currency: 'UGX', unit: 'sack', quantity: 80, county: 'Masaka', country: 'UG', area: 'Kyabakuza', refreshedHoursAgo: 240, views: 39, status: 'FULFILLED' },
  { ownerIdx: 7, type: 'OFFER', title: 'Second-hand clothes bales, original mixed', description: 'ORIGINAL mixed bales, unopened, opened in front of you at our Owino stall.\nLadies, gents and children mixes. USh 155,000 per bale, negotiable.\nCall 0705 234 567. Payment after opening.', category: 'textiles-clothing', price: 155000, currency: 'UGX', priceNegotiable: true, unit: 'bale', quantity: 40, county: 'Kampala', country: 'UG', area: 'Owino', refreshedHoursAgo: 48, views: 63 },
]

const savedSearches = [
  { userIdx: 0, name: 'Copper scrap in Kampala', query: { q: 'copper', county: 'Kampala' } },
  { userIdx: 4, name: 'Maize offers', query: { q: 'maize', type: 'OFFER' as const } },
]

async function main() {
  console.log('Seeding Mudaala development fixtures…')
  await db.notification.deleteMany()
  await db.savedSearch.deleteMany()
  await db.listing.deleteMany()
  await db.businessProfile.deleteMany()
  await db.session.deleteMany()
  await db.user.deleteMany()

  const createdUsers: { id: string; phone: string }[] = []
  for (const u of users) {
    const user = await db.user.create({
      // PLACEHOLDER RULE — every row the seed creates is flagged isSeed so
      // scripts/remove-seed-data.ts can delete it in one step pre-launch.
      data: { name: u.name, phone: u.phone, country: u.country, passwordHash: hashPassword('demo1234'), isSeed: true },
    })
    // Same rule as src/lib/shop.ts: a unique MD-XXXX identity code, assigned
    // once and never changed. (Local copy — scripts stay standalone.)
    let shopCode = ''
    for (let attempt = 0; attempt < 200; attempt++) {
      const candidate = `MD-${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`
      const clash = await db.businessProfile.findUnique({ where: { shopCode: candidate }, select: { id: true } })
      if (!clash) {
        shopCode = candidate
        break
      }
    }
    if (!shopCode) throw new Error('seed: could not allocate a shop code')
    await db.businessProfile.create({ data: { userId: user.id, phone: u.phone, whatsapp: u.phone, verified: false, shopCode, isSeed: true, ...u.profile } })
    createdUsers.push(user)
  }

  for (const l of listings) {
    const refreshedAt = hoursAgo(l.refreshedHoursAgo)
    const expiresAt = new Date(refreshedAt.getTime() + (l.expiresInDaysOverride !== undefined ? l.expiresInDaysOverride : LISTING_ACTIVE_DAYS) * 86_400_000)
    await db.listing.create({
      data: {
        userId: createdUsers[l.ownerIdx].id,
        type: l.type,
        title: l.title,
        description: l.description,
        category: l.category,
        price: l.price,
        compareAtPrice: l.compareAtPrice ?? null,
        currency: l.currency ?? 'UGX',
        priceNegotiable: l.priceNegotiable ?? false,
        unit: l.unit,
        quantity: l.quantity,
        county: l.county,
        country: l.country,
        area: l.area,
        contactPhone: createdUsers[l.ownerIdx].phone,
        contactWhatsapp: createdUsers[l.ownerIdx].phone,
        // PLACEHOLDER RULE — the seed ships no photos: every ad shows the
        // neutral grey tile until a real seller uploads a real photo.
        photos: JSON.stringify([]),
        isSeed: true,
        status: l.status ?? 'ACTIVE',
        viewCount: l.views,
        publishedAt: refreshedAt,
        refreshedAt,
        expiresAt,
      },
    })
  }

  // Saved searches with honestly computed match counts (same rules as the API).
  for (const s of savedSearches) {
    const where: Record<string, unknown> = { status: 'ACTIVE' }
    if (s.query.q) {
      where.OR = [
        { title: { contains: s.query.q, mode: 'insensitive' } },
        { description: { contains: s.query.q, mode: 'insensitive' } },
        { category: { contains: s.query.q, mode: 'insensitive' } },
        { area: { contains: s.query.q, mode: 'insensitive' } },
        { county: { contains: s.query.q, mode: 'insensitive' } },
      ]
    }
    if ('type' in s.query && s.query.type) where.type = s.query.type
    if ('county' in s.query && s.query.county) where.county = s.query.county
    const total = await db.listing.count({ where: where as never })
    await db.savedSearch.create({
      data: {
        userId: createdUsers[s.userIdx].id,
        name: s.name,
        queryJson: JSON.stringify(s.query),
        lastMatchCount: total,
        lastCheckedAt: new Date(),
      },
    })
    console.log(`  saved search "${s.name}": ${total} real matches`)
  }

  const counts = {
    users: await db.user.count(),
    listings: await db.listing.count(),
    savedSearches: await db.savedSearch.count(),
  }
  console.log('Seed complete:', counts)
  console.log('Fixture passwords are "demo1234" (development only).')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
