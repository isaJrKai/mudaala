import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logging is OFF by default on purpose: every logged query echoes
    // its parameter values, and parameters include phone numbers — which must
    // never reach logs (project red line). Opt in explicitly when debugging:
    // PRISMA_QUERY_LOG=1.
    log: process.env.PRISMA_QUERY_LOG === '1' ? ['query'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db