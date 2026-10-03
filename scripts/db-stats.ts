import { PrismaClient } from '@prisma/client'
async function main() {
  const p = new PrismaClient()
  const users = await p.user.count()
  const shops = await p.businessProfile.count()
  const listings = await p.listing.findMany({ where: { type: 'OFFER' }, select: { status: true, photos: true } })
  const active = listings.filter((l) => l.status === 'ACTIVE')
  const withPhotos = active.filter((l) => Array.isArray(l.photos) && l.photos.length > 0)
  console.log('STATS', JSON.stringify({ users, shops, offers: listings.length, activeOffers: active.length, activeWithPhotos: withPhotos.length }))
  await p.$disconnect()
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1) })
