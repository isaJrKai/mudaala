import { NextRequest } from 'next/server'
import { route, jsonOk, ApiError } from '@/lib/api'
import { getShopPage } from '@/lib/shop'

type Params = { params: Promise<{ id: string }> }

// Public shop page - the seller's own space: identity, trust checklist and
// their full ACTIVE catalogue. No sign-in for buyers, ever.
export async function GET(_request: NextRequest, { params }: Params) {
  return route(async () => {
    const { id } = await params
    const data = await getShopPage(id)
    if (!data) throw new ApiError(404, 'This shop does not exist')
    return jsonOk(data)
  })
}
