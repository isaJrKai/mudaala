// DELETE /api/account - the door out, and it must cost the user something to
// walk through: the password, typed again. A stolen open tab alone cannot
// erase someone's shop.
//
// What goes:
//   - the user row, and with it (database cascade) every session, listing,
//     saved search, notification, the business profile and any password-reset
//     rows
//   - every photo those rows pointed at, deleted from storage (local disk or
//     the S3 bucket) AFTER the rows are gone - a failed file delete is logged,
//     never allowed to half-cancel an account deletion
//   - seed-fixture photos (/uploads/seed/) are shared development fixtures
//     and are never touched
//
// What stays, cut loose from the identity:
//   - reports the user filed: reporterId becomes null, the moderation record
//     keeps doing its job for the community it was written for
//   - audit-log rows the user acted in: actorId becomes null - the action
//     happened; the actor no longer exists

import { route, jsonOk, parseBody, requireUser, ApiError } from '@/lib/api'
import { accountDeleteSchema } from '@/lib/validation'
import { verifyPassword, clearSessionCookie } from '@/lib/auth'
import { chooseStorage } from '@/lib/storage'
import { photosOf } from '@/lib/ad-page'
import { db } from '@/lib/db'

export async function DELETE(request: Request) {
  return route(async () => {
    const user = await requireUser('Sign in to delete your account')
    const data = await parseBody(request, accountDeleteSchema)

    if (!verifyPassword(data.password, user.passwordHash)) {
      // 403 on purpose: the session is valid, the action is denied. A 401
      // here would read as a dead session to the client's self-heal and
      // silently clear the token of someone who merely mistyped.
      throw new ApiError(403, 'That password does not match. Nothing was deleted.')
    }

    // Collect every photo URL the account owns before the rows disappear.
    const [listings, profile] = await Promise.all([
      db.listing.findMany({ where: { userId: user.id }, select: { photos: true } }),
      db.businessProfile.findUnique({ where: { userId: user.id }, select: { photoUrl: true } }),
    ])
    const photoUrls = new Set<string>()
    for (const listing of listings) {
      for (const url of photosOf(listing.photos)) {
        if (!url.includes('/uploads/seed/')) photoUrls.add(url)
      }
    }
    if (profile?.photoUrl && !profile.photoUrl.includes('/uploads/seed/')) {
      photoUrls.add(profile.photoUrl)
    }

    // Anonymise BEFORE the cascade: these rows outlive the account on purpose.
    await db.report.updateMany({ where: { reporterId: user.id }, data: { reporterId: null } })
    await db.auditLog.updateMany({ where: { actorId: user.id }, data: { actorId: null } })

    // The cascade takes sessions, listings, saved searches, notifications,
    // the business profile and password-reset rows with it.
    await db.user.delete({ where: { id: user.id } })
    await clearSessionCookie()

    // Storage cleanup last, best-effort per file: the account is already gone,
    // so one stubborn object is a cleanup log line, not a failed request.
    const storage = chooseStorage()
    const results = await Promise.allSettled([...photoUrls].map((url) => storage.remove(url)))
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[account] photo cleanup failed:', result.reason instanceof Error ? result.reason.message : result.reason)
      }
    }

    return jsonOk({ deleted: true })
  })
}
