// Commerce OS — client-side API types (mirror of server responses).

import type { ListingType, ListingStatus } from './constants'

export interface Listing {
  id: string
  userId: string
  type: ListingType
  title: string
  description: string
  category: string
  price: number | null
  priceNegotiable: boolean
  unit: string | null
  quantity: number | null
  county: string
  area: string | null
  contactPhone: string
  contactWhatsapp: string | null
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
  category: string | null
  description: string | null
  county: string | null
  area: string | null
  phone: string
  whatsapp: string | null
  hours: string | null
  verified: boolean
}

export interface ListingOwner {
  id: string
  name: string
  phone: string
  createdAt: string
  profile: BusinessProfileT | null
}

export interface ListingDetail extends Listing {
  user: ListingOwner
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
  type: 'NEW_MATCH' | 'LISTING_EXPIRED' | 'LISTING_EXPIRING'
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
  createdAt: string
}

export interface ListingsPage {
  items: Listing[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface ApiErrorShape {
  error: string
  fields?: Record<string, string>
}

// Typed fetch helpers — a failed request NEVER resolves as success.
export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // Non-JSON response (proxy error, empty body) — treat as failure.
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

export function apiGet<T>(url: string): Promise<T> {
  return apiFetch<T>(url)
}

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
