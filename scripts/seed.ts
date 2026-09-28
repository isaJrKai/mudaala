/**
 * Commerce OS — development seed.
 *
 * These are DEVELOPMENT FIXTURES for reviewing the product, clearly labeled as
 * such in the repository. Fixture users have demo passwords and 0000xxx phone
 * numbers. Production must never run this seed.
 *
 * Run: bun scripts/seed.ts
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
  priceNegotiable?: boolean
  unit: string | null
  quantity: number | null
  county: string
  area: string | null
  refreshedHoursAgo: number
  views: number
  status?: string
  expiresInDaysOverride?: number
}

const users = [
  { name: 'Jomo Scrap Traders', phone: '+254712000001', profile: { businessName: 'Jomo Scrap Traders', category: 'scrap-recyclables', county: 'Nairobi', area: 'Gikomba', description: 'We buy and grade non-ferrous scrap. Same-day payment on verified weights.', hours: 'Mon–Sat, 7am–5pm' } },
  { name: 'Pendo Flour Millers', phone: '+254712000002', profile: { businessName: 'Pendo Flour Millers', category: 'food-groceries', county: 'Nakuru', area: 'Free Area', description: 'Millers of wheat and maize flour for shops and institutions.', hours: 'Mon–Fri, 8am–4pm' } },
  { name: 'Mama Amina Chapati Supplies', phone: '+254712000003', profile: { businessName: 'Mama Amina Chapati Supplies', category: 'food-groceries', county: 'Mombasa', area: 'Kongowea', description: 'Wholesale supplies for chapati and mandazi vendors.', hours: 'Daily, 6am–2pm' } },
  { name: 'Kisumu Fresh Produce', phone: '+254712000004', profile: { businessName: 'Kisumu Fresh Produce', category: 'farm-produce', county: 'Kisumu', area: 'Ahero', description: 'Direct from farms around Ahero. Bulk buyers welcome.', hours: 'Mon–Sat, 6am–6pm' } },
  { name: 'Eldo Hardware & Steel', phone: '+254712000005', profile: { businessName: 'Eldo Hardware & Steel', category: 'hardware-building', county: 'Uasin Gishu', area: 'Kapsoya', description: 'Steel, roofing and general hardware at trade prices.', hours: 'Mon–Sat, 8am–6pm' } },
  { name: 'Nakuru Dairy Collective', phone: '+254712000006', profile: { businessName: 'Nakuru Dairy Collective', category: 'livestock-feed', county: 'Nakuru', area: 'Njoro', description: 'Cooperative of 40 dairy farmers. Chilled collection point in Njoro.', hours: 'Daily, 5am–10am' } },
]

const listings: SeedListing[] = [
  { ownerIdx: 0, type: 'OFFER', title: 'Copper scrap, 99.5% clean', description: 'Clean copper wire scrap, no insulation, sorted and ready. Weighing done on a certified platform scale in front of the seller. Collection from our Gikomba yard.', category: 'scrap-recyclables', price: 620, unit: 'kg', quantity: 850, county: 'Nairobi', area: 'Gikomba', refreshedHoursAgo: 2, views: 34 },
  { ownerIdx: 0, type: 'REQUEST', title: 'Copper wire scrap wanted — bulk', description: 'Buying insulated and bare copper wire monthly. Pay per kg on graded weight, LPO for consistent suppliers. Contact with your available quantity and location.', category: 'scrap-recyclables', price: 650, unit: 'kg', quantity: 2000, county: 'Nairobi', area: null, refreshedHoursAgo: 26, views: 12 },
  { ownerIdx: 1, type: 'OFFER', title: 'Wheat flour premium, 50kg bags', description: 'Baking-grade wheat flour, milled this week. Packed in 50kg bags on pallets. Delivery within Nakuru town free for orders above 20 bags.', category: 'food-groceries', price: 4800, priceNegotiable: true, unit: 'bag', quantity: 120, county: 'Nakuru', area: 'Free Area', refreshedHoursAgo: 24, views: 21 },
  { ownerIdx: 2, type: 'REQUEST', title: 'Cooking oil 20L — weekly supply needed', description: 'Looking for a consistent weekly supplier of cooking oil in 20L jerricans for our chapati vendors. Payment on delivery, Mombasa island and Kongowea.', category: 'food-groceries', price: 5300, unit: 'piece', quantity: 15, county: 'Mombasa', area: 'Kongowea', refreshedHoursAgo: 72, views: 8 },
  { ownerIdx: 3, type: 'OFFER', title: 'Dry maize, grade 1 Ahero', description: 'Grade 1 dry maize, moisture 13.2%, from this season harvest. Sold per kg or per tonne with weighing bridge scales at Ahero. Transport can be arranged.', category: 'farm-produce', price: 58, unit: 'kg', quantity: 12000, county: 'Kisumu', area: 'Ahero', refreshedHoursAgo: 72, views: 45 },
  { ownerIdx: 3, type: 'OFFER', title: 'Fresh eggs in crates', description: 'Grade A fresh eggs collected daily. Sold per crate of 30. Bring your own crates or buy ours at cost.', category: 'farm-produce', price: 420, unit: 'crate', quantity: 300, county: 'Kisumu', area: 'Ahero', refreshedHoursAgo: 4, views: 18 },
  { ownerIdx: 4, type: 'OFFER', title: 'Y12 deformed steel bars, 12mm', description: 'Y12 ribbed steel bars, 12 metre lengths, BS standard. Cut to size on request at no extra charge. Bulk discount above 100 pieces.', category: 'hardware-building', price: 1150, unit: 'piece', quantity: 480, county: 'Uasin Gishu', area: 'Kapsoya', refreshedHoursAgo: 144, views: 27 },
  { ownerIdx: 4, type: 'OFFER', title: 'Mabati roofing sheets 30 gauge', description: 'Pre-painted 30 gauge mabati, box profile, various colours in stock. Per piece price for 3 metre lengths. Delivery within Eldoret.', category: 'hardware-building', price: 950, unit: 'piece', quantity: 200, county: 'Uasin Gishu', area: null, refreshedHoursAgo: 288, views: 31 },
  { ownerIdx: 5, type: 'OFFER', title: 'Raw milk, chilled same-day', description: 'Fresh raw milk from our cooperative members, chilled at collection point. Sold per litre in 50 litre cans. Early morning collection recommended.', category: 'livestock-feed', price: 65, unit: 'litre', quantity: 900, county: 'Nakuru', area: 'Njoro', refreshedHoursAgo: 7, views: 52 },
  { ownerIdx: 0, type: 'OFFER', title: 'Second-hand clothes bales, mixed', description: 'Original mixed bales from our imports, unopened. Per bale price for ladies, gents and children mixes. Opening of bales allowed before payment.', category: 'textiles-clothing', price: 6200, priceNegotiable: true, unit: 'bale', quantity: 40, county: 'Nairobi', area: 'Toi Market', refreshedHoursAgo: 48, views: 63 },
  { ownerIdx: 4, type: 'OFFER', title: 'Solar panels 150W monocrystalline', description: '150W mono panels with 10 year performance warranty. Ideal for boda battery charging and home lighting kits. Few pieces left from this shipment.', category: 'electronics', price: 8900, unit: 'piece', quantity: 25, county: 'Uasin Gishu', area: 'Kapsoya', refreshedHoursAgo: 216, views: 14, expiresInDaysOverride: 2 },
  { ownerIdx: 2, type: 'OFFER', title: 'Charcoal 50kg sacks, acacia', description: 'Hardwood acacia charcoal, long burning, packed in 50kg sacks. Delivery for 10 sacks and above within Mombasa.', category: 'home-kitchen', price: 3800, unit: 'sack', quantity: 80, county: 'Mombasa', area: 'Kongowea', refreshedHoursAgo: 240, views: 39, status: 'FULFILLED' },
  { ownerIdx: 1, type: 'OFFER', title: 'Firewood bundles for lenders', description: 'Split firewood bundles, dry eucalyptus. Ideal for institutions and ovens. Price per bundle of about 20kg.', category: 'other', price: 350, unit: 'bunch', quantity: 500, county: 'Nakuru', area: 'Free Area', refreshedHoursAgo: 768, views: 11, expiresInDaysOverride: -1 },
]

const savedSearches = [
  { userIdx: 1, name: 'Maize in Kisumu', query: { q: 'maize', county: 'Kisumu' } },
  { userIdx: 2, name: 'Flour offers', query: { q: 'flour', type: 'OFFER' as const } },
]

async function main() {
  console.log('Seeding Commerce OS development fixtures…')
  await db.notification.deleteMany()
  await db.savedSearch.deleteMany()
  await db.listing.deleteMany()
  await db.businessProfile.deleteMany()
  await db.session.deleteMany()
  await db.user.deleteMany()

  const createdUsers = []
  for (const u of users) {
    const user = await db.user.create({
      data: { name: u.name, phone: u.phone, passwordHash: hashPassword('demo1234') },
    })
    await db.businessProfile.create({ data: { userId: user.id, phone: u.phone, whatsapp: u.phone, verified: false, ...u.profile } })
    createdUsers.push(user)
  }

  for (const l of listings) {
    const refreshedAt = hoursAgo(l.refreshedHoursAgo)
    const expiresAt = new Date(refreshedAt.getTime() + (l.expiresInDaysOverride !== undefined ? l.expiresInDaysOverride : LISTING_ACTIVE_DAYS) * 86_400_000)
    const searchText = `${l.title} ${l.description} ${l.category} ${l.area ?? ''} ${l.county}`.toLowerCase().replace(/\s+/g, ' ').trim()
    await db.listing.create({
      data: {
        userId: createdUsers[l.ownerIdx].id,
        type: l.type,
        title: l.title,
        description: l.description,
        category: l.category,
        price: l.price,
        priceNegotiable: l.priceNegotiable ?? false,
        unit: l.unit,
        quantity: l.quantity,
        county: l.county,
        area: l.area,
        contactPhone: createdUsers[l.ownerIdx].phone,
        contactWhatsapp: createdUsers[l.ownerIdx].phone,
        status: l.status ?? 'ACTIVE',
        searchText,
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
    if (s.query.q) where.searchText = { contains: s.query.q.toLowerCase() }
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
