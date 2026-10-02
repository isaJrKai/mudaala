// Dev-only: stage a stale listing (refreshedAt backdated) to exercise the
// Home freshness tip in the browser. Reverted by re-refreshing via API/UI.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const days = Number(process.argv[2] ?? 9)

async function main() {
  const u = await db.user.findFirst({ where: { phone: '+256772123456' } })
  if (!u) throw new Error('fixture user not found')
  const l = await db.listing.findFirst({ where: { userId: u.id, status: 'ACTIVE', title: { contains: 'matooke' } } })
  if (!l) throw new Error('matooke listing not found')
  await db.listing.update({ where: { id: l.id }, data: { refreshedAt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } })
  console.log(`staged stale (${days}d):`, l.title)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
