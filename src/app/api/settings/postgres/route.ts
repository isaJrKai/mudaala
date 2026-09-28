// Settings → Advanced Settings — PostgreSQL deployment connection (CRUD).
// Passwords and connection strings are stored server-side and never returned
// unmasked to the browser.

import { route, jsonOk, parseBody, requireUser } from '@/lib/api'
import { postgresConfigSchema } from '@/lib/validation'
import {
  readPostgresConfig,
  savePostgresConfig,
  deletePostgresConfig,
  maskConnectionString,
  hasEmbeddedPassword,
  type StoredPostgresConfig,
} from '@/lib/postgres-settings'

export async function GET() {
  return route(async () => {
    await requireUser('Sign in to view advanced settings')
    const stored = await readPostgresConfig()
    if (!stored) return jsonOk({ config: null })

    const { password, connectionString, ...rest } = stored
    return jsonOk({
      config: {
        ...rest,
        connectionString: connectionString ? maskConnectionString(connectionString) : null,
        hasPassword: Boolean(password) || (connectionString ? hasEmbeddedPassword(connectionString) : false),
      },
    })
  })
}

export async function PUT(request: Request) {
  return route(async () => {
    await requireUser('Sign in to change advanced settings')
    const data = await parseBody(request, postgresConfigSchema)

    // An empty password field means "keep the previously stored password".
    const existing = await readPostgresConfig()
    const value: StoredPostgresConfig = {
      connectionString: data.connectionString ?? null,
      host: data.host ?? null,
      port: data.port ?? null,
      database: data.database ?? null,
      user: data.user ?? null,
      password: data.password ? data.password : (existing?.password ?? null),
      sslMode: data.sslMode,
      configuredAt: new Date().toISOString(),
    }
    await savePostgresConfig(value)
    return jsonOk({ ok: true })
  })
}

export async function DELETE() {
  return route(async () => {
    await requireUser('Sign in to change advanced settings')
    await deletePostgresConfig()
    return jsonOk({ ok: true })
  })
}
