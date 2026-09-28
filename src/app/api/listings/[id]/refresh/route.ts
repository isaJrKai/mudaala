import { NextRequest } from 'next/server'
import { route, jsonOk, requireUser } from '@/lib/api'
import { getOwnedListingOr404, refreshListing } from '@/lib/listings'

type Params = { params: Promise<{ id: string }> }

// Refresh bumps refreshedAt and extends expiry — real persisted timestamps,
// guarded by the 24-hour cooldown rule.
export async function POST(_request: NextRequest, { params }: Params) {
  return route(async () => {
    const user = await requireUser()
    const { id } = await params
    const listing = await getOwnedListingOr404(id, user.id)
    const updated = await refreshListing(listing)
    return jsonOk({ listing: updated })
  })
}
