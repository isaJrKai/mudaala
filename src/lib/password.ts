// Mudaala — password & one-time-code primitives (node:crypto only).
// Deliberately free of next/* imports so scripts (seed, test-api) and the
// app share ONE implementation. auth.ts re-exports the password pair.

import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

// One-time codes (password reset) are stored salted-hashed for the same
// reason passwords are: a leaked database must not give away working codes.
// A 6-digit code has a tiny keyspace, so the per-code salt is what makes
// precomputing a rainbow table useless. Same "salt:hash" shape as passwords.

export function hashCode(code: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = createHash('sha256').update(`${salt}:${code}`).digest('hex')
  return `${salt}:${hash}`
}

export function verifyCode(code: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = createHash('sha256').update(`${salt}:${code}`).digest()
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

/** Cryptographically strong 6-digit code, 000000–999999, zero-padded. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}
