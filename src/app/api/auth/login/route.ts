import { route, jsonOk, jsonError, parseBody } from '@/lib/api'
import { loginSchema, phoneCandidates } from '@/lib/validation'
import { db } from '@/lib/db'
import { verifyPassword, createSession, setSessionCookie, toPublicUser } from '@/lib/auth'
import { hit, clear, RATE_WINDOW_MS, LOGIN_FAIL_MAX, LOGIN_IP_MAX } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'

// The caller's IP — first hop of x-forwarded-for, or "local" when absent
// (direct dev access). Behind a proxy only the first hop is honest anyway.
function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}

function tooMany(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many attempts. Please wait about 15 minutes, then try again.' },
    { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
  )
}

export async function POST(request: Request) {
  return route(async () => {
    const data = await parseBody(request, loginSchema)
    const ip = clientIp(request)

    // Per-IP flood barrier: one machine hammering many phones.
    const ipVerdict = hit(`login:ip:${ip}`, LOGIN_IP_MAX, RATE_WINDOW_MS)
    if (!ipVerdict.ok) return tooMany(ipVerdict.retryAfterSeconds)

    // A local number like 0772123456 is ambiguous across UG/TZ/KE — look it up
    // under every dial code so users never have to re-state their country.
    const candidates = phoneCandidates(data.phone)

    // Per-phone lockout on repeated FAILURES: the 6th attempt on a locked
    // phone gets 429 even with the right password.
    for (const phone of candidates) {
      const verdict = hit(`login:fail:${phone}`, LOGIN_FAIL_MAX, RATE_WINDOW_MS)
      if (!verdict.ok) return tooMany(verdict.retryAfterSeconds)
    }

    const user = candidates.length
      ? await db.user.findFirst({ where: { phone: { in: candidates } } })
      : null
    if (!user || !verifyPassword(data.password, user.passwordHash)) {
      // Same message for unknown phone and wrong password — no account enumeration.
      return jsonError(401, 'Phone number or password is incorrect')
    }

    // Success clears the failure counters for every form of this phone.
    for (const phone of candidates) clear(`login:fail:${phone}`)

    const session = await createSession(user.id)
    await setSessionCookie(session.token, session.expiresAt)

    // sessionToken powers the Bearer channel where cookies are blocked.
    return jsonOk({ user: toPublicUser(user), sessionToken: session.token })
  })
}
