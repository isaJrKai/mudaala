import { route, jsonOk, requireUser } from '@/lib/api'
import { db } from '@/lib/db'

export async function GET() {
  return route(async () => {
    const user = await requireUser()
    const follows = await db.shopFollow.findMany({
      where: { followerId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        shopOwner: {
          select: {
            id: true,
            name: true,
            profile: {
              select: {
                businessName: true,
                photoUrl: true,
                area: true,
                county: true,
                description: true,
              },
            },
            listings: { where: { status: 'ACTIVE' }, select: { id: true }, take: 200 },
          },
        },
      },
    })

    return jsonOk({
      shops: follows.map((follow) => ({
        id: follow.shopOwner.id,
        name: follow.shopOwner.profile?.businessName?.trim() || follow.shopOwner.name,
        photoUrl: follow.shopOwner.profile?.photoUrl ?? null,
        area: follow.shopOwner.profile?.area ?? null,
        county: follow.shopOwner.profile?.county ?? null,
        description: follow.shopOwner.profile?.description ?? null,
        activeListings: follow.shopOwner.listings.length,
        followedAt: follow.createdAt.toISOString(),
      })),
    })
  })
}
