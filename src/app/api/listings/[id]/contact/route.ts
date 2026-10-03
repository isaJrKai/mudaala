// GET /api/listings/[id]/contact - the seller's number, revealed on tap.
//
// The ad pages (/l/[id]) keep the number OUT of the server HTML, so scraper
// sweeps that collect every ad's phone in bulk find nothing to harvest. A
// buyer who genuinely opened the ad taps once and gets it - priced at 20
// reveals per IP per hour (env-tunable), the same data the ad always gave,
// just no longer free to a crawler that never looked at the page.

import { route, jsonOk, ApiError } from '@/lib/api'
import { hit, CONTACT_IP_MAX, CONTACT_WINDOW_MS } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/client-ip'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const ip = getClientIp(request)
    const verdict = await hit(`contact:ip:${ip}`, CONTACT_IP_MAX, CONTACT_WINDOW_MS)
    if (!verdict.ok) {
      throw new ApiError(429, 'Too many number lookups. Please wait a while, then try again')
    }

    const { id } = await params
    const listing = await db.listing.findFirst({
      where: { id, status: 'ACTIVE' },
      select: { contactPhone: true, contactWhatsapp: true, type: true },
    })
    if (!listing) throw new ApiError(404, 'This ad is no longer available')

    // Same rule the ad page always used: an OFFER's contact phone is also its
    // WhatsApp unless the seller set a separate number; a REQUEST needs an
    // explicit WhatsApp.
    const whatsapp = listing.contactWhatsapp ?? (listing.type === 'OFFER' ? listing.contactPhone : null)
    return jsonOk({ phone: listing.contactPhone, whatsapp })
  })
}
