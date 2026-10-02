// Mudaala — authentication & session management.
// scrypt (node:crypto) for password hashing — no extra dependencies.
// Sessions are opaque random tokens stored server-side.
//
// DUAL TRANSPORT (why two ways to send the same token):
// The preview/sandbox UI can run inside a cross-origin iframe. Browsers drop
// SameSite=Lax cookies there, and SameSite=None cookies require HTTPS+Secure —
// which plain-http sandboxes cannot use either. So the token can ALSO travel
// in the Authorization: Bearer header.
//
// BUT the Bearer channel is an opt-in compatibility feature, not a right:
// ALLOW_BEARER_AUTH=true (or the legacy AUTH_BEARER_FALLBACK=1) turns it on
// (dev, preview, sandbox). Production sets nothing and gets the httpOnly
// cookie ONLY — a stolen-URL token cannot ride an Authorization header there,
// and logout revokes exactly the cookie session.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { db } from '@/lib/db'
import { bearerAuthEnabled } from '@/lib/env-flags'
import type { User } from '@prisma/client'

const SESSION_COOKIE = 'mudaala_session'
const SESSION_DAYS = 30

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

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.session.create({ data: { id: token, userId, expiresAt } })
  // Opportunistic cleanup of expired sessions.
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  return { token, expiresAt }
}

function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return true
  const name = host.split(':')[0]!.toLowerCase()
  return name === 'localhost' || name === '127.0.0.1' || name === '0.0.0.0' || name === '[::1]' || name.endsWith('.local')
}

// Cookie policy by host:
//   localhost  → SameSite=Lax (dev over http; Secure would break sign-in)
//   public host → SameSite=None; Secure (survives the https preview iframe;
//                 when the iframe strips it anyway, the Bearer header carries on)
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const [store, hdrs] = await Promise.all([cookies(), headers()])
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host')
  const local = isLocalHost(host)
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: local ? 'lax' : 'none',
    path: '/',
    expires: expiresAt,
    secure: !local,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
}

// Bearer fallback is explicitly opt-in per environment. Nothing set (and
// anything other than "1") means cookie-only — the production posture.

function extractBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1]!.trim() : null
}

/** The token for the CURRENT request, from either channel. Used by logout so a
 *  Bearer-only client (cookie blocked) can still revoke exactly its session.
 *  When the fallback is disabled, the Authorization header is ignored. */
export async function getCurrentSessionToken(): Promise<string | null> {
  const [store, hdrs] = await Promise.all([cookies(), headers()])
  return (
    store.get(SESSION_COOKIE)?.value ??
    (bearerAuthEnabled() ? extractBearerToken(hdrs.get('authorization')) : null)
  )
}

export async function getSessionUser(): Promise<User | null> {
  const token = await getCurrentSessionToken()
  if (!token) return null
  const session = await db.session.findUnique({ where: { id: token }, include: { user: true } })
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: token } }).catch(() => undefined)
    return null
  }
  return session.user
}

// Public shape — never leaks passwordHash.
interface PublicUser {
  id: string
  name: string
  phone: string
  country: string
  createdAt: string
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    country: user.country,
    createdAt: user.createdAt.toISOString(),
  }
}
