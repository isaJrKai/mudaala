// Next.js instrumentation hook — runs once per server process at startup,
// before any request is served. This is where the environment gets checked:
// production boots only with its secrets present (fail fast); development
// logs the same problems as warnings so nothing silently degrades.

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
      throw new Error(`Refusing to start — fix the environment first:\n- ${report.errors.join('\n- ')}`)
    }
  }
}
