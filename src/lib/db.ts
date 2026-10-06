import { getCloudflareContext } from '@opennextjs/cloudflare'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

function runtimeDatabaseUrl() {
  try {
    const { env } = getCloudflareContext()
    const hyperdrive = env.HYPERDRIVE as { connectionString?: string } | undefined
    if (hyperdrive?.connectionString) return hyperdrive.connectionString
  } catch {
    // Fall back to the normal environment for local Node.js/dev execution.
  }

  const value = process.env.DATABASE_URL
  if (!value) return value

  // Keep compatibility with existing Supabase pooler configuration outside
  // Cloudflare Hyperdrive.
  try {
    const url = new URL(value)
    if (url.port === '6543' && url.hostname.endsWith('.pooler.supabase.com')) {
      url.port = '5432'
      url.searchParams.delete('pgbouncer')
      return url.toString()
    }
  } catch {
    // Let Prisma report a malformed DATABASE_URL below.
  }

  return value
}

function getPrisma(): PrismaClient {
  const connectionString = runtimeDatabaseUrl()
  if (!connectionString) {
    throw new Error('DATABASE_URL or Cloudflare HYPERDRIVE is required to initialize Prisma')
  }

  // Hyperdrive owns the underlying connection pool. Create a short-lived
  // Prisma client for each access instead of retaining a Worker-global pool.
  const adapter = new PrismaPg({ connectionString, maxUses: 1 })
  return new PrismaClient({
    adapter,
    log:
      process.env.PRISMA_LOG_QUERIES === '1' || process.env.PRISMA_LOG_QUERIES === 'true'
        ? ['query']
        : ['error'],
  })
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma()
    const value = client[property as keyof PrismaClient]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
