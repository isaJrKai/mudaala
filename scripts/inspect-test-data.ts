// Inspect leftover test data (Alice duplicates etc.)
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const shops = await db.businessProfile.findMany({
    where: { businessName: { contains: 'Alice Test Shop' } },
    select: { userId: true, businessName: true },
  })
  const users = await db.user.findMany({
    select: { id: true, name: true, phone: true },
  })
  const counts = {
    users: users.length,
    listings: await db.listing.count(),
    profiles: await db.businessProfile.count(),
  }
  console.log(JSON.stringify({ shops, users, counts }, null, 1))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
