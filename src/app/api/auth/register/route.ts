import { db } from '@/lib/db'
import { route, jsonOk, jsonError, parseBody } from '@/lib/api'
import { registerSchema, normalizePhone, countryPhoneMessage, passwordProblem, type CountryKey } from '@/lib/validation'
import { hashPassword, createSession, setSessionCookie, toPublicUser } from '@/lib/auth'
import { hit, REGISTER_WINDOW_MS, REGISTER_IP_MAX } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/client-ip'
import { TERMS_VERSION } from '@/lib/constants'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  return route(async () => {
    // Per-IP cap: account creation is the expensive thing to flood (5 per
    // IP per hour). The IP is the edge-stamped address - a client-forged
    // x-forwarded-for does not open a fresh bucket.
    const ip = getClientIp(request)
    const verdict = await hit(`register:ip:${ip}`, REGISTER_IP_MAX, REGISTER_WINDOW_MS)
    if (!verdict.ok) {
      return NextResponse.json(
        { error: 'Too many accounts created from this device. Please wait about an hour, then try again.' },
        { status: 429, headers: { 'retry-after': String(verdict.retryAfterSeconds) } },
      )
    }

    const data = await parseBody(request, registerSchema)

    // The 18+ / Terms / Privacy confirmation is not decorative: registration
    // is refused without it (the checkbox is required on the form too).
    if (!data.acceptTerms) {
      return jsonError(400, 'Please confirm you are 18 or older and accept the Terms and Privacy Policy', {
        acceptTerms: 'Confirm you are 18+ and accept the Terms and Privacy Policy',
      })
    }

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
    // normalized phone, so it runs here - register and reset share one set of
    // password rules.
    const pwProblem = passwordProblem(data.password, phone)
    if (pwProblem) {
      return jsonError(400, pwProblem, { password: pwProblem })
    }

    // Task 4 - record WHICH version of the legal documents was accepted, and
    // when - so a future terms change knows exactly who needs to re-confirm.
    const user = await db.user.create({
      data: {
        name: data.name,
        phone,
        country: data.country,
        passwordHash: hashPassword(data.password),
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
      },
    })

    const session = await createSession(user.id)
    await setSessionCookie(session.token, session.expiresAt)

    // sessionToken powers the Bearer channel where cookies are blocked.
    return jsonOk({ user: toPublicUser(user), sessionToken: session.token }, 201)
  })
}
