import { PrismaClient } from '@prisma/client'
async function main() {
  const p = new PrismaClient()
  const top = await p.listing.findMany({
    where: { status: 'ACTIVE', category: 'scrap-recyclables' },
    orderBy: { refreshedAt: 'desc' },
    take: 6,
    select: { id: true, title: true, refreshedAt: true, userId: true, photos: true },
  })
  for (const t of top) console.log(t.refreshedAt.toISOString(), t.id, JSON.stringify(t.title).slice(0, 60), 'photos:', t.photos.slice(0, 30))
  await p.$disconnect()
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1) })
