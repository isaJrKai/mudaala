/** Post-E2E check: shop coords in the live DB after UI round-trips. */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const kampalamart = await db.businessProfile.findFirst({
    where: { businessName: { contains: 'Kampalamart' } },
    select: { businessName: true, lat: true, lng: true, shopCode: true },
  })
  console.log('Kampalamart:', JSON.stringify(kampalamart))
  const withCoords = await db.businessProfile.count({ where: { lat: { not: null } } })
  const total = await db.businessProfile.count()
  console.log(`Profiles with coords: ${withCoords} / ${total}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
