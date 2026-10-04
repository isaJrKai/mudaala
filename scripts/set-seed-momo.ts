/**
 * Dev-only one-off: attach the demo merchant codes to the two seed shops in
 * the SANDBOX database, so the pay sheet can be exercised without reseeding
 * the whole instance. Same values scripts/seed.ts now carries. Remove-seed
 * (remove-seed-data.ts) still deletes these rows with the shops - they are
 * isSeed fixtures, not real payment identities.
 * Run: DATABASE_URL=... npx tsx scripts/set-seed-momo.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const setMomo = async (
    businessName: string,
    momoMerchantCode: string,
    momoNetwork: string,
    momoMerchantName: string,
  ) => {
    const profile = await db.businessProfile.findFirst({ where: { businessName, isSeed: true }, select: { id: true } })
    if (!profile) throw new Error(`Seed shop not found: ${businessName}`)
    return db.businessProfile.update({ where: { id: profile.id }, data: { momoMerchantCode, momoNetwork, momoMerchantName } })
  }
  // Kisenyi's code is registered under the owner's name - the common real
  // case, and the reason the pay sheet states the name the code brings
  // instead of promising the shop name. Ntinda's matches, uppercased the
  // way Airtel renders it.
  const kisenyi = await setMomo('Kisenyi Scrap Dealers', '600200', 'MTN', 'Ssalongo Ssemakula')
  const ntinda = await setMomo('Ntinda Home & Kitchen', '200415', 'AIRTEL', 'NTINDA HOME & KITCHEN')
  console.log(
    `sandbox momo set: ${kisenyi.businessName}=MTN/600200/Ssalongo Ssemakula, ` +
      `${ntinda.businessName}=AIRTEL/200415/NTINDA HOME & KITCHEN`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
