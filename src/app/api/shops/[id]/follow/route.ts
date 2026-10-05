import { NextRequest } from 'next/server'
import { route, jsonOk, requireUser, ApiError } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

// Follow state is deliberately tied to the shop owner's User id. A shop is
// already the seller's identity in Mudaala, so there is no second identity
// system to keep in sync.
export async function GET(_request: NextRequest, { params }: Params) {
  return route(async () => {
    const { id } = await params
    const shop = await db.user.findUnique({ where: { id }, select: { id: true, profile: { select: { businessName: true } } } })
    if (!shop || !shop.profile) throw new ApiError(404, 'This shop does not exist')

    const followerCount = await db.shopFollow.count({ where: { shopOwnerId: id } })
    const viewer = await getSessionUser()
    const following = viewer ? Boolean(await db.shopFollow.findUnique({
      where: { followerId_shopOwnerId: { followerId: viewer.id, shopOwnerId: id } },
      select: { id: true },
    })) : false

    return jsonOk({ followerCount, following, signedIn: Boolean(viewer), ownShop: viewer?.id === id })
  })
}

export async function POST(_request: NextRequest, { params }: Params) {
  return route(async () => {
    const { id } = await params
    const viewer = await requireUser()
    if (viewer.id === id) throw new ApiError(400, 'You cannot follow your own shop')

    const shop = await db.user.findUnique({ where: { id }, select: { id: true, profile: { select: { id: true } } } })
    if (!shop?.profile) throw new ApiError(404, 'This shop does not exist')

    await db.shopFollow.upsert({
      where: { followerId_shopOwnerId: { followerId: viewer.id, shopOwnerId: id } },
      create: { followerId: viewer.id, shopOwnerId: id },
      update: {},
    })

    const followerCount = await db.shopFollow.count({ where: { shopOwnerId: id } })
    return jsonOk({ followerCount, following: true })
  })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return route(async () => {
    const { id } = await params
    const viewer = await requireUser()
    if (viewer.id === id) throw new ApiError(400, 'You cannot unfollow your own shop')

    await db.shopFollow.deleteMany({ where: { followerId: viewer.id, shopOwnerId: id } })
    const followerCount = await db.shopFollow.count({ where: { shopOwnerId: id } })
    return jsonOk({ followerCount, following: false })
  })
}
