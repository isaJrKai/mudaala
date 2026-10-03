// Shared server-side helpers for the public web pages (/l/[id], /s/[code]).
// Everything here touches the database or the expiry sweep, so client
// bundles must never import from this file.

import { cache } from 'react'
import { db } from '@/lib/db'
import { expireOverdueListings } from '@/lib/listings'
import { formatPrice } from '@/lib/format'
import { unitLabel } from '@/lib/constants'
import { siteUrl } from '@/lib/site'

export function photosOf(photosJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(photosJson)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is string => typeof p === 'string').slice(0, 8)
  } catch {
    return []
  }
}

export function absolutePhoto(photo: string): string {
  return photo.startsWith('http') ? photo : new URL(photo, siteUrl).toString()
}

export function placeOf(listing: { area: string | null; county: string }): string {
  return listing.area ? `${listing.area}, ${listing.county}` : listing.county
}

export function priceLabelOf(listing: { price: number | null; unit: string | null; currency: string }): string | null {
  if (listing.price === null) return null
  return formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)
}

// Metadata title in the agreed shape: "Red onions · USh 5,200 / kg · Mudaala".
// A wanted ad is never titled like an offer, and an offer without a price
// leads with where it is instead.
export function metaTitle(listing: {
  type: string
  title: string
  area: string | null
  county: string
  price: number | null
  unit: string | null
  currency: string
}): string {
  if (listing.type === 'REQUEST') return `Wanted: ${listing.title} · ${placeOf(listing)} · Mudaala`
  const price = priceLabelOf(listing)
  return price ? `${listing.title} · ${price} · Mudaala` : `${listing.title} · ${placeOf(listing)} · Mudaala`
}

export function metaDescription(listing: { description: string; area: string | null; county: string }): string {
  const base = listing.description.replace(/\s+/g, ' ').trim()
  const clipped = base.length > 140 ? `${base.slice(0, 140).replace(/\s+\S*$/, '')}…` : base
  return `${clipped} · ${placeOf(listing)}, Uganda · on Mudaala`
}

// One loader per request (React.cache dedupes the generateMetadata + page +
// not-found trio). Resolves the bare id first, then the dash-tail of older
// keyword-style URLs. Never throws or redirects - callers decide between
// 308, 404 and render, so the not-found boundary can reuse it safely.
export const loadAdRow = cache(async (param: string) => {
  await expireOverdueListings()

  let listing = await db.listing.findUnique({
    where: { id: param },
    include: { user: { include: { profile: true } } },
  })
  if (!listing && param.includes('-')) {
    const tail = param.slice(param.lastIndexOf('-') + 1)
    if (tail) {
      listing = await db.listing.findUnique({
        where: { id: tail },
        include: { user: { include: { profile: true } } },
      })
    }
  }
  return listing
})

export type AdRow = NonNullable<Awaited<ReturnType<typeof loadAdRow>>>

// Live ads a gone page can offer instead: same category, real stock, the
// freshest first. At most four - a 404 is a doorway, not a marketplace.
export async function similarListings(category: string, excludeId: string) {
  return db.listing.findMany({
    where: { status: 'ACTIVE', category, id: { not: excludeId } },
    orderBy: { refreshedAt: 'desc' },
    take: 4,
  })
}
