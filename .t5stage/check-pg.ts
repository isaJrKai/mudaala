import { PrismaClient } from '@prisma/client'
async function main() {
  const db = new PrismaClient()
  const demo = await db.user.findMany({ where: { phone: { contains: '772123456' } }, select: { id: true, phone: true } })
  console.log('demo-phone users in PG:', JSON.stringify(demo))
  console.log('total users:', await db.user.count())
  await db.$disconnect()
}
main()
