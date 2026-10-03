import { route, jsonOk, requireUser, readIdList, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { expireOverdueListings, notifyExpiringSoon } from '@/lib/listings'

export async function GET() {
  return route(async () => {
    const user = await requireUser('Sign in to see your notifications')
    // Sweeps keep notification content truthful even if the user hasn't browsed.
    await expireOverdueListings()
    await notifyExpiringSoon()

    const notifications = await db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const unreadCount = await db.notification.count({ where: { userId: user.id, read: false } })
    return jsonOk({ notifications, unreadCount })
  })
}

// Clear (delete) notifications. Accepts ?ids=a,b or ?ids=all - the remove
// counterpart of mark-read: read keeps history, clear is gone for good, so
// the UI confirms before calling this. userId filter scopes every delete to
// the caller; a user can never clear another user's alerts.
export async function DELETE(request: Request) {
  return route(async () => {
    const user = await requireUser()
    const raw = new URL(request.url).searchParams.get('ids')
    const ids = readIdList(raw)
    if (ids === null) throw new ApiError(400, 'Specify ids or "all"')

    if (ids === 'all') {
      await db.notification.deleteMany({ where: { userId: user.id } })
    } else {
      await db.notification.deleteMany({ where: { id: { in: ids }, userId: user.id } })
    }
    return jsonOk({ ok: true })
  })
}
