// Home dashboard data - the signed-in landing view.
//
// Every number here is computed from records that already exist: saved
// searches, listings, notifications. The one piece of NEW state is
// User.lastHomeVisitAt, which marks where "new matches since last visit"
// counts from. Visits are recorded by POST /api/home/visit (fired once per
// Home mount) so the GET stays read-only - refreshing the dashboard never
// silently zeroes the card while the user is looking at it.

import { route, jsonOk, requireUser } from '@/lib/api'
import { db } from '@/lib/db'
import { expireOverdueListings } from '@/lib/listings'
import { STALE_LISTING_DAYS } from '@/lib/constants'

export async function GET() {
  return route(async () => {
    const user = await requireUser('Sign in to see your home dashboard')
    // Sweeps keep every count below truthful even if the user hasn't browsed.
    await expireOverdueListings()

    const staleCutoff = new Date(Date.now() - STALE_LISTING_DAYS * 24 * 60 * 60 * 1000)
    const [savedSearches, savedSearchCount, activeListings, lastListing, staleListings, staleCount, lastMatchNotifications] =
      await Promise.all([
        db.savedSearch.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 4,
          select: { id: true, name: true, queryJson: true, lastMatchCount: true },
        }),
        db.savedSearch.count({ where: { userId: user.id } }),
        db.listing.count({ where: { userId: user.id, status: 'ACTIVE' } }),
        db.listing.findFirst({
          where: { userId: user.id },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        db.listing.findMany({
          where: { userId: user.id, status: 'ACTIVE', refreshedAt: { lt: staleCutoff } },
          orderBy: { refreshedAt: 'asc' },
          select: { id: true, title: true, refreshedAt: true },
          take: 3,
        }),
        db.listing.count({ where: { userId: user.id, status: 'ACTIVE', refreshedAt: { lt: staleCutoff } } }),
        // "New matches" = DISTINCT listings that matched one of this user's
        // saved searches since their last visit, as recorded by the real
        // NEW_MATCH notifications the publish flow already sends.
        db.notification.findMany({
          where: {
            userId: user.id,
            type: 'NEW_MATCH',
            ...(user.lastHomeVisitAt ? { createdAt: { gt: user.lastHomeVisitAt } } : {}),
          },
          select: { listingId: true },
          take: 200,
        }),
      ])

    // The location the "Best offers near you" section starts from: the user's
    // own shop area (their felt location), falling back to the district of
    // their most recent listing. Their blurred shop spot (~100 m) also powers
    // nearest-first ordering and distance chips when present.
    const profile = await db.businessProfile.findUnique({
      where: { userId: user.id },
      select: { area: true, county: true, lat: true, lng: true },
    })
    const recentListing = await db.listing.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { county: true },
    })
    const location = profile?.county
      ? { area: profile.area, county: profile.county, lat: profile.lat, lng: profile.lng, source: 'profile' as const }
      : recentListing?.county
        ? { area: null, county: recentListing.county, lat: null, lng: null, source: 'listing' as const }
        : { area: null, county: null, lat: null, lng: null, source: 'none' as const }

    const firstName = user.name.trim().split(/\s+/)[0]

    return jsonOk({
      user: { firstName },
      stats: {
        savedSearches: savedSearchCount,
        activeListings,
        newMatches: new Set(lastMatchNotifications.map((n) => n.listingId).filter(Boolean)).size,
        lastUpdatedAt: lastListing?.updatedAt.toISOString() ?? null,
      },
      savedSearches,
      staleListings: staleListings.map((l) => ({
        id: l.id,
        title: l.title,
        refreshedAt: l.refreshedAt.toISOString(),
        ageDays: Math.floor((Date.now() - l.refreshedAt.getTime()) / (24 * 60 * 60 * 1000)),
      })),
      staleCount,
      location,
    })
  })
}
