import { NextRequest } from 'next/server'
import { route, jsonOk, requireUser, ApiError } from '@/lib/api'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_request: NextRequest, { params }: Params) {
  return route(async () => {
    const user = await requireUser()
    const { id } = await params
    // Ownership check: a deleted-or-foreign id yields the same 404.
    const search = await db.savedSearch.findUnique({ where: { id } })
    if (!search || search.userId !== user.id) {
      throw new ApiError(404, 'Saved search not found')
    }
    await db.savedSearch.delete({ where: { id } })
    return jsonOk({ ok: true })
  })
}
