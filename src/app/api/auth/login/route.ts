import { route, jsonOk, jsonError, parseBody } from '@/lib/api'
import { loginSchema, phoneCandidates } from '@/lib/validation'
import { db } from '@/lib/db'
import { verifyPassword, createSession, setSessionCookie, toPublicUser } from '@/lib/auth'

export async function POST(request: Request) {
  return route(async () => {
    const data = await parseBody(request, loginSchema)

    // A local number like 0772123456 is ambiguous across UG/TZ/KE — look it up
    // under every dial code so users never have to re-state their country.
    const candidates = phoneCandidates(data.phone)
    const user = candidates.length
      ? await db.user.findFirst({ where: { phone: { in: candidates } } })
      : null
    if (!user || !verifyPassword(data.password, user.passwordHash)) {
      // Same message for unknown phone and wrong password — no account enumeration.
      return jsonError(401, 'Phone number or password is incorrect')
    }

    const session = await createSession(user.id)
    await setSessionCookie(session.token, session.expiresAt)

    // sessionToken powers the Bearer channel where cookies are blocked.
    return jsonOk({ user: toPublicUser(user), sessionToken: session.token })
  })
}
