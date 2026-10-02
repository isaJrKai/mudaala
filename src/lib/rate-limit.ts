// Mudaala — in-memory rate limiting for auth endpoints.
// A sliding window of attempt timestamps per key, held in process memory.
// Right-sized for a single-instance deployment (the app today); if the app
// ever scales horizontally, move the window into the shared database — the
// call sites do not need to change.
//
// Limits are per phone (brute-forcing ONE account) and per IP (flooding many
// accounts from one machine). Failed logins are what count against a phone —
// a successful sign-in clears that phone's failures, so a person mistyping
// their password is never locked out of their shop by their own traffic.

const buckets = new Map<string, number[]>()

function prune(key: string, windowMs: number): number[] {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (hits.length === 0) buckets.delete(key)
  else buckets.set(key, hits)
  return hits
}

interface RateVerdict {
  ok: boolean
  retryAfterSeconds: number
}

/** Record one attempt and say whether it may proceed. */
export function hit(key: string, max: number, windowMs: number): RateVerdict {
  const hits = prune(key, windowMs)
  if (hits.length >= max) {
    const oldest = hits[0]!
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (Date.now() - oldest)) / 1000)) }
  }
  hits.push(Date.now())
  buckets.set(key, hits)
  return { ok: true, retryAfterSeconds: 0 }
}

/** A success clears the bucket — used so failed-login counters reset on sign-in. */
export function clear(key: string): void {
  buckets.delete(key)
}

// Window: 15 minutes (env-tunable so tests and CI can tighten or widen it).
export const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MIN ?? 15) * 60_000

// Login: 5 FAILED attempts per phone per window; 30 total attempts per IP.
export const LOGIN_FAIL_MAX = Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 5)
export const LOGIN_IP_MAX = Number(process.env.RATE_LIMIT_LOGIN_IP_MAX ?? 30)

// Register: 20 accounts per IP per window (one device onboarding a market
// stall's worth of sellers stays clear; a script farm does not).
export const REGISTER_IP_MAX = Number(process.env.RATE_LIMIT_REGISTER_MAX ?? 20)

// Reports: 10 ACCEPTED reports per day per reporter (a sliding 24h window,
// not a calendar day — consistent with the other windows here). Signed-in
// reporters are keyed by user id; guests by IP. The guest cap is env-tunable
// so a shared dev box / CI runner (one IP for the whole suite) can raise it
// without touching the per-user limit the product actually promises.
export const REPORT_DAY_MAX = 10
export const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000
export const REPORT_IP_DAY_MAX = Number(process.env.RATE_LIMIT_REPORT_IP_MAX ?? REPORT_DAY_MAX)
