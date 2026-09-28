// Commerce OS — shared domain constants.
// Single source of truth for both server validation and UI rendering.

export const LISTING_TYPES = ['OFFER', 'REQUEST'] as const
export type ListingType = (typeof LISTING_TYPES)[number]

export const LISTING_STATUSES = ['ACTIVE', 'FULFILLED', 'EXPIRED', 'ARCHIVED'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

// Deliberate status transitions. Anything not listed here is forbidden —
// a fulfilled listing must never silently become active through an unrelated edit.
export const ALLOWED_STATUS_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  ACTIVE: ['FULFILLED', 'ARCHIVED'],
  FULFILLED: ['ACTIVE', 'ARCHIVED'],
  EXPIRED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ACTIVE'],
}

export interface CategoryDef {
  key: string
  label: string
  examples: string
}

// Categories reflect real local-commerce goods (scrap, produce, groceries...).
export const CATEGORIES: CategoryDef[] = [
  { key: 'scrap-recyclables', label: 'Scrap & Recyclables', examples: 'copper, brass, aluminium, plastics, cartons' },
  { key: 'food-groceries', label: 'Food & Groceries', examples: 'flour, cooking oil, sugar, rice' },
  { key: 'farm-produce', label: 'Farm Produce', examples: 'maize, beans, vegetables, eggs, milk' },
  { key: 'livestock-feed', label: 'Livestock & Feed', examples: 'goats, poultry, dairy meal, hay' },
  { key: 'hardware-building', label: 'Hardware & Building', examples: 'cement, steel, timber, roofing' },
  { key: 'textiles-clothing', label: 'Textiles & Clothing', examples: 'second-hand clothes, fabric, uniforms' },
  { key: 'electronics', label: 'Electronics', examples: 'phones, radios, solar panels, spare parts' },
  { key: 'transport-haulage', label: 'Transport & Haulage', examples: 'delivery runs, hire, loading' },
  { key: 'home-kitchen', label: 'Home & Kitchen', examples: 'cookware, furniture, gas cylinders' },
  { key: 'services', label: 'Services', examples: 'repair, welding, tailoring, grinding' },
  { key: 'other', label: 'Other', examples: 'anything else traded locally' },
]

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key)

export function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key
}

export interface UnitDef {
  key: string
  label: string
}

// Units for price ("per kg") and quantity ("500 kg available").
export const UNITS: UnitDef[] = [
  { key: 'kg', label: 'kg' },
  { key: 'tonne', label: 'tonne' },
  { key: 'bag', label: 'bag' },
  { key: 'sack', label: 'sack' },
  { key: 'crate', label: 'crate' },
  { key: 'bale', label: 'bale' },
  { key: 'litre', label: 'litre' },
  { key: 'piece', label: 'piece' },
  { key: 'dozen', label: 'dozen' },
  { key: 'roll', label: 'roll' },
  { key: 'bunch', label: 'bunch' },
  { key: 'trip', label: 'trip' },
]

export const UNIT_KEYS = UNITS.map((u) => u.key)

export function unitLabel(key: string): string {
  return UNITS.find((u) => u.key === key)?.label ?? key
}

// Kenyan counties — the platform's launch geography.
export const COUNTIES = [
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Uasin Gishu', 'Kiambu', 'Machakos',
  'Kajiado', 'Kakamega', 'Kisii', 'Meru', 'Nyeri', 'Bungoma', 'Kilifi',
  'Trans Nzoia', 'Nandi', 'Kericho', 'Kirinyaga', 'Muranga', 'Other',
] as const

export const CURRENCY = 'KSh'

// Time-dependent business rules (single source of truth).
export const LISTING_ACTIVE_DAYS = 30
export const REFRESH_COOLDOWN_HOURS = 24
export const EXPIRING_SOON_DAYS = 5

export const LISTING_TYPES_UI: Record<ListingType, { label: string; badge: string; dot: string }> = {
  OFFER: { label: 'OFFER', badge: 'bg-emerald-100 text-emerald-900 border-emerald-200', dot: 'bg-emerald-600' },
  REQUEST: { label: 'REQUEST', badge: 'bg-amber-100 text-amber-900 border-amber-200', dot: 'bg-amber-600' },
}

export const STATUS_UI: Record<ListingStatus, { label: string; badge: string }> = {
  ACTIVE: { label: 'Active', badge: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
  FULFILLED: { label: 'Fulfilled', badge: 'bg-stone-200 text-stone-700 border-stone-300' },
  EXPIRED: { label: 'Expired', badge: 'bg-red-50 text-red-800 border-red-200' },
  ARCHIVED: { label: 'Archived', badge: 'bg-stone-100 text-stone-600 border-stone-200' },
}
