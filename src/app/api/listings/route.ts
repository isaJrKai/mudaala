import { NextRequest } from 'next/server'
import { route, jsonOk, parseBody, requireUser, ApiError } from '@/lib/api'
import { listingCreateSchema, listingQuerySchema } from '@/lib/validation'
import { db } from '@/lib/db'
import {
  expireOverdueListings,
  notifyExpiringSoon,
  searchListings,
  buildSearchText,
  notifySavedSearchMatches,
} from '@/lib/listings'
import { LISTING_ACTIVE_DAYS } from '@/lib/constants'

// Public search — filter, sort and paginate in the database, not the browser.
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
    for (const key of ['minPrice', 'maxPrice', 'page', 'pageSize']) {
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
    const data = await parseBody(request, listingCreateSchema)

    const now = new Date()
    const listing = await db.listing.create({
      data: {
        userId: user.id,
        type: data.type,
        title: data.title,
        description: data.description,
        category: data.category,
        price: data.price,
        priceNegotiable: data.priceNegotiable,
        unit: data.unit,
        quantity: data.quantity,
        county: data.county,
        area: data.area,
        contactPhone: data.contactPhone,
        contactWhatsapp: data.contactWhatsapp,
        status: 'ACTIVE',
        searchText: buildSearchText({
          title: data.title,
          description: data.description,
          category: data.category,
          area: data.area,
          county: data.county,
        }),
        publishedAt: now,
        refreshedAt: now,
        expiresAt: new Date(now.getTime() + LISTING_ACTIVE_DAYS * 24 * 60 * 60 * 1000),
      },
    })

    // Real saved-search notifications (never fake counts).
    await notifySavedSearchMatches(listing).catch((err) =>
      console.error('[listings] saved-search match failed:', err),
    )

    return jsonOk({ listing }, 201)
  })
}
