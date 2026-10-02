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

// Login: 5 FAILED attempts per phone per 15 min; 20 total attempts per IP in
// the same window (the IP bucket counts every attempt — a flood is a flood
// even when each phone fails only once).
export const LOGIN_FAIL_MAX = Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 5)
export const LOGIN_IP_MAX = Number(process.env.RATE_LIMIT_LOGIN_IP_MAX ?? 20)

// Register: 5 accounts per IP per hour (spec). One device onboarding a small
// stall's worth of sellers stays clear; a script farm does not.
export const REGISTER_WINDOW_MS = 60 * 60_000
export const REGISTER_IP_MAX = Number(process.env.RATE_LIMIT_REGISTER_MAX ?? 5)

// Publish: 20 listings per user per day (spec) — plenty for a real shop's
// morning restock, hostile to catalogue-spam.
export const PUBLISH_WINDOW_MS = 24 * 60 * 60_000
export const PUBLISH_DAY_MAX = Number(process.env.RATE_LIMIT_PUBLISH_MAX ?? 20)

// Upload: 30 photos per user per hour (spec) — a full catalogue shoot in one
// sitting is fine; a bulk-fill attack is not.
export const UPLOAD_WINDOW_MS = 60 * 60_000
export const UPLOAD_HOUR_MAX = Number(process.env.RATE_LIMIT_UPLOAD_MAX ?? 30)

// Password reset codes: 3 codes per phone per hour, 10 per IP per hour.
// A tighter, longer window than login — an SMS gateway costs real money and
// a flood of codes is both a harassment vector and a bill.
export const RESET_WINDOW_MS = 60 * 60_000
export const RESET_PHONE_MAX = Number(process.env.RATE_LIMIT_RESET_PHONE_MAX ?? 3)
export const RESET_IP_MAX = Number(process.env.RATE_LIMIT_RESET_IP_MAX ?? 10)
