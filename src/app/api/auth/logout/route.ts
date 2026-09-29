import { route, jsonOk } from '@/lib/api'
import { clearSessionCookie, getCurrentSessionToken } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST() {
  return route(async () => {
    // Delete only the current browser's session, not sessions on other devices.
    // Works for both channels: cookie-based and Bearer-based clients.
    const token = await getCurrentSessionToken()
    if (token) {
      await db.session.deleteMany({ where: { id: token } })
    }
    await clearSessionCookie()
    return jsonOk({ ok: true })
  })
}
