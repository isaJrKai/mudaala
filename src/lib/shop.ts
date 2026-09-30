// Duuka — shop domain service.
// The shop is the seller's own space: identity (name/photo/location/hours)
// plus their public catalogue (ACTIVE listings). Trust is earned honestly:
// we never claim platform vetting — the checklist reflects what the seller
// actually filled in, and the badge says exactly that.

import { db } from '@/lib/db'
import type { BusinessProfile, User } from '@prisma/client'
import { SHOP_OWNER_INCLUDE, serializeListing, expireOverdueListings } from '@/lib/listings'
import type { ListingWithShop } from '@/lib/listings'
import { countryDef, categoryLabel } from '@/lib/constants'

export interface ShopChecklist {
  photo: boolean
  description: boolean
  area: boolean
  hours: boolean
  whatsapp: boolean
}

export function shopChecklistFor(profile: BusinessProfile | null): ShopChecklist {
  return {
    photo: Boolean(profile?.photoUrl),
    description: Boolean(profile?.description && profile.description.trim().length > 0),
    area: Boolean(profile?.area && profile.area.trim().length > 0),
    hours: Boolean(profile?.hours && profile.hours.trim().length > 0),
    whatsapp: Boolean(profile?.whatsapp && profile.whatsapp.trim().length > 0),
  }
}

export function shopChecklistComplete(checklist: ShopChecklist): boolean {
  return Object.values(checklist).every(Boolean)
}

export interface ShopPageData {
  shop: {
    id: string
    name: string
    photoUrl: string | null
    description: string | null
    hours: string | null
    area: string | null
    county: string | null
    country: string
    phone: string
    whatsapp: string | null
    // Public identity code ("DK-4821") — stable for the life of the shop.
    shopCode: string | null
    memberSince: string
    activeCount: number
    checklist: ShopChecklist
    complete: boolean
  }
  listings: ReturnType<typeof serializeListing<ListingWithShop>>[]
}

// A shop's public identity code: "DK-" + 4 digits, like a mobile-money till
// number. Assigned once (on profile creation or by the backfill script) and
// NEVER regenerated — the code is how buyers and printed QR posters find the
// exact shop even when two shops share a name.
export async function generateShopCode(): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = `DK-${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`
    const clash = await db.businessProfile.findUnique({
      where: { shopCode: candidate },
      select: { id: true },
    })
    if (!clash) return candidate
  }
  // 10,000 slots — statistically unreachable at any realistic shop count.
  throw new Error('Could not allocate a unique shop code')
}

// Load a shop page by the owner's user id. Public — buyers never sign in.
// Overdue listings are expired first so the catalogue only shows real stock.
export async function getShopPage(userId: string): Promise<ShopPageData | null> {
  await expireOverdueListings()

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      phone: true,
      country: true,
      createdAt: true,
      profile: true,
    },
  })
  if (!user) return null

  const listings = await db.listing.findMany({
    where: { userId, status: 'ACTIVE' },
    orderBy: [{ refreshedAt: 'desc' }],
    include: SHOP_OWNER_INCLUDE,
    take: 200,
  })

  const profile = user.profile
  const checklist = shopChecklistFor(profile)
  const country = user.country ?? 'UG'

  return {
    shop: {
      id: user.id,
      // The shop name the seller chose — the account name is the fallback.
      name: profile?.businessName?.trim() || user.name,
      photoUrl: profile?.photoUrl ?? null,
      description: profile?.description ?? null,
      hours: profile?.hours ?? null,
      area: profile?.area ?? null,
      county: profile?.county ?? null,
      country,
      // The shop's contact numbers — the same ones buyers call from listings.
      phone: profile?.phone ?? user.phone,
      whatsapp: profile?.whatsapp ?? null,
      shopCode: profile?.shopCode ?? null,
      memberSince: user.createdAt.toISOString(),
      activeCount: listings.length,
      checklist,
      complete: shopChecklistComplete(checklist),
    },
    listings: listings.map(serializeListing),
  }
}

// The shop's trade line for the hero (e.g. "Fresh Produce · Kampala").
export function shopTradeLabel(profile: Pick<BusinessProfile, 'category'> | null): string | null {
  if (!profile?.category) return null
  return categoryLabel(profile.category)
}

// Type helper used by the API route's user select — keeps the public shop
// payload free of password hashes by construction.
export type ShopUserRow = Pick<User, 'id' | 'name' | 'phone' | 'country' | 'createdAt'> & {
  profile: BusinessProfile | null
}

export function countryNameOf(country: string): string {
  return countryDef(country).name
}
