// PostgreSQL deployment connection — storage + real connectivity test.
// Config is persisted in AppSetting and never returned unmasked.
// In production these values belong in environment variables; the settings UI
// exists so connection details can be captured and tested without redeploying.

import net from 'node:net'
import { db } from '@/lib/db'
import type { PostgresConfig } from '@/lib/validation'

export const POSTGRES_SETTING_KEY = 'postgres_config'

export type StoredPostgresConfig = PostgresConfig & { configuredAt?: string }

export async function readPostgresConfig(): Promise<StoredPostgresConfig | null> {
  const row = await db.appSetting.findUnique({ where: { key: POSTGRES_SETTING_KEY } })
  if (!row) return null
  try {
    return JSON.parse(row.value) as StoredPostgresConfig
  } catch {
    console.error('[settings] corrupt postgres_config value')
    return null
  }
}

export async function savePostgresConfig(config: StoredPostgresConfig): Promise<void> {
  await db.appSetting.upsert({
    where: { key: POSTGRES_SETTING_KEY },
    create: { key: POSTGRES_SETTING_KEY, value: JSON.stringify(config) },
    update: { value: JSON.stringify(config) },
  })
}

export async function deletePostgresConfig(): Promise<void> {
  await db.appSetting.deleteMany({ where: { key: POSTGRES_SETTING_KEY } })
}

// Mask the password inside a connection string: postgres://user:secret@host/db
export function maskConnectionString(input: string): string {
  return input.replace(/(\/\/[^:/@\s]+:)[^@/\s]+(@)/, '$1••••$2')
}

export function hasEmbeddedPassword(connectionString: string): boolean {
  return /:[^:@/\s]+@/.test(connectionString)
}

export interface ParsedTarget {
  host: string
  port: number
}

// Resolve where to test: individual fields win, otherwise parse the connection string.
export function resolveTarget(config: StoredPostgresConfig): ParsedTarget | null {
  if (config.host && config.port) return { host: config.host, port: config.port }
  if (config.connectionString) {
    try {
      const url = new URL(config.connectionString)
      const port = Number(url.port || 5432)
      if (url.hostname && port >= 1 && port <= 65535) {
        return { host: url.hostname, port }
      }
    } catch {
      return null
    }
  }
  return null
}

export interface TcpTestResult {
  ok: boolean
  latencyMs?: number
  message: string
}

// Real TCP reachability test with a hard timeout. This verifies the host
// accepts connections — it does NOT verify credentials or the database itself;
// the response says exactly that, honestly.
export function testTcpConnection(target: ParsedTarget, timeoutMs = 5000): Promise<TcpTestResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const socket = new net.Socket()
    let settled = false

    const finish = (result: TcpTestResult) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      finish({ ok: true, latencyMs: Date.now() - startedAt, message: 'Host reachable' })
    })
    socket.once('timeout', () => {
      finish({ ok: false, message: `No response from ${target.host}:${target.port} within ${Math.round(timeoutMs / 1000)}s` })
    })
    socket.once('error', (err: NodeJS.ErrnoException) => {
      const reason =
        err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN'
          ? 'Host not found — check the hostname'
          : err.code === 'ECONNREFUSED'
            ? 'Connection refused — is PostgreSQL running on that port?'
            : err.code === 'ETIMEDOUT'
              ? 'Connection timed out'
              : `Connection failed (${err.code ?? 'unknown error'})`
      finish({ ok: false, message: reason })
    })

    socket.connect(target.port, target.host)
  })
}
