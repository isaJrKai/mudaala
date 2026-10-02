// Maintenance sweep endpoint — runs the real expiry + expiring-soon processes.
// In production this is called by a scheduler (cron / Supabase pg_cron) that
// presents the shared secret: header x-cron-secret must match CRON_SECRET.
// It is idempotent, so calling it repeatedly is safe. Fails closed: if
// CRON_SECRET is not configured the endpoint refuses to run rather than being
// world-open. (Expiry inside the app does not depend on this endpoint —
// public reads run the same sweep.)

import { createHash, timingSafeEqual } from 'node:crypto'
import { headers } from 'next/headers'
import { route, jsonOk, jsonError } from '@/lib/api'
import { db } from '@/lib/db'
import { expireOverdueListings, notifyExpiringSoon } from '@/lib/listings'
import { recordPriceSnapshots } from '@/lib/price-trends'

function secretMatches(presented: string | null, configured: string | undefined): boolean {
  if (!configured || !presented) return false
  // Hash both sides so length differences cannot leak via timing.
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(configured).digest()
  return timingSafeEqual(a, b)
}

export async function POST() {
  return route(async () => {
    const hdrs = await headers()
    const presented = hdrs.get('x-cron-secret')
    const configured = process.env.CRON_SECRET

    if (!configured) {
      return jsonError(503, 'Sweep endpoint is not configured — set CRON_SECRET to enable scheduled sweeps')
    }
    if (!secretMatches(presented, configured)) {
      return jsonError(403, 'Invalid cron secret')
    }

    const expired = await expireOverdueListings()
    const expiring = await notifyExpiringSoon()
    // Daily price medians — same sweep, derived honestly from ACTIVE listings.
    const priceSnapshots = await recordPriceSnapshots()
    // Password-reset codes past their night: used or expired more than a day
    // ago they are dead weight (and dead rows nobody should ever resurrect).
    const staleResets = await db.passwordReset.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    })
    return jsonOk({ expired, expiringNotified: expiring, priceSnapshots, staleResets: staleResets.count })
  })
}
