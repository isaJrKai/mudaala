/**
 * Backfill: shop codes for Mudaala. Two jobs:
 *
 *  1. MIGRATE - every existing DK-XXXX code becomes MD-XXXX with the SAME
 *     digits. The digits are the shop's identity (printed posters, word of
 *     mouth, saved notes), so only the prefix moves; the lookup API accepts
 *     both prefixes for the same reason.
 *  2. ASSIGN - every business profile without a code gets a fresh MD-XXXX.
 *
 * Safe to re-run: MD- codes are left untouched, digits never change.
 *
 * Run: npx tsx scripts/backfill-shop-codes.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// Same rules as src/lib/shop.ts - duplicated here so the script stays a
// standalone artifact that does not import server code.
function newCandidate(): string {
  return `MD-${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`
}

async function main() {
  // 1. MIGRATE legacy DK- codes - prefix-only rewrite, digits preserved.
  const legacy = await db.businessProfile.findMany({
    where: { shopCode: { startsWith: 'DK-' } },
    select: { id: true, businessName: true, shopCode: true },
  })
  let migrated = 0
  for (const profile of legacy) {
    const next = profile.shopCode!.replace(/^DK-/, 'MD-')
    // Digits are untouched, so an MD- clash can only exist if a previous
    // partial run handed the same digits out twice - re-check to be safe.
    const clash = await db.businessProfile.findFirst({
      where: { shopCode: next, id: { not: profile.id } },
      select: { id: true },
    })
    if (clash) {
      console.error(`  ✗ ${profile.businessName}: ${next} already taken - skipping`)
      continue
    }
    await db.businessProfile.update({ where: { id: profile.id }, data: { shopCode: next } })
    migrated++
    console.log(`  ✓ ${profile.businessName}: ${profile.shopCode} → ${next}`)
  }

  // 2. ASSIGN codes to profiles that have none.
  const pending = await db.businessProfile.findMany({
    where: { shopCode: null },
    select: { id: true, businessName: true },
  })
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

  console.log(`Migrated ${migrated} legacy codes, assigned ${assigned} of ${pending.length}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
