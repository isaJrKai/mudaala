import { NextRequest } from 'next/server'
import { route, jsonOk, ApiError } from '@/lib/api'
import { lookupShopByCode } from '@/lib/shop'
import { normalizeShopCode } from '@/lib/format'

// Public shop-code lookup — the "till number" path: a buyer types DK-XXXX
// (read off a printed poster or heard by word of mouth) and gets that exact
// shop. No sign-in for buyers, ever.
//
// Distinct honest failures: a malformed code is 400 ("codes look like
// DK-2623"), a well-formed but unknown code is 404 naming the code back so
// the buyer can re-check the number with the shop.
export async function GET(request: NextRequest) {
  return route(async () => {
    const raw = request.nextUrl.searchParams.get('code')?.trim() ?? ''
    const code = normalizeShopCode(raw)
    if (!code) {
      throw new ApiError(400, 'A shop code looks like DK-2623 — 4 digits after DK')
    }
    const shop = await lookupShopByCode(code)
    if (!shop) {
      throw new ApiError(404, `No shop with code ${code} — check the number with the shop`)
    }
    return jsonOk({ shop })
  })
}
