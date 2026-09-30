// Duuka — listing domain service.
// Search, expiry, refresh rules, saved-search matching.
// All time-dependent logic reads persisted timestamps; nothing is faked in the UI.

import { db } from '@/lib/db'
import { ApiError } from '@/lib/api'
import { isTransitionAllowed } from '@/lib/validation'
import { LISTING_ACTIVE_DAYS, REFRESH_COOLDOWN_HOURS, EXPIRING_SOON_DAYS } from '@/lib/constants'
import type { Listing, Prisma } from '@prisma/client'
import type { ListingQuery } from '@/lib/validation'

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function buildSearchText(parts: { title: string; description: string; category: string; area?: string | null; county: string }): string {
  return [parts.title, parts.description, parts.category, parts.area ?? '', parts.county]
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Lazy expiry sweep — idempotent, runs on reads that matter.
// Persisted timestamps decide; expired listings are marked EXPIRED and owners notified.
export async function expireOverdueListings(): Promise<number> {
  const now = new Date()
  const overdue = await db.listing.findMany({
    where: { status: 'ACTIVE', expiresAt: { lt: now } },
    select: { id: true, userId: true, title: true, expiresAt: true },
    take: 500,
  })
  if (overdue.length === 0) return 0
  await db.listing.updateMany({
    where: { id: { in: overdue.map((l) => l.id) } },
    data: { status: 'EXPIRED' },
  })
  await db.notification.createMany({
    data: overdue.map((l) => ({
      userId: l.userId,
      type: 'LISTING_EXPIRED',
      title: 'Listing expired',
      body: `"${l.title}" has expired. Repost it if it is still available.`,
      listingId: l.id,
    })),
  })
  return overdue.length
}

// "Expiring soon" warnings — sent once per listing via expiringNotifiedAt.
export async function notifyExpiringSoon(): Promise<number> {
  const soon = addDays(new Date(), EXPIRING_SOON_DAYS)
  const candidates = await db.listing.findMany({
    where: { status: 'ACTIVE', expiresAt: { lt: soon, gt: new Date() }, expiringNotifiedAt: null },
    select: { id: true, userId: true, title: true, expiresAt: true },
    take: 500,
  })
  if (candidates.length === 0) return 0
  await db.listing.updateMany({
    where: { id: { in: candidates.map((l) => l.id) } },
    data: { expiringNotifiedAt: new Date() },
  })
  await db.notification.createMany({
    data: candidates.map((l) => ({
      userId: l.userId,
      type: 'LISTING_EXPIRING',
      title: 'Listing expiring soon',
      body: `"${l.title}" expires on ${l.expiresAt.toISOString().slice(0, 10)}. Refresh it to stay visible.`,
      listingId: l.id,
    })),
  })
  return candidates.length
}

export interface SearchOptions {
  query: ListingQuery
  includeStatuses?: string[]
}

// The shop identity every buyer should see next to a listing: the named
// business profile (shop name + shop photo), falling back to the account name.
export const SHOP_OWNER_INCLUDE = {
  user: {
    select: {
      id: true,
      name: true,
      profile: { select: { businessName: true, photoUrl: true } },
    },
  },
} as const

export type ListingWithShop = Prisma.ListingGetPayload<{ include: typeof SHOP_OWNER_INCLUDE }>

// A listing as it leaves the API: the stored JSON photos string becomes a
// real array.
export type Serialized<L extends { photos: string }> = Omit<L, 'photos'> & { photos: string[] }

// Stored photos are a JSON array of URL strings; corrupt data degrades to [].
export function parsePhotos(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 500)
      .slice(0, 4)
  } catch {
    return []
  }
}

// Client-supplied photo lists are never trusted: keep only valid URL shapes,
// dedupe, cap at 4. Entries come from our own upload API (/uploads/...) or
// are pasted http(s) links.
export function sanitizePhotos(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const v of input) {
    if (typeof v !== 'string') continue
    const t = v.trim()
    if (t.length === 0 || t.length > 500) continue
    const allowed = t.startsWith('/uploads/') || /^https?:\/\/\S+$/i.test(t)
    if (allowed && !out.includes(t)) out.push(t)
    if (out.length >= 4) break
  }
  return out
}

// Serialize a listing for the API: photos become a real array.
export function serializeListing<T extends { photos: string }>(listing: T): Serialized<T> {
  const { photos, ...rest } = listing
  return { ...rest, photos: parsePhotos(photos) }
}

export async function searchListings({ query, includeStatuses = ['ACTIVE'] }: SearchOptions): Promise<{
  items: Serialized<ListingWithShop>[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}> {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20

  const where: Prisma.ListingWhereInput = { status: { in: includeStatuses } }

  if (query.q) {
    where.searchText = { contains: query.q.toLowerCase() }
  }
  if (query.type) where.type = query.type
  if (query.category) where.category = query.category
  if (query.county) where.county = query.county
  if (query.unit) where.unit = query.unit
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.price = {
      ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
    }
  }

  const orderBy: Prisma.ListingOrderByWithRelationInput =
    query.sort === 'price_asc' ? { price: 'asc' } : query.sort === 'price_desc' ? { price: 'desc' } : { refreshedAt: 'desc' }

  const [rows, total] = await Promise.all([
    db.listing.findMany({
      where,
      orderBy: [orderBy],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: SHOP_OWNER_INCLUDE,
    }),
    db.listing.count({ where }),
  ])

  const items = rows.map(serializeListing)
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}

// Check a listing against a saved-search query (shared matching rules).
export function listingMatchesQuery(listing: Listing, query: ListingQuery): boolean {
  if (query.type && listing.type !== query.type) return false
  if (query.category && listing.category !== query.category) return false
  if (query.county && listing.county !== query.county) return false
  if (query.unit && listing.unit !== query.unit) return false
  if (query.q) {
    const haystack = `${listing.title} ${listing.description} ${listing.category} ${listing.area ?? ''} ${listing.county}`.toLowerCase()
    if (!haystack.includes(query.q.toLowerCase())) return false
  }
  if (query.minPrice !== undefined && (listing.price === null || listing.price < query.minPrice)) return false
  if (query.maxPrice !== undefined && (listing.price === null || listing.price > query.maxPrice)) return false
  return true
}

// After a new listing is published, update every OTHER user's saved searches
// that match it and send real NEW_MATCH notifications with real counts.
export async function notifySavedSearchMatches(listing: Listing): Promise<void> {
  const searches = await db.savedSearch.findMany({
    where: { userId: { not: listing.userId } },
    include: { user: { select: { id: true } } },
  })
  for (const search of searches) {
    let parsed: ListingQuery
    try {
      parsed = JSON.parse(search.queryJson) as ListingQuery
    } catch {
      console.error(`[saved-search] corrupt queryJson for ${search.id}`)
      continue
    }
    if (!listingMatchesQuery(listing, parsed)) continue

    // Recompute the honest total of currently matching ACTIVE listings.
    const total = await db.listing.count({ where: { ...whereFromQuery(parsed), status: 'ACTIVE' } })
    await db.$transaction([
      db.savedSearch.update({ where: { id: search.id }, data: { lastMatchCount: total, lastCheckedAt: new Date() } }),
      db.notification.create({
        data: {
          userId: search.userId,
          type: 'NEW_MATCH',
          title: `New match for "${search.name}"`,
          body: `"${listing.title}" (${listing.county}) matches your saved search.`,
          listingId: listing.id,
        },
      }),
    ])
  }
}

function whereFromQuery(query: ListingQuery): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {}
  if (query.type) where.type = query.type
  if (query.category) where.category = query.category
  if (query.county) where.county = query.county
  if (query.unit) where.unit = query.unit
  if (query.q) where.searchText = { contains: query.q.toLowerCase() }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.price = {
      ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
    }
  }
  return where
}

// Refresh: bump refreshedAt, extend expiry. ACTIVE only, 24h cooldown.
export async function refreshListing(listing: Listing): Promise<Listing> {
  if (listing.status !== 'ACTIVE') {
    throw new ApiError(409, 'Only active listings can be refreshed. Repost it instead.')
  }
  const cooldownEnds = new Date(listing.refreshedAt.getTime() + REFRESH_COOLDOWN_HOURS * 60 * 60 * 1000)
  if (cooldownEnds.getTime() > Date.now()) {
    throw new ApiError(429, `You can refresh this listing again after ${cooldownEnds.toLocaleString('en-KE')}`)
  }
  const now = new Date()
  return db.listing.update({
    where: { id: listing.id },
    data: { refreshedAt: now, expiresAt: addDays(now, LISTING_ACTIVE_DAYS), expiringNotifiedAt: null },
  })
}

// Ownership is enforced here — callers pass the authenticated user's id.
export async function getOwnedListingOr404(id: string, userId: string): Promise<Listing> {
  const listing = await db.listing.findUnique({ where: { id } })
  if (!listing) throw new ApiError(404, 'Listing not found')
  if (listing.userId !== userId) {
    // Deliberately identical to 404: never confirm existence to non-owners.
    throw new ApiError(404, 'Listing not found')
  }
  return listing
}

export { buildSearchText, addDays }
