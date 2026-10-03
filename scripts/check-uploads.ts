import { PrismaClient } from '@prisma/client'
async function main() {
  const p = new PrismaClient()
  const rows = await p.listing.findMany({ select: { photos: true } })
  const blob = rows.map((r) => r.photos).join('|')
  const files = ['2da8c3a3-82fa6795a0934432', '6e973cdd-df5e8d6e1757adf4', 'f00db23a-d6247f057ffb63c0', 'f1752a98-087a646c76a6ec6a', 'fba3d461-551bbb34c09b73c3']
  const orphans = files.filter((f) => !blob.includes(f))
  console.log('ORPHANS ' + JSON.stringify(orphans))
  await p.$disconnect()
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1) })
