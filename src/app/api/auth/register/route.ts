import { db } from '@/lib/db'
import { route, jsonOk, jsonError, parseBody } from '@/lib/api'
import { registerSchema } from '@/lib/validation'
import { hashPassword, createSession, setSessionCookie, toPublicUser } from '@/lib/auth'

export async function POST(request: Request) {
  return route(async () => {
    const data = await parseBody(request, registerSchema)

    const existing = await db.user.findUnique({ where: { phone: data.phone } })
    if (existing) {
      return jsonError(409, 'An account with this phone number already exists. Sign in instead.', {
        phone: 'Phone number already registered',
      })
    }

    const user = await db.user.create({
      data: { name: data.name, phone: data.phone, passwordHash: hashPassword(data.password) },
    })

    const session = await createSession(user.id)
    await setSessionCookie(session.token, session.expiresAt)

    return jsonOk({ user: toPublicUser(user) }, 201)
  })
}
