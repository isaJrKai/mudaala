/**
 * Removes test-generated rows (test suite + UI test listings) so the app only
 * shows the realistic seeded fixtures. Run: npx tsx scripts/cleanup-test-data.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// Seeded fixture phones — everything else is test pollution.
const SEED_PHONES = [
  '+256772123456',
  '+256776123456',
  '+256758123456',
  '+256712000001',
  '+256702234567',
  '+256703234567',
  '+256704234567',
  '+256705234567',
]

async function main() {
  const users = await db.user.findMany({
    where: { phone: { notIn: SEED_PHONES } },
    select: { id: true, name: true },
  })
  const ids = users.map((u) => u.id)

  if (ids.length > 0) {
    // Sessions cascade; notifications/saved-searches/listings cascade via user delete.
    const delListings = await db.listing.deleteMany({ where: { userId: { in: ids } } })
    const delUsers = await db.user.deleteMany({ where: { id: { in: ids } } })
    console.log(`Removed ${delUsers.count} test users and ${delListings.count} test listings.`)
  } else {
    console.log('No test users found.')
  }

  // Belt and braces: delete any listing with an obviously test-only title.
  const delTitles = await db.listing.deleteMany({
    where: {
      OR: [
        { title: { contains: 'test copper scrap' } },
        { title: { contains: 'Copper radiators clean stock' } },
        { title: { contains: 'Test UI listing' } },
        { title: { contains: 'Expiry sweep test' } },
      ],
    },
  })
  console.log(`Removed ${delTitles.count} extra test-titled listings.`)

  // Notifications left pointing at deleted test listings (e.g. NEW_MATCH
  // alerts the suite fired at fixture users) are pollution too — the Home
  // dashboard counts them. Only records whose listing is really gone go.
  const liveListings = await db.listing.findMany({ select: { id: true } })
  const liveIds = liveListings.map((l) => l.id)
  const delDangling = await db.notification.deleteMany({
    where: { listingId: { not: null }, ...(liveIds.length > 0 ? { NOT: { listingId: { in: liveIds } } } : {}) },
  })
  console.log(`Removed ${delDangling.count} notifications pointing at deleted listings.`)

  // Price snapshots are pure derived data (rebuilt from ACTIVE listings by
  // the cron sweep) — after test listings vanish, today's medians would be
  // stale, so clear them all and let the sweep rebuild honestly.
  const delSnapshots = await db.priceSnapshot.deleteMany({})
  console.log(`Removed ${delSnapshots.count} price snapshots (derived data; the sweep rebuilds them).`)

  console.log('Remaining users:', await db.user.count())
  console.log('Remaining listings:', await db.listing.count())
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
