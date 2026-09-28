import { route, jsonOk, parseBody, requireUser } from '@/lib/api'
import { businessProfileSchema } from '@/lib/validation'
import { db } from '@/lib/db'

export async function GET() {
  return route(async () => {
    const user = await requireUser()
    const profile = await db.businessProfile.findUnique({ where: { userId: user.id } })
    return jsonOk({ profile })
  })
}

// Upsert own business profile. No verification claims are made anywhere —
// the verified flag stays false until a real verification process exists.
export async function PUT(request: Request) {
  return route(async () => {
    const user = await requireUser()
    const data = await parseBody(request, businessProfileSchema)

    const profile = await db.businessProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data, verified: false },
      update: { ...data, verified: false },
    })
    return jsonOk({ profile })
  })
}
