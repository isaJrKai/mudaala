import { route, jsonOk, parseBody, requireUser, ApiError } from '@/lib/api'
import { savedSearchCreateSchema } from '@/lib/validation'
import { db } from '@/lib/db'
import { searchListings } from '@/lib/listings'

// Saved searches belong to the signed-in user; counts are computed, never invented.
export async function GET() {
  return route(async () => {
    const user = await requireUser()
    const searches = await db.savedSearch.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    return jsonOk({ searches })
  })
}

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser('Sign in to save a search')
    const data = await parseBody(request, savedSearchCreateSchema)

    const MAX_SAVED = 20
    const count = await db.savedSearch.count({ where: { userId: user.id } })
    if (count >= MAX_SAVED) {
      throw new ApiError(409, `You can save up to ${MAX_SAVED} searches. Remove one to add another.`)
    }

    // The initial match count is computed against real ACTIVE listings.
    const { total } = await searchListings({ query: { ...data.query, page: 1, pageSize: 1 } })

    const search = await db.savedSearch.create({
      data: {
        userId: user.id,
        name: data.name,
        queryJson: JSON.stringify(data.query),
        lastMatchCount: total,
        lastCheckedAt: new Date(),
      },
    })
    return jsonOk({ search }, 201)
  })
}
