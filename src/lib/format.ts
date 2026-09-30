// Duuka — display formatting helpers (client-safe).

import { currencyDef, LISTING_ACTIVE_DAYS } from './constants'

// Price in the listing's own currency. UGX and TZS are zero-decimal in
// everyday trade — never render "USh 1,500.00"; KES may carry decimals.
export function formatPrice(
  price: number | null | undefined,
  unit?: string | null,
  currency: string = 'UGX',
): string {
  if (price === null || price === undefined) return 'Ask seller'
  const def = currencyDef(currency)
  const amount = new Intl.NumberFormat('en', {
    maximumFractionDigits: def.zeroDecimal ? 0 : 2,
  }).format(price)
  return unit ? `${def.symbol} ${amount} / ${unit}` : `${def.symbol} ${amount}`
}

export function formatQuantity(quantity: number | null | undefined, unit?: string | null): string | null {
  if (quantity === null || quantity === undefined || !unit) return null
  const amount = new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(quantity)
  // "kg" is already mass-plural. Words ending in s/x/z/ch/sh take "es"
  // ("3 bunches"), everything else takes "s" ("300 crates").
  const displayUnit = quantity === 1 || unit === 'kg' ? unit : /(s|x|z|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`
  return `${amount} ${displayUnit}`
}

export function formatPhonePretty(phone: string): string {
  // +256 772 345 678 / +255 712 345 678 / +254 712 345 678
  const match = /^\+(\d{3})(\d{3})(\d{3})(\d{3})$/.exec(phone)
  if (match) return `+${match[1]} ${match[2]} ${match[3]} ${match[4]}`
  return phone
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function timeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  const months = Math.floor(days / 30)
  return `${months} ${months === 1 ? 'month' : 'months'} ago`
}

export function daysLeft(expiresAt: string | Date): number {
  const d = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
}

export function expiryLabel(expiresAt: string | Date): string {
  const left = daysLeft(expiresAt)
  if (left <= 0) return 'Expired'
  if (left === 1) return 'Expires tomorrow'
  return `${left} days left`
}

export { LISTING_ACTIVE_DAYS }

// WhatsApp deep link — digits only, international format, no "+".
export function whatsappLink(phone: string, listingTitle: string, listingType: 'OFFER' | 'REQUEST'): string {
  const digits = phone.replace(/\D/g, '')
  const intro = listingType === 'OFFER'
    ? `Hi, I saw your listing "${listingTitle}" on Duuka. Is it still available?`
    : `Hi, about your request "${listingTitle}" on Duuka — can we talk?`
  return `https://wa.me/${digits}?text=${encodeURIComponent(intro)}`
}

export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

// Google Maps search for the listing's area — lets a buyer decide "can I pick
// this up myself?" No API key, no fabricated coordinates: we search by place
// name (area → district → country), which is exactly what the seller typed.
export function mapsSearchUrl(parts: { area?: string | null; county: string; country?: string | null }): string {
  const query = [parts.area, parts.county, parts.country].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

// Shop-name comparison key shared by the server (check-name API) and the
// client (collision suffix on browse cards). Two names "match" when they are
// the same after case-folding and whitespace collapse — that is the pair a
// buyer could confuse.
export function normalizeShopName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

// Shop-code canonicalizer, shared by the server (lookup API) and the client
// (browse search detection). Buyers punch in a code like a mobile-money till
// number — forgiving about case, spaces and dashes ("dk 2623", "DK-2623",
// "dk2623" all work), but the match against the stored code stays EXACT, so
// a mistyped number never lands on a stranger's shop. Lives in format.ts
// because the client imports it and format.ts must stay server-free.
export function normalizeShopCode(raw: string): string | null {
  const compact = raw.replace(/[\s-]+/g, '').toUpperCase()
  const match = /^DK(\d{4})$/.exec(compact)
  return match ? `DK-${match[1]}` : null
}
