/**
 * Mudaala — PLACEHOLDER RULE: one-step seed removal.
 *
 * Every photo in the app today (seed listings, seed shop photos,
 * public/uploads/seed, hero images) is a TEMPORARY PLACEHOLDER that will be
 * replaced with real photos taken by real shops. Seed rows are flagged
 * isSeed = true by scripts/seed.ts; this script removes everything seed in
 * ONE step before launch — seed listings, seed photos, seed shops, seed
 * users — and nothing else. It is safe to run repeatedly.
 *
 * Modes:
 *   npx tsx scripts/remove-seed-data.ts           # dry-run: report only
 *   npx tsx scripts/remove-seed-data.ts --mark    # flag legacy seed rows (no deletion)
 *   npx tsx scripts/remove-seed-data.ts --yes     # DELETE seed rows + seed photo files
 *
 * Legacy rows: data seeded before the isSeed flag existed carries no flag,
 * so seed users are ALSO identified by (a) the demo phone numbers defined in
 * scripts/seed.ts (parsed from the file — never executed) and (b) any photo
 * URL pointing into /uploads/seed/. `--mark` stamps those rows isSeed=true;
 * the dry-run and --yes always consider both sets.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const SEED_DIR = path.join(process.cwd(), 'public', 'uploads', 'seed')
const SEED_PATH = '/uploads/seed/'
const MARK = process.argv.includes('--mark')
const YES = process.argv.includes('--yes')

/** Parse the demo phone numbers straight out of scripts/seed.ts source, so
 *  the two scripts can never drift apart and the seed never has to run. */
async function seedPhonesFromSource(): Promise<string[]> {
  const file = path.join(process.cwd(), 'scripts', 'seed.ts')
  const src = await fs.readFile(file, 'utf8').catch(() => '')
  return [...new Set([...src.matchAll(/phone:\s*'\+(\d{6,15})'/g)].map((m) => `+${m[1]}`))]
}

async function main() {
  const phones = await seedPhonesFromSource()

  // ---- Identify seed users (flagged, or legacy via phone / seed photo) ----
  const flaggedUsers = await db.user.findMany({ where: { isSeed: true }, select: { id: true } })
  const phoneUsers = phones.length
    ? await db.user.findMany({ where: { phone: { in: phones } }, select: { id: true } })
    : []
  const photoProfiles = await db.businessProfile.findMany({
    where: { photoUrl: { contains: SEED_PATH } },
    select: { userId: true, id: true },
  })
  const seedPathListings = await db.listing.findMany({
    where: { photos: { contains: SEED_PATH } },
    select: { id: true, userId: true },
  })

  const seedUserIds = [
    ...new Set([
      ...flaggedUsers.map((u) => u.id),
      ...phoneUsers.map((u) => u.id),
      ...photoProfiles.map((p) => p.userId),
      ...seedPathListings.map((l) => l.userId),
    ]),
  ]
  const legacyUnflagged = seedUserIds.length - flaggedUsers.length

  // Everything owned by those users cascades with the user delete; we still
  // need the ids for the reports/audit rows that POINT at seed targets.
  const seedListings = await db.listing.findMany({
    where: { userId: { in: seedUserIds } },
    select: { id: true },
  })
  const seedProfiles = await db.businessProfile.findMany({
    where: { userId: { in: seedUserIds } },
    select: { id: true, shopCode: true },
  })
  const seedTargetIds = [...seedListings.map((l) => l.id), ...seedProfiles.map((p) => p.id)]

  const seedListingsFlagged = await db.listing.count({ where: { isSeed: true } })
  const orphanSeedPhotosInDb = await db.listing.count({ where: { photos: { contains: SEED_PATH } } })

  console.log('== Seed data report ==')
  console.log(`seed users:            ${seedUserIds.length} (${flaggedUsers.length} flagged, ${legacyUnflagged} legacy unflagged)`)
  console.log(`seed listings owned:   ${seedListings.length} (flagged anywhere: ${seedListingsFlagged})`)
  console.log(`seed shops:            ${seedProfiles.length}`)
  console.log(`rows referencing ${SEED_PATH}: ${orphanSeedPhotosInDb}`)

  if (MARK) {
    const r = await db.$transaction([
      db.user.updateMany({ where: { id: { in: seedUserIds } }, data: { isSeed: true } }),
      db.listing.updateMany({ where: { userId: { in: seedUserIds } }, data: { isSeed: true } }),
      db.businessProfile.updateMany({ where: { userId: { in: seedUserIds } }, data: { isSeed: true } }),
    ])
    console.log(
      `--mark: flagged ${r[0].count} user(s), ${r[1].count} listing(s), ${r[2].count} shop profile(s). No rows deleted.`,
    )
    await db.$disconnect()
    return
  }

  if (!YES) {
    console.log('\nDRY-RUN — nothing was deleted. Re-run with --mark to flag legacy rows, or --yes to remove everything seed.')
    await db.$disconnect()
    return
  }

  // ---- Delete (cascade does the heavy lifting; pointed rows handled first) ----
  const reports = await db.report.deleteMany({
    where: { OR: [{ reporterId: { in: seedUserIds } }, { targetId: { in: seedTargetIds } }] },
  })
  const audits = await db.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: seedUserIds } }, { targetId: { in: seedTargetIds } }] },
  })
  const users = await db.user.deleteMany({ where: { id: { in: seedUserIds } } })
  console.log(`deleted: ${users.count} seed user(s) (with their listings, shops, sessions, searches, notifications)`)
  console.log(`deleted: ${reports.count} report row(s) by or about seed data`)
  console.log(`deleted: ${audits.count} audit row(s) by or about seed data`)

  // Seed photo files: the whole folder is the seed folder marker.
  const removed = await fs.rm(SEED_DIR, { recursive: true, force: true }).then(() => true).catch(() => false)
  console.log(removed ? `deleted: ${SEED_DIR}/ (seed photo files)` : `no seed photo folder at ${SEED_DIR}`)

  // ---- Verify: nothing seed remains, no row references a seed photo path ----
  const leftovers = {
    seedUsers: await db.user.count({ where: { isSeed: true } }),
    seedListings: await db.listing.count({ where: { isSeed: true } }),
    seedProfiles: await db.businessProfile.count({ where: { isSeed: true } }),
    seedPathRefs: (await db.listing.count({ where: { photos: { contains: SEED_PATH } } })) +
      (await db.businessProfile.count({ where: { photoUrl: { contains: SEED_PATH } } })),
  }
  if (Object.values(leftovers).some((n) => n !== 0)) {
    console.error('VERIFICATION FAILED — seed traces remain:', leftovers)
    process.exit(1)
  }
  console.log('\nVerified: zero seed users, listings, shop profiles, or seed photo references remain.')
  await db.$disconnect()
}

main().catch((e) => {
  console.error('remove-seed-data failed:', e)
  process.exit(1)
})
