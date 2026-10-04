// Next.js instrumentation hook - runs once per server process at startup.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { validateEnv } = await import('./lib/env')
  const report = validateEnv()

  for (const warning of report.warnings) {
    console.warn(`[env] warning: ${warning}`)
  }

  if (!report.ok) {
    for (const error of report.errors) {
      console.error(`[env] ${error}`)
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Refusing to start. Fix the environment first:\n- ${report.errors.join('\n- ')}`)
    }
  }

  // Render is an IPv4-only long-running Node service. Prisma uses the
  // Supabase Session Pooler from DIRECT_URL (port 5432) at runtime.
  const { db } = await import('./lib/db')
  try {
    await db.$queryRaw`SELECT 1`
    console.info('[startup-db] connected')
  } catch (error) {
    console.error('[startup-db] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
