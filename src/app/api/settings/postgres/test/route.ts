// Settings → Advanced Settings — "Test connection". Runs a REAL TCP
// reachability check against the saved PostgreSQL target and reports the
// outcome honestly: reachable is reachable, unreachable says why. It never
// claims credentials work — a TCP handshake knows nothing about passwords.
//
// The deployment config is global (one deployment, one database), so any
// signed-in user may test it — but nobody may test it without saving one
// first (400), and anonymous visitors get the usual 401.

import { route, jsonOk, requireUser, ApiError } from '@/lib/api'
import { readPostgresConfig, resolveTarget, testTcpConnection } from '@/lib/postgres-settings'

export async function POST() {
  return route(async () => {
    await requireUser('Sign in to test the database connection')

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
