// PostgreSQL deployment connection — storage + real connectivity test.
// Config is persisted in AppSetting and never returned unmasked.
// In production these values belong in environment variables; the settings UI
// exists so connection details can be captured and tested without redeploying.

import net from 'node:net'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import type { PostgresConfig } from '@/lib/validation'

export const POSTGRES_SETTING_KEY = 'postgres_config'

export type StoredPostgresConfig = PostgresConfig & { configuredAt?: string }

// Secrets at rest: password and connection string are AES-256-GCM encrypted
// before they touch AppSetting. The key comes from SETTINGS_ENC_KEY; without
// it a stable machine-local fallback is derived from DATABASE_URL so dev does
// not silently lose saved config across restarts. Values written before
// encryption (no "enc:" prefix) decrypt to themselves — nothing breaks.
const ENC_PREFIX = 'enc:'

function settingsKey(): Buffer {
  const secret = process.env.SETTINGS_ENC_KEY
  const material = secret
    ? `mudaala:settings:${secret}`
    : `mudaala:settings:fallback:${process.env.DATABASE_URL ?? 'local'}`
  return createHash('sha256').update(material).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', settingsKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `${ENC_PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) return value
  const [, ivB64, tagB64, dataB64] = value.split(':')
  const decipher = createDecipheriv('aes-256-gcm', settingsKey(), Buffer.from(ivB64!, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64!, 'base64')), decipher.final()]).toString('utf8')
}

export async function readPostgresConfig(): Promise<StoredPostgresConfig | null> {
  const row = await db.appSetting.findUnique({ where: { key: POSTGRES_SETTING_KEY } })
  if (!row) return null
  try {
    const stored = JSON.parse(row.value) as StoredPostgresConfig
    return {
      ...stored,
      password: stored.password ? decryptSecret(stored.password) : stored.password,
      connectionString: stored.connectionString ? decryptSecret(stored.connectionString) : stored.connectionString,
    }
  } catch {
    console.error('[settings] corrupt postgres_config value')
    return null
  }
}

export async function savePostgresConfig(config: StoredPostgresConfig): Promise<void> {
  const stored: StoredPostgresConfig = {
    ...config,
    password: config.password ? encryptSecret(config.password) : config.password,
    connectionString: config.connectionString ? encryptSecret(config.connectionString) : config.connectionString,
  }
  const value = JSON.stringify(stored)
  await db.appSetting.upsert({
    where: { key: POSTGRES_SETTING_KEY },
    create: { key: POSTGRES_SETTING_KEY, value },
    update: { value },
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
