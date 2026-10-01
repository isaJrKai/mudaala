// Task 16 E2E helper: insert real notifications for the Nakato seller so the
// bell/badge/clear flow has something honest to show. Phone-keyed, safe to
// re-run (skips if an unread notification with the same title exists).
import { PrismaClient, type User } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const raw = process.argv[2] ?? '0772123456'
  // The same number can be stored local (07…), E.164 (+256…) or bare (256…)
  // depending on which flow created the user — try all three shapes.
  const digits = raw.replace(/\D/g, '') // e.g. 0772123456 or 256772123456
  const local = digits.startsWith('256') ? '0' + digits.slice(3) : digits
  const e164 = '+256' + local.slice(1)
  const variants = Array.from(new Set([raw, local, e164, digits]))
  let user: User | null = null
  for (const phone of variants) {
    user = await prisma.user.findFirst({ where: { phone } })
    if (user) break
  }
  if (!user) {
    console.error(`NO_USER for phone ${raw} (tried ${variants.join(', ')})`)
    process.exit(1)
  }
  console.log(`USER ${user.id} ${user.name} (phone stored as ${user.phone})`)

  const stamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const items = [
    {
      type: 'LISTING_EXPIRING',
      title: 'Fresh matooke expires in 3 days',
      body: 'Your listing "Fresh matooke bunches" expires soon. Refresh it from My Listings to stay visible for 30 more days.',
    },
    {
      // Unique per run — the E2E uses this one to prove the bell shakes on a
      // NEW alert arriving while the seller is mid-session.
      type: 'NEW_MATCH',
      title: `New match at ${stamp} — "copper in Kampala"`,
      body: 'A new OFFER matching "copper in Kampala" was posted. Open Alerts to see it.',
    },
  ]

  for (const item of items) {
    const existing = await prisma.notification.findFirst({
      where: { userId: user.id, title: item.title, read: false },
    })
    if (existing) {
      console.log(`SKIP (already unread): ${item.title}`)
      continue
    }
    await prisma.notification.create({
      data: { userId: user.id, ...item, read: false },
    })
    console.log(`CREATED: ${item.title}`)
  }

  const unread = await prisma.notification.count({ where: { userId: user.id, read: false } })
  console.log(`UNREAD_TOTAL=${unread}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
