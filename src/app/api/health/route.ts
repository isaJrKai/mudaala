// Health check - app alive + database reachable. No auth, no PII.

import { route, jsonOk } from '@/lib/api'
import { db } from '@/lib/db'

function databaseTarget() {
  const raw = process.env.DATABASE_URL
  if (!raw) return { configured: false }
  try {
    const u = new URL(raw)
    return { configured: true, protocol: u.protocol, host: u.hostname, port: u.port || '5432', user: decodeURIComponent(u.username), database: u.pathname.replace(/^\//, ''), sslmode: u.searchParams.get('sslmode') || 'default', pgbouncer: u.searchParams.get('pgbouncer') || 'false' }
  } catch { return { configured: true, malformed: true } }
}

export async function GET() {
  return route(async () => {
    let database = 'up'
    try { await db.$queryRaw`SELECT 1` }
    catch (error) {
      database = 'down'
      console.error('[health] database connection failed', { target: databaseTarget(), error: error instanceof Error ? error.message : String(error) })
    }
    const ok = database === 'up'
    return jsonOk({ ok, app: 'up', database, time: new Date().toISOString() }, ok ? 200 : 503)
  })
}