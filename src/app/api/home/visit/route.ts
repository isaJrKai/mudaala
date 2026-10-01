// Marks the user's Home visit. The Home dashboard fires this ONCE per mount,
// after its data has loaded, so "new matches since last visit" has a stable
// reference point: numbers on screen never zero themselves mid-visit.

import { route, jsonOk, requireUser } from '@/lib/api'
import { db } from '@/lib/db'

export async function POST() {
  return route(async () => {
    const user = await requireUser('Sign in to continue')
    const now = new Date()
    await db.user.update({ where: { id: user.id }, data: { lastHomeVisitAt: now } })
    return jsonOk({ ok: true, lastHomeVisitAt: now.toISOString() })
  })
}
