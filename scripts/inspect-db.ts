// One-off: inspect current db state (users + listings) after snapshot restore.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const users = await db.user.findMany({ select: { phone: true, name: true } })
  console.log('users:', users.length)
  console.log(users.map((u) => u.phone).join(', '))
  const listings = await db.listing.count()
  console.log('listings:', listings)
  const shops = await db.shop?.count?.()
  console.log('shops:', shops)
}

main()
  .catch((e) => {
    console.error('INSPECT FAILED:', e.message)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
