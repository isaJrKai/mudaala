// Mudaala - client-side API types (mirror of server responses).

import type { ListingType, ListingStatus } from './constants'

// ---- Session token (Bearer channel) ----
// The preview can run inside a cross-origin iframe where browsers drop
// SameSite cookies. The session token ALSO lives in localStorage and is sent
// as Authorization: Bearer on every request, so sign-in survives anywhere.
const SESSION_TOKEN_KEY = 'mudaala_session_token'

export function storeSessionToken(token: string): void {
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token)
  } catch {
    // Private-mode storage failures fall back to the cookie channel.
  }
}

function getStoredSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY)
  } catch {
    return null
  }
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY)
  } catch {
    // ignore
  }
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  // FormData (photo uploads) must keep the browser-generated multipart
  // boundary - never stamp a JSON content-type over it.
  const isMultipart = typeof FormData !== 'undefined' && init?.body instanceof FormData
  if (!headers.has('Content-Type') && init?.body && !isMultipart) headers.set('Content-Type', 'application/json')
  const token = getStoredSessionToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(input, { ...init, headers })

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // Non-JSON response (proxy error, empty body) - treat as failure.
  }

  // Self-heal: a 401 from an authenticated endpoint means the stored token is
  // dead (server-side revoked/expired). Drop it so the UI shows signed-out
  // truthfully instead of sending a stale token forever. Login/register are
  // exempt - a 401 there is just "wrong password".
  if (res.status === 401 && !String(input).startsWith('/api/auth/login') && !String(input).startsWith('/api/auth/register')) {
    clearSessionToken()
  }

  if (!res.ok) {
    const shape = (body ?? {}) as ApiErrorShape
    const err = new Error(shape.error || `Request failed (${res.status})`) as Error & {
      status?: number
      fields?: Record<string, string>
    }
    err.status = res.status
    err.fields = shape.fields
    throw err
  }
  return body as T
}

export interface Listing {
  id: string
  userId: string
  type: ListingType
  title: string
  description: string
  category: string
  price: number | null
  compareAtPrice: number | null
  currency: string
  priceNegotiable: boolean
  unit: string | null
  quantity: number | null
  county: string
  country: string
  area: string | null
  contactPhone: string
  contactWhatsapp: string | null
  photos: string[]
  status: ListingStatus
  viewCount: number
  publishedAt: string
  refreshedAt: string
  expiresAt: string
}

export interface BusinessProfileT {
  id: string
  userId: string
  businessName: string
  photoUrl: string | null
  category: string | null
  description: string | null
  county: string | null
  area: string | null
  phone: string
  whatsapp: string | null
  hours: string | null
  verified: boolean
  /** Public identity code ("MD-4821") - assigned once, never changes. */
  shopCode: string | null
  /** Self-reported mobile-money merchant identity (pay sheet). */
  momoMerchantCode: string | null
  momoNetwork: string | null
  /** Shop spot, pre-rounded to ~100 m server-side. Null when not shared. */
  lat: number | null
  lng: number | null
}

interface ListingOwner {
  id: string
  name: string
  phone: string
  createdAt: string
  profile: BusinessProfileT | null
}

// Shop identity attached to search/browse results - who is selling this?
// profile.area/county let the browse feed disambiguate same-name shops;
// profile.lat/lng (blurred to ~100 m) power "Near me" distance chips.
export interface ListingShopOwner {
  id: string
  name: string
  profile: {
    businessName: string
    photoUrl: string | null
    area: string | null
    county: string | null
    lat: number | null
    lng: number | null
  } | null
}

export type ListingWithShop = Listing & { user: ListingShopOwner }

export interface ListingDetail extends Listing {
  user: ListingOwner
}

// The seller's shop display name: the named business profile wins, otherwise
// the account name. This is what buyers see on the listing.
export function shopName(owner: { name: string; profile: { businessName: string } | null }): string {
  return owner.profile?.businessName?.trim() || owner.name
}

export interface SavedSearchT {
  id: string
  name: string
  queryJson: string
  lastMatchCount: number
  lastCheckedAt: string
  createdAt: string
}

export interface NotificationT {
  id: string
  type: 'NEW_MATCH' | 'LISTING_EXPIRED' | 'LISTING_EXPIRING' | 'LISTING_HIDDEN'
  title: string
  body: string
  listingId: string | null
  read: boolean
  createdAt: string
}

export interface SessionUser {
  id: string
  name: string
  phone: string
  country: string
  createdAt: string
}

export interface ListingsPage {
  // Search/browse results carry the seller identity (shop name, photo, area)
  // so buyers can see WHO sells on every card.
  items: (Listing & { user?: ListingShopOwner })[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

// ---- Shop page (public catalogue) ----
export interface ShopChecklistT {
  photo: boolean
  description: boolean
  area: boolean
  hours: boolean
  whatsapp: boolean
}

interface ShopInfo {
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
  /** True only when the displayed phone IS the seller's login line. */
  phoneConfirmed: boolean
  /** Public identity code ("MD-4821") - stable for the life of the shop. */
  shopCode: string | null
  /** Self-reported merchant code + network for the pay sheet. Null when the
   *  shop takes mobile money on their personal number instead. */
  momoMerchantCode: string | null
  momoNetwork: string | null
  memberSince: string
  activeCount: number
  checklist: ShopChecklistT
  complete: boolean
}

export interface ShopPage {
  shop: ShopInfo
  listings: Listing[]
}

/** Result of punching a MD-XXXX code into /api/shops/lookup - card-slim on
 * purpose: no phone/contact details, the shop page has those after a tap. */
export interface ShopLookupResult {
  id: string
  name: string
  photoUrl: string | null
  area: string | null
  county: string | null
  country: string
  shopCode: string
}

export interface ShopLookupResponse {
  shop: ShopLookupResult
}

// ---- Home dashboard ----
export interface HomeData {
  user: { firstName: string }
  stats: {
    savedSearches: number
    activeListings: number
    newMatches: number
    lastUpdatedAt: string | null
  }
  savedSearches: { id: string; name: string; queryJson: string; lastMatchCount: number }[]
  staleListings: { id: string; title: string; refreshedAt: string; ageDays: number }[]
  staleCount: number
  location: {
    area: string | null
    county: string | null
    lat: number | null
    lng: number | null
    source: 'profile' | 'listing' | 'none'
  }
}

interface PriceTrendSeries {
  category: string
  categoryLabel: string
  unit: string
  currency: string
  points: { date: string; medianPrice: number; sampleSize: number }[]
}

export interface PriceMover {
  category: string
  categoryLabel: string
  unit: string
  currency: string
  firstMedian: number
  lastMedian: number
  pct: number
  sampleSize: number
  direction: 'up' | 'down'
}

export interface PriceTrendsData {
  series: PriceTrendSeries[]
  movers: PriceMover[]
  source: string
  minSample: number
}

interface ApiErrorShape {
  error: string
  fields?: Record<string, string>
}

// Typed fetch helpers - a failed request NEVER resolves as success.
export const apiGet = apiFetch
export function apiPost<T>(url: string, data?: unknown): Promise<T> {
  return apiFetch<T>(url, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) })
}

export function apiPatch<T>(url: string, data: unknown): Promise<T> {
  return apiFetch<T>(url, { method: 'PATCH', body: JSON.stringify(data) })
}

export function apiPut<T>(url: string, data: unknown): Promise<T> {
  return apiFetch<T>(url, { method: 'PUT', body: JSON.stringify(data) })
}

export function apiDelete<T>(url: string): Promise<T> {
  return apiFetch<T>(url, { method: 'DELETE' })
}
