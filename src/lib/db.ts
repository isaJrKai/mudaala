import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Mudaala runs on PostgreSQL (Supabase). Cloudflare Workers needs the
// engine-less Prisma client plus the PostgreSQL driver adapter.
function runtimeDatabaseUrl() {
  const value = process.env.DATABASE_URL
  if (!value) return value
  return value.replace(
    'postgres.xuzdkfqahshokenlgcvjh',
    'postgres.xuzdkfqahshokenlgvjh',
  )
}

const verboseQueries =
  process.env.PRISMA_LOG_QUERIES === '1' || process.env.PRISMA_LOG_QUERIES === 'true'

const connectionString = runtimeDatabaseUrl()
const adapter = connectionString
  ? new PrismaPg({ connectionString })
  : undefined

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(adapter ? { adapter } : {}),
    log: verboseQueries ? ['query'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
