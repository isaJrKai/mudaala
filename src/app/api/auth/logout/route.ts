import { route, jsonOk } from '@/lib/api'
import { clearSessionCookie } from '@/lib/auth'
import { db } from '@/lib/db'
import { cookies } from 'next/headers'

export async function POST() {
  return route(async () => {
    // Delete only the current browser's session, not sessions on other devices.
    const store = await cookies()
    const token = store.get('cos_session')?.value
    if (token) {
      await db.session.deleteMany({ where: { id: token } })
    }
    await clearSessionCookie()
    return jsonOk({ ok: true })
  })
}
