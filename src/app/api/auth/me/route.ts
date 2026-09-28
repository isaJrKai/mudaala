import { route, jsonOk } from '@/lib/api'
import { getSessionUser, toPublicUser } from '@/lib/auth'

export async function GET() {
  return route(async () => {
    const user = await getSessionUser()
    return jsonOk({ user: user ? toPublicUser(user) : null })
  })
}
