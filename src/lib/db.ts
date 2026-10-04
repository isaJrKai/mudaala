import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Render currently has the Supabase project ref in the stored URL with one
// extra "c". The canonical project ref supplied for Mudaala is the one below.
// Normalize only that known typo; the password and host remain untouched.
function runtimeDatabaseUrl() {
  const value = process.env.DIRECT_URL
  if (!value) return value
  return value.replace(
    'postgres.xuzdkfqahshokenlgcvjh',
    'postgres.xuzdkfqahshokenlgvjh',
  )
}

const verboseQueries =
  process.env.PRISMA_LOG_QUERIES === '1' || process.env.PRISMA_LOG_QUERIES === 'true'

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: runtimeDatabaseUrl(),
    log: verboseQueries ? ['query'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
