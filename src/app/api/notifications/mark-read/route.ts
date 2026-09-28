import { route, jsonOk, requireUser, readIdList, ApiError } from '@/lib/api'
import { db } from '@/lib/db'

// Mark notifications read. Accepts ?ids=a,b or ?ids=all.
export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser()
    const raw = new URL(request.url).searchParams.get('ids')
    const ids = readIdList(raw)
    if (ids === null) throw new ApiError(400, 'Specify ids or "all"')

    if (ids === 'all') {
      await db.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } })
    } else {
      // userId filter guarantees a user can never mark another user's notifications.
      await db.notification.updateMany({ where: { id: { in: ids }, userId: user.id }, data: { read: true } })
    }
    return jsonOk({ ok: true })
  })
}
