/**
 * Deep clean: removes test-generated rows (test suite + UI test listings) so
 * the app only shows the realistic seeded fixtures. The test suite now sweeps
 * its own fixtures at the end of every run (section 19 of scripts/test-api.ts);
 * this script is the manual sledgehammer for a dev/preview database that was
 * polluted by older runs.
 *
 * Modes:
 *   npx tsx scripts/cleanup-test-data.ts           # dry-run: report only
 *   npx tsx scripts/cleanup-test-data.ts --yes     # DELETE test rows
 *
 * Safety: seed rows are identified by the demo phones parsed straight out of
 * scripts/seed.ts source (never executed, can never drift) plus isSeed=true.
 * Everything else is treated as test data — so run this ONLY while every real
 * account still lives outside the shared dev database. The dry-run report
 * prints exactly who is about to be removed; verify no human is in it.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const YES = process.argv.includes('--yes')

/** Parse the demo phone numbers straight out of scripts/seed.ts source, the
 *  same trick remove-seed-data.ts uses so the two never drift apart. */
async function seedPhonesFromSource(): Promise<string[]> {
  const file = path.join(process.cwd(), 'scripts', 'seed.ts')
  const src = await fs.readFile(file, 'utf8').catch(() => '')
  return [...new Set([...src.matchAll(/phone:\s*'\+(\d{6,15})'/g)].map((m) => `+${m[1]}`))]
}

async function main() {
  const seedPhones = await seedPhonesFromSource()
  const users = await db.user.findMany({
    where: { phone: { notIn: seedPhones }, isSeed: false },
    select: { id: true, name: true, createdAt: true, _count: { select: { listings: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const ids = users.map((u) => u.id)

  console.log('== Test-data report ==')
  console.log(`seed phones (kept):    ${seedPhones.length}`)
  console.log(`test users (removing): ${ids.length}`)
  for (const u of users) {
    console.log(`  - ${u.name} | ${u._count.listings} listing(s) | ${u.createdAt.toISOString().slice(0, 16)}`)
  }
  const testListings = await db.listing.count({ where: { userId: { in: ids } } })
  console.log(`test listings owned:   ${testListings}`)

  if (!YES) {
    console.log('\nDRY-RUN — nothing was deleted. Re-run with --yes to remove everything above.')
    await db.$disconnect()
    return
  }

  if (ids.length > 0) {
    // Report/audit rows by or about test users and their listings/shops must
    // go first (their FKs do not all cascade), then the users — cascades take
    // listings, shops, sessions, saved searches, notifications, resets.
    const ownedListings = await db.listing.findMany({ where: { userId: { in: ids } }, select: { id: true } })
    const ownedShops = await db.businessProfile.findMany({ where: { userId: { in: ids } }, select: { id: true } })
    const targetIds = [...ownedListings, ...ownedShops].map((r) => r.id)
    const delReports = await db.report.deleteMany({
      where: {
        OR: [
          { reporterId: { in: ids } },
          ...(targetIds.length ? [{ targetId: { in: targetIds } }] : []),
        ],
      },
    })
    const delAudits = await db.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: ids } },
          ...(targetIds.length ? [{ targetId: { in: targetIds } }] : []),
        ],
      },
    })
    const delUsers = await db.user.deleteMany({ where: { id: { in: ids } } })
    console.log(`Removed ${delUsers.count} test users, ${delReports.count} report row(s), ${delAudits.count} audit row(s).`)
  } else {
    console.log('No test users found.')
  }

  // Notifications left pointing at deleted test listings (e.g. NEW_MATCH
  // alerts the suite fired at real users) are pollution too — the Home
  // dashboard counts them. Only records whose listing is really gone go.
  const liveListings = await db.listing.findMany({ select: { id: true } })
  const liveIds = liveListings.map((l) => l.id)
  const delDangling = await db.notification.deleteMany({
    where: { listingId: { not: null }, ...(liveIds.length > 0 ? { NOT: { listingId: { in: liveIds } } } : {}) },
  })
  console.log(`Removed ${delDangling.count} notifications pointing at deleted listings.`)

  // Price snapshots are pure derived data (rebuilt from ACTIVE listings by
  // the cron sweep) — after test listings vanish, today's medians would be
  // stale, so clear them all and let the sweep rebuild honestly.
  const delSnapshots = await db.priceSnapshot.deleteMany({})
  console.log(`Removed ${delSnapshots.count} price snapshots (derived data; the sweep rebuilds them).`)

  // ---- Verify: only seed rows remain ----
  const leftovers = {
    testUsers: await db.user.count({ where: { phone: { notIn: seedPhones }, isSeed: false } }),
    nonSeedListings: await db.listing.count({ where: { isSeed: false } }),
  }
  if (Object.values(leftovers).some((n) => n !== 0)) {
    console.error('VERIFICATION FAILED — test traces remain:', leftovers)
    process.exit(1)
  }
  console.log('\nVerified: only seed users and seed listings remain.')
  console.log('Remaining users:', await db.user.count())
  console.log('Remaining listings:', await db.listing.count())
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
