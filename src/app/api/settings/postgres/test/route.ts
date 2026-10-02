// Settings → Advanced Settings — "Test connection". Runs a REAL TCP
// reachability check against the saved PostgreSQL target and reports the
// outcome honestly: reachable is reachable, unreachable says why. It never
// claims credentials work — a TCP handshake knows nothing about passwords.
//
// The deployment config is global (one deployment, one database), so testing
// it is admin-only (ADMIN_PHONES): it reveals host reachability. Nobody may
// test without saving a config first (400); anonymous visitors get 401.

import { route, jsonOk, ApiError } from '@/lib/api'
import { requireAdmin } from '@/lib/admin'
import { readPostgresConfig, resolveTarget, testTcpConnection } from '@/lib/postgres-settings'

export async function POST() {
  return route(async () => {
    await requireAdmin('Only the shop admin can test the database connection')

    const stored = await readPostgresConfig()
    if (!stored) {
      throw new ApiError(400, 'No PostgreSQL config saved yet — save the connection details first, then test.')
    }

    const target = resolveTarget(stored)
    if (!target) {
      throw new ApiError(400, 'The saved config has no usable host — set host and port, or a valid connection string.')
    }

    const result = await testTcpConnection(target)
    return jsonOk(result)
  })
}
