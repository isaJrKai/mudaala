// Mudaala - shop domain service.
// The shop is the seller's own space: identity (name/photo/location/hours)
// plus their public catalogue (ACTIVE listings). Trust is earned honestly:
// we never claim platform vetting - the checklist reflects what the seller
// actually filled in, and the badge says exactly that.

import { db } from '@/lib/db'
import type { BusinessProfile, User } from '@prisma/client'
import { SHOP_OWNER_INCLUDE, serializeListing, expireOverdueListings } from '@/lib/listings'
import type { ListingWithShop } from '@/lib/listings'
import { countryDef, categoryLabel } from '@/lib/constants'
import { normalizeShopCode } from '@/lib/format'
import { phoneCandidates } from '@/lib/validation'

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

interface ShopPageData {
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
    // True only when the phone shown on the page IS the seller's registered
    // login line (no override, or the override resolves to the same line).
    // The "Phone confirmed" chip renders ONLY when this is true - a trust
    // badge that can be true by construction or not shown at all.
    phoneConfirmed: boolean
    // Public identity code ("MD-4821") - stable for the life of the shop.
    shopCode: string | null
    memberSince: string
    activeCount: number
    checklist: ShopChecklist
    complete: boolean
  }
  listings: ReturnType<typeof serializeListing<ListingWithShop>>[]
}

// A shop's public identity code: "MD-" + 4 digits, like a mobile-money till
// number. Assigned once (on profile creation or by the backfill script) and
// NEVER regenerated - the code is how buyers and printed QR posters find the
// exact shop even when two shops share a name.
export async function generateShopCode(): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = `MD-${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`
    const clash = await db.businessProfile.findUnique({
      where: { shopCode: candidate },
      select: { id: true },
    })
    if (!clash) return candidate
  }
  // 10,000 slots - statistically unreachable at any realistic shop count.
  throw new Error('Could not allocate a unique shop code')
}

// Buyers punch in a code like a mobile-money till number (normalizeShopCode
// in lib/format.ts canonicalizes the typed text) - the match against the
// stored code stays EXACT, so a mistyped number never lands on a stranger's
// shop.

export interface ShopLookupResult {
  id: string
  name: string
  photoUrl: string | null
  area: string | null
  county: string | null
  country: string
  shopCode: string
}

// Public code lookup: type a till number, get that shop. Returns only what a
// result card needs (no phone, no contact details) - the full page comes
// from /api/shops/[id] once the buyer taps through.
export async function lookupShopByCode(raw: string): Promise<ShopLookupResult | null> {
  const code = normalizeShopCode(raw)
  if (!code) return null
  const row = await db.businessProfile.findUnique({
    where: { shopCode: code },
    select: {
      businessName: true,
      photoUrl: true,
      area: true,
      county: true,
      shopCode: true,
      user: { select: { id: true, name: true, country: true } },
    },
  })
  if (!row) return null
  return {
    id: row.user.id,
    name: row.businessName?.trim() || row.user.name,
    photoUrl: row.photoUrl ?? null,
    area: row.area ?? null,
    county: row.county ?? null,
    country: row.user.country ?? 'UG',
    shopCode: row.shopCode as string,
  }
}

// Two raw numbers name the same phone line when their normalized candidate
// sets overlap - no format guessing (local 07…, dial-code 2567…, spaced).
function samePhoneLine(a: string, b: string): boolean {
  const aCandidates = phoneCandidates(a)
  return phoneCandidates(b).some((n) => aCandidates.includes(n))
}

// Load a shop page by the owner's user id. Public - buyers never sign in.
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
      // The shop name the seller chose - the account name is the fallback.
      name: profile?.businessName?.trim() || user.name,
      photoUrl: profile?.photoUrl ?? null,
      description: profile?.description ?? null,
      hours: profile?.hours ?? null,
      area: profile?.area ?? null,
      county: profile?.county ?? null,
      country,
      // The shop's contact numbers - the same ones buyers call from listings.
      phone: profile?.phone ?? user.phone,
      whatsapp: profile?.whatsapp ?? null,
      phoneConfirmed: !profile?.phone || samePhoneLine(profile.phone, user.phone),
      shopCode: profile?.shopCode ?? null,
      memberSince: user.createdAt.toISOString(),
      activeCount: listings.length,
      checklist,
      complete: shopChecklistComplete(checklist),
    },
    listings: listings.map(serializeListing),
  }
}

