/**
 * Backfill: assign a public shop code (DK-XXXX) to every business profile
 * that does not have one yet. Codes are unique and, once assigned here or by
 * the profile API, never change — printed posters and word of mouth rely on
 * that. Safe to re-run: profiles with a code are left untouched.
 *
 * Run: npx tsx scripts/backfill-shop-codes.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// Same rules as src/lib/shop.ts — duplicated here so the script stays a
// standalone artifact that does not import server code.
function newCandidate(): string {
  return `DK-${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`
}

async function main() {
  const pending = await db.businessProfile.findMany({
    where: { shopCode: null },
    select: { id: true, businessName: true },
  })

  console.log(`Shops needing a code: ${pending.length}`)
  let assigned = 0

  for (const profile of pending) {
    let code: string | null = null
    // 4 digits = 10,000 slots; collision retries converge fast at any
    // realistic shop count. 200 attempts is a generous safety net.
    for (let attempt = 0; attempt < 200; attempt++) {
      const candidate = newCandidate()
      const clash = await db.businessProfile.findUnique({ where: { shopCode: candidate }, select: { id: true } })
      if (!clash) {
        code = candidate
        break
      }
    }
    if (!code) {
      console.error(`  ✗ ${profile.businessName}: could not find a free code after 200 attempts`)
      continue
    }
    await db.businessProfile.update({ where: { id: profile.id }, data: { shopCode: code } })
    assigned++
    console.log(`  ✓ ${profile.businessName} → ${code}`)
  }

  console.log(`Assigned ${assigned} of ${pending.length}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
