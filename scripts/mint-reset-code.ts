/**
 * DEV TOOL — put a KNOWN reset code on a real account so the flow can be
 * exercised by hand.
 *
 * Why this exists: codes are stored only as salted hashes and are never
 * logged (red line), so the console provider's "delivery" cannot be read
 * back. In dev you can instead mint a code you already know — the same act
 * as reading the database, which only a developer with the keys can do.
 *
 * Usage:  npx tsx scripts/mint-reset-code.ts "<phone in any Ugandan format>" [code]
 *         (code defaults to a random 6 digits, printed once, here only)
 * Guard:  refuses to run in production — there, codes travel via Africa's
 *         Talking to the SIM owner and nobody mints them.
 */
import { db } from '@/lib/db'
import { hashCode, generateCode } from '@/lib/password'
import { phoneCandidates } from '@/lib/validation'
import { RESET_CODE_TTL_MS } from '@/lib/password-reset'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run in production — reset codes are delivered by SMS there.')
    process.exit(1)
  }
  const raw = process.argv[2]
  if (!raw) {
    console.error('Usage: npx tsx scripts/mint-reset-code.ts "<phone>" [6-digit-code]')
    process.exit(1)
  }
  const candidates = phoneCandidates(raw)
  if (candidates.length === 0) {
    console.error('That does not look like a Ugandan phone number (07…, 2567…, +2567…).')
    process.exit(1)
  }
  const code = process.argv[3] && /^\d{6}$/.test(process.argv[3]) ? process.argv[3] : generateCode()
  await db.$connect()
  const user = await db.user.findFirst({ where: { phone: { in: candidates } } })
  if (!user) {
    console.error('No account for that phone — register one first (the reset flow itself reveals nothing).')
    await db.$disconnect()
    process.exit(1)
  }
  await db.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } })
  await db.passwordReset.create({
    data: { userId: user.id, codeHash: hashCode(code), expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS) },
  })
  console.log(`\nReset code for ${user.name} (${user.phone}): ${code}`)
  console.log('It expires in 10 minutes. Dev only — this code never touches a log file.')
  await db.$disconnect()
}

main().catch((e) => {
  console.error('mint-reset-code failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
