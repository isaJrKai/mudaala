import { route, jsonOk, parseBody, requireUser } from '@/lib/api'
import { profileLocationSchema } from '@/lib/validation'
import { db } from '@/lib/db'
import { roundCoord } from '@/lib/geo'
import { generateShopCode } from '@/lib/shop'

// Save or remove the seller's shop spot. This is the ONLY way coordinates
// enter the system - the main profile PUT strips unknown keys, so regular
// "Save shop" form writes can never clobber (or set) a location.
//
// Privacy: coordinates are rounded to 3 decimals (~100 m) BEFORE storing, so
// a precise spot never exists server-side. Sharing is always optional -
// shops without a spot still rank normally and show their area text.
export async function PUT(request: Request) {
  return route(async () => {
    const user = await requireUser()
    const data = await parseBody(request, profileLocationSchema)

    const lat = data.lat === null ? null : roundCoord(data.lat)
    const lng = data.lng === null ? null : roundCoord(data.lng)

    const profile = await db.businessProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        businessName: user.name,
        phone: user.phone,
        lat,
        lng,
        shopCode: await generateShopCode(),
      },
      update: { lat, lng },
    })
    return jsonOk({ profile })
  })
}
