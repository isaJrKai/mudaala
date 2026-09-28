import { route, jsonOk, requireUser } from '@/lib/api'
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
