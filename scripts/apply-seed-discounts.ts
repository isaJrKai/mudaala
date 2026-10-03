// One-off: add "was" prices (compareAtPrice) to three seeded OFFER listings.
// UPDATE-only - no data is wiped, user ids and sessions stay intact.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const DISCOUNTS: Record<string, number> = {
  'Fresh matooke, wholesale bunches': 22000,
  'Cement 42.5N, 50kg bags': 36000,
  'Sunflower cooking oil, 20L': 65000,
}

async function main() {
  for (const [title, compareAtPrice] of Object.entries(DISCOUNTS)) {
    const row = await db.listing.findFirst({ where: { title }, select: { id: true, price: true } })
    if (!row) {
      console.error(`✗ not found: ${title}`)
      continue
    }
    if (row.price === null || compareAtPrice <= row.price) {
      console.error(`✗ skip "${title}": old price must beat current price (${row.price})`)
      continue
    }
    await db.listing.update({ where: { id: row.id }, data: { compareAtPrice } })
    console.log(`✓ ${title}: now ${row.price}, was ${compareAtPrice}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
