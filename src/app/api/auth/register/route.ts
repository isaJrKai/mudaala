import { db } from '@/lib/db'
import { route, jsonOk, jsonError, parseBody } from '@/lib/api'
import { registerSchema, normalizePhone, countryPhoneMessage, passwordProblem, type CountryKey } from '@/lib/validation'
import { hashPassword, createSession, setSessionCookie, toPublicUser } from '@/lib/auth'
import { hit, RATE_WINDOW_MS, REGISTER_IP_MAX } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  return route(async () => {
    // Per-IP cap: account creation is the expensive thing to flood.
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
    const verdict = hit(`register:ip:${ip}`, REGISTER_IP_MAX, RATE_WINDOW_MS)
    if (!verdict.ok) {
      return NextResponse.json(
        { error: 'Too many accounts created from this device. Please wait about 15 minutes, then try again.' },
        { status: 429, headers: { 'retry-after': String(verdict.retryAfterSeconds) } },
      )
    }

    const data = await parseBody(request, registerSchema)

    const phone = normalizePhone(data.phone, data.country as CountryKey)
    if (!phone) {
      return jsonError(400, countryPhoneMessage(data.country as CountryKey), {
        phone: countryPhoneMessage(data.country as CountryKey),
      })
    }

    const existing = await db.user.findUnique({ where: { phone } })
    if (existing) {
      return jsonError(409, 'An account with this phone number already exists. Sign in instead.', {
        phone: 'Phone number already registered',
      })
    }

    // The full rulebook (common-password and not-your-phone checks) needs the
    // normalized phone, so it runs here — register and reset share one set of
    // password rules.
    const pwProblem = passwordProblem(data.password, phone)
    if (pwProblem) {
      return jsonError(400, pwProblem, { password: pwProblem })
    }

    const user = await db.user.create({
      data: { name: data.name, phone, country: data.country, passwordHash: hashPassword(data.password) },
    })

    const session = await createSession(user.id)
    await setSessionCookie(session.token, session.expiresAt)

    // sessionToken powers the Bearer channel where cookies are blocked.
    return jsonOk({ user: toPublicUser(user), sessionToken: session.token }, 201)
  })
}
