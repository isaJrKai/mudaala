// GET /api/account/export - everything Mudaala holds about YOU, as one JSON
// file. Data portability is a promise, not a feature request: the download
// carries the account facts, the shop, every listing, saved searches,
// notifications, reports filed and the operational metadata (password-reset
// requests, session history). Secrets never leave the building: no password
// hash, no reset codes, and session rows come without their token ids - a
// data export that leaks live credentials would be a hole, not a feature.

import { NextResponse } from 'next/server'
import { route, requireUser } from '@/lib/api'
import { db } from '@/lib/db'

export async function GET() {
  return route(async () => {
    const user = await requireUser('Sign in to export your data')

    const [profile, listings, savedSearches, notifications, reportsFiled, passwordResetRequests, sessionRows] =
      await Promise.all([
        db.businessProfile.findUnique({ where: { userId: user.id } }),
        db.listing.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
        db.savedSearch.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
        db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
        db.report.findMany({ where: { reporterId: user.id }, orderBy: { createdAt: 'desc' } }),
        db.passwordReset.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, expiresAt: true, usedAt: true, attempts: true },
        }),
        db.session.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, expiresAt: true },
        }),
      ])

    // The password hash stays on the server. Everything else is the user's.
    const { passwordHash: _secret, ...safeUser } = user

    const payload = {
      app: 'Mudaala',
      exportedAt: new Date().toISOString(),
      user: safeUser,
      profile,
      listings,
      savedSearches,
      notifications,
      reportsFiled,
      passwordResetRequests,
      sessions: sessionRows,
    }

    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-disposition': `attachment; filename="mudaala-data-${stamp}.json"`,
      },
    })
  })
}
