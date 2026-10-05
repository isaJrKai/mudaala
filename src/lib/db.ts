import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Prisma must be initialized lazily because Next.js evaluates server modules
// during the production build, while Cloudflare provides DATABASE_URL only at
// Worker runtime. The proxy preserves the existing db.user API.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function runtimeDatabaseUrl() {
  const value = process.env.DATABASE_URL
  if (!value) return value

  // Supabase's shared transaction pooler (port 6543) does not support
  // prepared statements. Prisma must be told it is behind PgBouncer.
  try {
    const url = new URL(value)
    if (url.port === '6543') {
      url.searchParams.set('pgbouncer', 'true')
      return url.toString()
    }
  } catch {
    // Let Prisma report a malformed DATABASE_URL below.
  }

  return value
}

function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma

  const connectionString = runtimeDatabaseUrl()
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to initialize Prisma')
  }

  const adapter = new PrismaPg({ connectionString })
  const client = new PrismaClient({
    adapter,
    log:
      process.env.PRISMA_LOG_QUERIES === '1' || process.env.PRISMA_LOG_QUERIES === 'true'
        ? ['query']
        : ['error'],
  })

  globalForPrisma.prisma = client
  return client
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma()
    const value = client[property as keyof PrismaClient]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
