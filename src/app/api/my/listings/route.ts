import { route, jsonOk, requireUser } from '@/lib/api'
import { db } from '@/lib/db'
import { expireOverdueListings, serializeListing } from '@/lib/listings'

// The signed-in user's own listings - every status, expiry truthfully shown.
export async function GET() {
  return route(async () => {
    const user = await requireUser()
    await expireOverdueListings()
    const listings = await db.listing.findMany({
      where: { userId: user.id },
      orderBy: { refreshedAt: 'desc' },
    })
    return jsonOk({ listings: listings.map(serializeListing) })
  })
}
