// Duuka — authentication & session management.
// scrypt (node:crypto) for password hashing — no extra dependencies.
// Sessions are opaque random tokens stored server-side.
//
// DUAL TRANSPORT (why two ways to send the same token):
// The preview/sandbox UI can run inside a cross-origin iframe. Browsers drop
// SameSite=Lax cookies there, and SameSite=None cookies require HTTPS+Secure —
// which plain-http sandboxes cannot use either. So the token ALSO travels in
// the Authorization: Bearer header, persisted client-side. Routes never care
// which channel carried the token: getSessionUser() tries the cookie first,
// then the header.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { db } from '@/lib/db'
import type { User } from '@prisma/client'

const SESSION_COOKIE = 'duuka_session'
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

export function extractBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1]!.trim() : null
}

/** The token for the CURRENT request, from either channel. Used by logout so a
 *  Bearer-only client (cookie blocked) can still revoke exactly its session. */
export async function getCurrentSessionToken(): Promise<string | null> {
  const [store, hdrs] = await Promise.all([cookies(), headers()])
  return store.get(SESSION_COOKIE)?.value ?? extractBearerToken(hdrs.get('authorization'))
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
export interface PublicUser {
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
