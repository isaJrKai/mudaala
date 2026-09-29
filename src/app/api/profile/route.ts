import { route, jsonOk, parseBody, requireUser, ApiError } from '@/lib/api'
import { businessProfileSchema, normalizePhone, type CountryKey } from '@/lib/validation'
import { db } from '@/lib/db'

export async function GET() {
  return route(async () => {
    const user = await requireUser()
    const profile = await db.businessProfile.findUnique({ where: { userId: user.id } })
    return jsonOk({ profile })
  })
}

// Upsert own business profile. The businessName here is the seller's SHOP
// NAME — the name buyers see on every listing. No verification claims are
// made anywhere: the verified flag stays false until a real process exists.
export async function PUT(request: Request) {
  return route(async () => {
    const user = await requireUser()
    const data = await parseBody(request, businessProfileSchema)

    // Contact numbers follow the account's country.
    const country = (user.country ?? 'UG') as CountryKey
    const phone = normalizePhone(data.phone, country)
    if (!phone) {
      throw new ApiError(400, 'Enter a valid phone number for your country', {
        phone: 'Invalid phone number for your country',
      })
    }
    const whatsapp = data.whatsapp ? normalizePhone(data.whatsapp, country) : null
    if (data.whatsapp && !whatsapp) {
      throw new ApiError(400, 'Enter a valid WhatsApp number for your country', {
        whatsapp: 'Invalid WhatsApp number for your country',
      })
    }

    const profile = await db.businessProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data, phone, whatsapp, verified: false },
      update: { ...data, phone, whatsapp, verified: false },
    })
    return jsonOk({ profile })
  })
}
