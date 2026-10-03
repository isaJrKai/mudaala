import { NextRequest } from 'next/server'
import { route, jsonOk, parseBody, requireUser, ApiError } from '@/lib/api'
import { hit, PUBLISH_DAY_MAX, PUBLISH_WINDOW_MS } from '@/lib/rate-limit'
import { listingCreateSchema, listingQuerySchema, normalizePhone, type CountryKey } from '@/lib/validation'
import { db } from '@/lib/db'
import {
  expireOverdueListings,
  notifyExpiringSoon,
  searchListings,
  notifySavedSearchMatches,
  sanitizePhotos,
  serializeListing,
} from '@/lib/listings'
import { LISTING_ACTIVE_DAYS, countryDef, currencyDef, findProhibitedItem } from '@/lib/constants'

// Public search - filter, sort and paginate in the database, not the browser.
export async function GET(request: NextRequest) {
  return route(async () => {
    // Real time-dependent behaviour: overdue listings are expired on read.
    await expireOverdueListings()
    notifyExpiringSoon().catch((err) => console.error('[listings] expiring-soon sweep failed:', err))

    const raw = Object.fromEntries(request.nextUrl.searchParams.entries())
    const cleaned = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== '' && v !== 'any'),
    )
    // Numeric coercion for query params arriving as strings.
    const coerced: Record<string, unknown> = { ...cleaned }
    for (const key of ['minPrice', 'maxPrice', 'page', 'pageSize', 'lat', 'lng']) {
      if (typeof coerced[key] === 'string' && (coerced[key] as string) !== '') {
        coerced[key] = Number(coerced[key])
      }
    }
    const query = listingQuerySchema.safeParse(coerced)
    if (!query.success) {
      throw new ApiError(400, 'Invalid search filters')
    }
    const result = await searchListings({ query: query.data })
    return jsonOk(result)
  })
}

// Publish a listing. Ownership and every field are validated server-side.
export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser('Sign in to publish a listing')

    // 20 listings per user per day - a real shop restocking is welcome;
    // catalogue-spam is not.
    const verdict = hit(`publish:user:${user.id}`, PUBLISH_DAY_MAX, PUBLISH_WINDOW_MS)
    if (!verdict.ok) {
      throw new ApiError(429, 'You have published a lot today - please continue tomorrow')
    }

    const data = await parseBody(request, listingCreateSchema)

    // Prohibited items: check the words a seller chose BEFORE anything is
    // written. The list lives in constants.ts and is meant to be edited;
    // the rejection says plainly what is not allowed and why.
    const banned = findProhibitedItem(data.title, data.description ?? '')
    if (banned) {
      throw new ApiError(400, banned.message, {
        title: 'This listing cannot be published - ' + banned.label.toLowerCase(),
      })
    }

    // Country comes from the account (the client may also send it); currency
    // defaults to that country's currency unless the listing picks one.
    const country = (data.country ?? user.country ?? 'UG') as CountryKey
    const currency = data.currency ?? currencyDef(country).key
    const contactPhone = normalizePhone(data.contactPhone, country)
    if (!contactPhone) {
      throw new ApiError(400, 'Enter a valid phone number for the selected country', {
        contactPhone: 'Invalid phone number for the selected country',
      })
    }
    const contactWhatsapp = data.contactWhatsapp ? normalizePhone(data.contactWhatsapp, country) : null
    if (data.contactWhatsapp && !contactWhatsapp) {
      throw new ApiError(400, 'Enter a valid WhatsApp number for the selected country', {
        contactWhatsapp: 'Invalid WhatsApp number for the selected country',
      })
    }
    // The location must belong to the listing's country.
    const def = countryDef(country)
    if (!def.locations.includes(data.county)) {
      throw new ApiError(400, `Choose a district or region in ${def.name}`, {
        county: `Choose a district or region in ${def.name}`,
      })
    }

    const now = new Date()
    const listing = await db.listing.create({
      data: {
        userId: user.id,
        type: data.type,
        title: data.title,
        description: data.description,
        category: data.category,
        price: data.price,
        compareAtPrice: data.compareAtPrice ?? null,
        currency,
        priceNegotiable: data.priceNegotiable,
        unit: data.unit,
        quantity: data.quantity,
        county: data.county,
        country,
        area: data.area,
        contactPhone,
        contactWhatsapp,
        photos: JSON.stringify(sanitizePhotos(data.photos)),
        status: 'ACTIVE',
        publishedAt: now,
        refreshedAt: now,
        expiresAt: new Date(now.getTime() + LISTING_ACTIVE_DAYS * 24 * 60 * 60 * 1000),
      },
    })

    // Real saved-search notifications (never fake counts).
    await notifySavedSearchMatches(listing).catch((err) =>
      console.error('[listings] saved-search match failed:', err),
    )

    return jsonOk({ listing: serializeListing(listing) }, 201)
  })
}
