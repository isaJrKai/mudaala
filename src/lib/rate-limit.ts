// Mudaala - rate limiting behind one interface.
//
// The contract every store fulfils:
//   hit(key, max, windowMs)  -> record one attempt, say whether it may proceed
//   clear(key)               -> a success wipes the bucket (failed logins reset
//                               on sign-in; a mistyping person is never locked
//                               out of their shop by their own traffic)
//
// Two implementations:
//   - MemoryRateLimiter: a sliding window of attempt timestamps per key, held
//     in process memory. The default - right-sized for a single-instance
//     deployment, zero moving parts.
//   - RedisRateLimiter: the same sliding window on a Redis ZSET, chosen
//     automatically when REDIS_URL is set - so a horizontally scaled deploy
//     shares one set of buckets instead of one per process. Any Redis error
//     falls back to the in-memory window for that call: the limiter degrades,
//     it never blocks sign-ins by being down.
//
// Limits are per phone (brute-forcing ONE account) and per IP (flooding many
// accounts from one machine). The IP is whatever lib/client-ip decided -
// call sites never see the header plumbing.

import { randomBytes } from 'node:crypto'

export interface RateVerdict {
  ok: boolean
  retryAfterSeconds: number
}

export interface RateLimiterStore {
  /** Human-readable provider name for logs and health reporting. */
  readonly name: string
  hit(key: string, max: number, windowMs: number): Promise<RateVerdict>
  clear(key: string): Promise<void>
}

// ---------------------------------------------------------------------------
// In-memory store (default)
// ---------------------------------------------------------------------------

export function createMemoryRateLimiter(): RateLimiterStore {
  const buckets = new Map<string, number[]>()
  function prune(key: string, windowMs: number): number[] {
    const now = Date.now()
    const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
    if (hits.length === 0) buckets.delete(key)
    else buckets.set(key, hits)
    return hits
  }
  return {
    name: 'memory',
    async hit(key, max, windowMs) {
      const hits = prune(key, windowMs)
      if (hits.length >= max) {
        const oldest = hits[0]!
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (Date.now() - oldest)) / 1000)) }
      }
      hits.push(Date.now())
      buckets.set(key, hits)
      return { ok: true, retryAfterSeconds: 0 }
    },
    async clear(key) {
      buckets.delete(key)
    },
  }
}

// ---------------------------------------------------------------------------
// Redis store (REDIS_URL) - the same window on a ZSET
// ---------------------------------------------------------------------------

// The narrow slice of Redis commands the limiter needs. ioredis satisfies
// this shape as-is; the unit tests supply a small in-process fake, so the
// window logic is proven without standing up a Redis server.
export interface RedisZSetClient {
  zremrangebyscore(key: string, min: string | number, max: string | number): Promise<number>
  zcard(key: string): Promise<number>
  zadd(key: string, score: number, member: string): Promise<number>
  zrange(key: string, start: number, stop: number, withscores: 'WITHSCORES'): Promise<string[]>
  pexpire(key: string, ms: number): Promise<number>
  del(key: string): Promise<number>
}

const REDIS_PREFIX = 'mudaala:rl:'

export function createRedisRateLimiter(client: RedisZSetClient, fallback = createMemoryRateLimiter()): RateLimiterStore {
  async function hitRedis(key: string, max: number, windowMs: number): Promise<RateVerdict> {
    const k = REDIS_PREFIX + key
    const now = Date.now()
    await client.zremrangebyscore(k, '-inf', now - windowMs)
    const count = await client.zcard(k)
    if (count >= max) {
      const oldest = await client.zrange(k, 0, 0, 'WITHSCORES')
      const oldestMs = oldest.length >= 2 ? Number(oldest[1]) : now
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldestMs)) / 1000)) }
    }
    // A unique member per attempt: identical timestamps must not collapse.
    await client.zadd(k, now, `${now}-${randomBytes(6).toString('hex')}`)
    await client.pexpire(k, windowMs)
    return { ok: true, retryAfterSeconds: 0 }
  }
  return {
    name: 'redis',
    async hit(key, max, windowMs) {
      try {
        return await hitRedis(key, max, windowMs)
      } catch (err) {
        // Redis down is not permission to brute force: the in-memory window
        // keeps counting for this process until Redis answers again.
        console.error('[rate-limit] redis unavailable, using the in-memory window:', err instanceof Error ? err.message : err)
        return fallback.hit(key, max, windowMs)
      }
    },
    async clear(key) {
      try {
        await client.del(REDIS_PREFIX + key)
      } catch (err) {
        console.error('[rate-limit] redis unavailable during clear:', err instanceof Error ? err.message : err)
        await fallback.clear(key)
      }
    },
  }
}

// The real client: ioredis, connected lazily so a process that never serves a
// rate-limited route never dials Redis. Cast is safe - ioredis implements the
// narrow command slice above with these exact signatures.
type RedisCtor = (typeof import('ioredis'))['default']
let redisCtor: RedisCtor | null = null
async function loadRedis(): Promise<RedisCtor> {
  if (!redisCtor) redisCtor = (await import('ioredis')).default
  return redisCtor
}

export async function createRedisClient(url: string): Promise<RedisZSetClient> {
  const Redis = await loadRedis()
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  })
  await client.connect()
  return client as unknown as RedisZSetClient
}

// ---------------------------------------------------------------------------
// Store choice + the module-level API call sites use
// ---------------------------------------------------------------------------

export function chooseRateLimiter(
  env: Record<string, string | undefined> = process.env,
  deps: { createRedisClient?: (url: string) => Promise<RedisZSetClient> } = {},
): RateLimiterStore {
  const url = env.REDIS_URL?.trim()
  if (!url) return createMemoryRateLimiter()
  // Redis is chosen once per process; if dialing it fails the store itself
  // degrades to the in-memory window per call (never blocks the request).
  const connect = deps.createRedisClient ?? createRedisClient
  let store: RateLimiterStore | null = null
  return {
    get name() {
      return store?.name ?? 'redis (connecting)'
    },
    async hit(key, max, windowMs) {
      if (!store) {
        try {
          store = createRedisRateLimiter(await connect(url))
        } catch (err) {
          console.error('[rate-limit] could not reach REDIS_URL, in-memory window for this process:', err instanceof Error ? err.message : err)
          store = createMemoryRateLimiter()
        }
      }
      return store.hit(key, max, windowMs)
    },
    async clear(key) {
      if (!store) return
      return store.clear(key)
    },
  }
}

let active: RateLimiterStore | null = null

function activeStore(): RateLimiterStore {
  if (!active) active = chooseRateLimiter()
  return active
}

/** Record one attempt and say whether it may proceed. */
export async function hit(key: string, max: number, windowMs: number): Promise<RateVerdict> {
  return activeStore().hit(key, max, windowMs)
}

/** A success clears the bucket - used so failed-login counters reset on sign-in. */
export async function clear(key: string): Promise<void> {
  return activeStore().clear(key)
}

// Window: 15 minutes (env-tunable so tests and CI can tighten or widen it).
export const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MIN ?? 15) * 60_000

// Login: 5 FAILED attempts per phone per 15 min; 20 total attempts per IP in
// the same window (the IP bucket counts every attempt - a flood is a flood
// even when each phone fails only once).
export const LOGIN_FAIL_MAX = Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 5)
export const LOGIN_IP_MAX = Number(process.env.RATE_LIMIT_LOGIN_IP_MAX ?? 20)

// Register: 5 accounts per IP per hour (spec). One device onboarding a small
// stall's worth of sellers stays clear; a script farm does not.
export const REGISTER_WINDOW_MS = 60 * 60_000
export const REGISTER_IP_MAX = Number(process.env.RATE_LIMIT_REGISTER_MAX ?? 5)

// Publish: 20 listings per user per day (spec) - plenty for a real shop's
// morning restock, hostile to catalogue-spam. An IP bucket rides beside it
// (same cap) so one machine juggling accounts cannot multiply the budget.
export const PUBLISH_WINDOW_MS = 24 * 60 * 60_000
export const PUBLISH_DAY_MAX = Number(process.env.RATE_LIMIT_PUBLISH_MAX ?? 20)

// Upload: 30 photos per user per hour (spec) - a full catalogue shoot in one
// sitting is fine; a bulk-fill attack is not. IP bucket rides beside it.
export const UPLOAD_WINDOW_MS = 60 * 60_000
export const UPLOAD_HOUR_MAX = Number(process.env.RATE_LIMIT_UPLOAD_MAX ?? 30)

// Reports: 10 ACCEPTED reports per day per reporter (a sliding 24h window,
// not a calendar day - consistent with the other windows here). Signed-in
// reporters are keyed by user id; guests by IP. The guest cap is env-tunable
// so a shared dev box / CI runner (one IP for the whole suite) can raise it
// without touching the per-user limit the product actually promises.
export const REPORT_DAY_MAX = 10
export const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000
export const REPORT_IP_DAY_MAX = Number(process.env.RATE_LIMIT_REPORT_IP_MAX ?? REPORT_DAY_MAX)

// Password reset: requesting a CODE costs 3 per phone per hour and 10 per IP
// per hour. The per-phone cap applies to EVERY number - existing account or
// not - so nobody can use the endpoint as an SMS pump or an existence probe.
// The per-IP cap is env-tunable for the same shared-dev-box reason as above.
export const RESET_PHONE_MAX = Number(process.env.RATE_LIMIT_RESET_PHONE_MAX ?? 3)
export const RESET_IP_MAX = Number(process.env.RATE_LIMIT_RESET_IP_MAX ?? 10)
export const RESET_WINDOW_MS = 60 * 60 * 1000
