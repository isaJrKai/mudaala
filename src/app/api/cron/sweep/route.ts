// Maintenance sweep endpoint — runs the real expiry + expiring-soon processes.
// In production this would be called by a scheduler (cron / Supabase pg_cron);
// it is idempotent, so calling it repeatedly is safe.

import { route, jsonOk } from '@/lib/api'
import { expireOverdueListings, notifyExpiringSoon } from '@/lib/listings'

export async function POST() {
  return route(async () => {
    const expired = await expireOverdueListings()
    const expiring = await notifyExpiringSoon()
    return jsonOk({ expired, expiringNotified: expiring })
  })
}
