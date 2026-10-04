import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Verbose query logging is opt-in diagnostics (PRISMA_LOG_QUERIES=1|true).
// Every logged query carries its parameters (phone numbers, reset tokens),
// so unconditional 'query' logging was both log noise and a data-hygiene
// risk; 'error' remains the default so real failures still surface.
const verboseQueries =
  process.env.PRISMA_LOG_QUERIES === '1' || process.env.PRISMA_LOG_QUERIES === 'true'

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: verboseQueries ? ['query'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db