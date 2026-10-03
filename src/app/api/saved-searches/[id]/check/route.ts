import { NextRequest } from 'next/server'
import { route, jsonOk, requireUser, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { searchListings } from '@/lib/listings'
import { listingQuerySchema } from '@/lib/validation'

type Params = { params: Promise<{ id: string }> }

// Recompute the match count against the database - honest numbers only.
export async function POST(_request: NextRequest, { params }: Params) {
  return route(async () => {
    const user = await requireUser()
    const { id } = await params
    const search = await db.savedSearch.findUnique({ where: { id } })
    if (!search || search.userId !== user.id) {
      throw new ApiError(404, 'Saved search not found')
    }

    let query: unknown
    try {
      query = JSON.parse(search.queryJson)
    } catch {
      throw new ApiError(500, 'This saved search is corrupted. Delete and recreate it.')
    }
    const parsed = listingQuerySchema.safeParse(query)
    if (!parsed.success) {
      throw new ApiError(500, 'This saved search is corrupted. Delete and recreate it.')
    }

    const { total } = await searchListings({ query: { ...parsed.data, page: 1, pageSize: 1 } })
    const updated = await db.savedSearch.update({
      where: { id },
      data: { lastMatchCount: total, lastCheckedAt: new Date() },
    })
    return jsonOk({ search: updated })
  })
}
