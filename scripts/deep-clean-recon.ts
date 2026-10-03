/**
 * Deep-clean recon: list every user/listing/profile with provenance signals
 * (seed flag, creation time, ownership) so the purge set can be chosen
 * precisely - never delete a real human's account by pattern-guessing.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      isSeed: true,
      createdAt: true,
      _count: { select: { listings: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  console.log('== USERS ==')
  for (const u of users) {
    console.log(
      [
        u.isSeed ? 'SEED' : 'real',
        u.createdAt.toISOString().slice(0, 16),
        `${u._count.listings}L`,
        u.name,
        u.phone,
      ].join(' | '),
    )
  }

  const listings = await db.listing.findMany({
    select: { id: true, title: true, isSeed: true, createdAt: true, status: true, user: { select: { name: true, isSeed: true } } },
    orderBy: { createdAt: 'desc' },
    take: 90,
  })
  console.log('\n== LISTINGS (newest first) ==')
  for (const l of listings) {
    console.log(
      [
        l.isSeed ? 'SEED' : 'real',
        l.createdAt.toISOString().slice(0, 16),
        l.status,
        JSON.stringify(l.title),
        `owner=${l.user?.name ?? '?'}`,
      ].join(' | '),
    )
  }

  const counts = {
    users: await db.user.count(),
    listings: await db.listing.count(),
    profiles: await db.businessProfile.count(),
    notifications: await db.notification.count(),
    sessions: await db.session.count(),
    reports: await db.report.count(),
    audits: await db.auditLog.count(),
    snapshots: await db.priceSnapshot.count(),
  }
  console.log('\n== COUNTS ==', counts)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
