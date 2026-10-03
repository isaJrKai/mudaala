/**
 * Backfill: give every business profile without coordinates a plausible shop
 * spot, so "Near me" distances work in the development fixtures immediately.
 * Real sellers set their own spot from Account → My Shop; this only touches
 * seeded demo shops (matched by their known phone numbers) and is safe to
 * re-run: profiles that already have a spot are left untouched.
 *
 * Run: npx tsx scripts/backfill-shop-coords.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// Approximate area centres for the seeded shops - deliberately coarse
// (3 decimals ≈ 100 m), matching what the location API stores for real
// sellers. Nothing here is a verified address; they are demo fixtures.
const SPOTS: Record<string, { lat: number; lng: number }> = {
  '+256772123456': { lat: 0.334, lng: 32.585 }, // Nakato Fresh Produce - Nakasero, Kampala
  '+256776123456': { lat: 0.316, lng: 32.571 }, // Kampalamart - Kisenyi, Kampala
  '+256758123456': { lat: 0.443, lng: 33.244 }, // Jinja Hardware Centre - Kimaka, Jinja
  '+256712000001': { lat: 2.774, lng: 32.299 }, // Gulu Agri Supplies - Pece, Gulu
  '+256702234567': { lat: 1.082, lng: 34.175 }, // Mbale Flour Millers - Wanale, Mbale
  '+256703234567': { lat: -0.607, lng: 30.654 }, // Mbarara Fresh Produce - Nyamitanga, Mbarara
  '+256704234567': { lat: -0.344, lng: 31.734 }, // Masaka Chapati Supplies - Kyabakuza, Masaka
  '+256705234567': { lat: 0.311, lng: 32.57 }, // Owino Second Hand - Owino, Kampala
}

async function main() {
  const pending = await db.businessProfile.findMany({
    where: { lat: null },
    select: { id: true, businessName: true, phone: true },
  })

  console.log(`Profiles needing a spot: ${pending.length}`)
  let updated = 0

  for (const profile of pending) {
    const spot = SPOTS[profile.phone]
    if (!spot) {
      console.log(`  • ${profile.businessName} (${profile.phone}): no demo spot - skipped (real seller sets their own)`)
      continue
    }
    await db.businessProfile.update({ where: { id: profile.id }, data: spot })
    updated++
    console.log(`  ✓ ${profile.businessName} → ${spot.lat}, ${spot.lng}`)
  }

  console.log(`Updated ${updated} of ${pending.length}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
