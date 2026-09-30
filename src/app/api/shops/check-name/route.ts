import { NextRequest } from 'next/server'
import { route, jsonOk, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { normalizeShopName } from '@/lib/format'

// Public shop-name availability check — powers the live "suggest area" hint
// while a seller types their shop name. Shop names are public data (they show
// on every browse card), so a public read here leaks nothing new.
//
// GET /api/shops/check-name?name=Nakato+Fresh+Produce&exclude=<own userId>
// → { taken: boolean, matches: [{ area, county }] } (max 3 matches)
//
// `exclude` lets a seller edit the rest of their profile without their own
// shop name being flagged as a collision.
export async function GET(request: NextRequest) {
  return route(async () => {
    const name = (request.nextUrl.searchParams.get('name') ?? '').trim()
    if (name.length < 2) throw new ApiError(400, 'Type at least 2 characters of the shop name')
    if (name.length > 80) throw new ApiError(400, 'Shop names are at most 80 characters')

    const exclude = (request.nextUrl.searchParams.get('exclude') ?? '').trim()

    const profiles = await db.businessProfile.findMany({
      where: { businessName: { not: '' } },
      select: { userId: true, businessName: true, area: true, county: true },
    })

    const key = normalizeShopName(name)
    const matches = profiles
      .filter((p) => p.userId !== exclude && normalizeShopName(p.businessName) === key)
      .slice(0, 3)
      .map((p) => ({ area: p.area, county: p.county }))

    return jsonOk({ taken: matches.length > 0, matches })
  })
}
