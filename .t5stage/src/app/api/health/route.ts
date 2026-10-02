// Health check — app alive + database reachable. No auth, no PII: a load
// balancer or uptime monitor should be able to hit this bare.

import { route, jsonOk } from '@/lib/api'
import { db } from '@/lib/db'

export async function GET() {
  return route(async () => {
    let database = 'up'
    try {
      await db.$queryRaw`SELECT 1`
    } catch {
      database = 'down'
    }
    // A healthy process with a dead database is NOT healthy: 503 so probes
    // pull the instance instead of sending buyers into a broken market.
    const ok = database === 'up'
    return jsonOk({ ok, app: 'up', database, time: new Date().toISOString() }, ok ? 200 : 503)
  })
}
