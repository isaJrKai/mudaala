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
  '+255712345678',
  '+254712000001',
  '+254712000002',
  '+254712000003',
  '+254712000004',
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

  console.log('Remaining users:', await db.user.count())
  console.log('Remaining listings:', await db.listing.count())
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
