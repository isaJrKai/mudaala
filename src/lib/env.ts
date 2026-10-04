// Mudaala - startup environment validation.
// Fail fast in production: a deployment missing its secrets must refuse to
// boot rather than serve pages that silently cannot do their job (cron sweeps
// that 503, settings that cannot decrypt, canonical URLs pointing at
// localhost). In development the same problems are warnings, not walls.

interface EnvReport {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export function validateEnv(env: Record<string, string | undefined> = process.env): EnvReport {
  const errors: string[] = []
  const warnings: string[] = []
  const production = env.NODE_ENV === 'production'

  // Required everywhere Prisma runs.
  if (!env.DATABASE_URL || env.DATABASE_URL.trim() === '') {
    errors.push('DATABASE_URL is required. The app cannot reach its data without it')
  }

  // Canonical origin: ad pages, OG tags, sitemap and robots all anchor to it.
  if (!env.NEXT_PUBLIC_APP_URL && !env.APP_ORIGIN) {
    ;(production ? errors : warnings).push(
      'NEXT_PUBLIC_APP_URL is not set. Canonical/OG URLs would fall back to localhost',
    )
  }

  if (production) {
    if (!env.CRON_SECRET || env.CRON_SECRET.trim() === '') {
      errors.push('CRON_SECRET is required in production. Without it the daily sweep endpoint refuses to run')
    }
    if (!env.SETTINGS_ENCRYPTION_KEY && !env.SETTINGS_ENC_KEY) {
      errors.push('SETTINGS_ENCRYPTION_KEY is required in production. Stored deployment secrets would be unencrypted')
    }
    if (!env.ADMIN_PHONES || env.ADMIN_PHONES.trim() === '') {
      errors.push('ADMIN_PHONES is required in production. With no allowlist the admin desk is unusable (fail closed)')
    }
    if (env.ALLOW_BEARER_AUTH === '1' || env.ALLOW_BEARER_AUTH === 'true' || env.AUTH_BEARER_FALLBACK === '1') {
      warnings.push(
        'Bearer-token auth is enabled in production. Production should use the httpOnly cookie only',
      )
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}
