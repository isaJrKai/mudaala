import { PrismaClient } from '@prisma/client'
async function main() {
  const p = new PrismaClient()
  const l = await p.listing.findFirst({ where: { status: 'ACTIVE' }, select: { id: true }, orderBy: { createdAt: 'desc' } })
  const s = await p.businessProfile.findFirst({ where: { shopCode: { not: null } }, select: { shopCode: true } })
  console.log('RESULT ' + JSON.stringify({ listingId: l ? l.id : null, shopCode: s ? s.shopCode : null }))
  await p.$disconnect()
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1) })
