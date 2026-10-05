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
  return value.replace(
    'postgres.xuzdkfqahshokenlgcvjh',
    'postgres.xuzdkfqahshokenlgvjh',
  )
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
