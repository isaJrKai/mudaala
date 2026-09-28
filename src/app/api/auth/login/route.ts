import { route, jsonOk, jsonError, parseBody } from '@/lib/api'
import { loginSchema } from '@/lib/validation'
import { db } from '@/lib/db'
import { verifyPassword, createSession, setSessionCookie, toPublicUser } from '@/lib/auth'

export async function POST(request: Request) {
  return route(async () => {
    const data = await parseBody(request, loginSchema)

    const user = await db.user.findUnique({ where: { phone: data.phone } })
    if (!user || !verifyPassword(data.password, user.passwordHash)) {
      // Same message for unknown phone and wrong password — no account enumeration.
      return jsonError(401, 'Phone number or password is incorrect')
    }

    const session = await createSession(user.id)
    await setSessionCookie(session.token, session.expiresAt)

    return jsonOk({ user: toPublicUser(user) })
  })
}
