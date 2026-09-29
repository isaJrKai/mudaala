import { db } from '@/lib/db'
import { route, jsonOk, jsonError, parseBody } from '@/lib/api'
import { registerSchema, normalizePhone, countryPhoneMessage, type CountryKey } from '@/lib/validation'
import { hashPassword, createSession, setSessionCookie, toPublicUser } from '@/lib/auth'

export async function POST(request: Request) {
  return route(async () => {
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

    const user = await db.user.create({
      data: { name: data.name, phone, country: data.country, passwordHash: hashPassword(data.password) },
    })

    const session = await createSession(user.id)
    await setSessionCookie(session.token, session.expiresAt)

    // sessionToken powers the Bearer channel where cookies are blocked.
    return jsonOk({ user: toPublicUser(user), sessionToken: session.token }, 201)
  })
}
