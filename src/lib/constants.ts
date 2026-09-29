// Duuka — shared domain constants.
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

// Countries — Uganda is the launch market, Tanzania and Kenya supported too.
export interface CountryDef {
  key: 'UG' | 'TZ' | 'KE'
  name: string
  dialCode: string
  currency: 'UGX' | 'TZS' | 'KES'
  locations: readonly string[]
}

export const COUNTRIES: CountryDef[] = [
  {
    key: 'UG',
    name: 'Uganda',
    dialCode: '256',
    currency: 'UGX',
    locations: [
      'Kampala', 'Wakiso', 'Entebbe', 'Mukono', 'Jinja', 'Iganga', 'Mbale',
      'Tororo', 'Soroti', 'Lira', 'Gulu', 'Arua', 'Masindi', 'Hoima',
      'Fort Portal', 'Kasese', 'Mbarara', 'Masaka', 'Kabale', 'Other',
    ],
  },
  {
    key: 'TZ',
    name: 'Tanzania',
    dialCode: '255',
    currency: 'TZS',
    locations: [
      'Dar es Salaam', 'Mwanza', 'Arusha', 'Dodoma', 'Mbeya', 'Tanga',
      'Morogoro', 'Kilimanjaro', 'Zanzibar', 'Tabora', 'Iringa', 'Kigoma',
      'Mtwara', 'Lindi', 'Ruvuma', 'Other',
    ],
  },
  {
    key: 'KE',
    name: 'Kenya',
    dialCode: '254',
    currency: 'KES',
    locations: [
      'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Uasin Gishu', 'Kiambu', 'Machakos',
      'Kajiado', 'Kakamega', 'Kisii', 'Meru', 'Nyeri', 'Bungoma', 'Kilifi',
      'Trans Nzoia', 'Nandi', 'Kericho', 'Kirinyaga', 'Muranga', 'Other',
    ],
  },
]

export const COUNTRY_KEYS = COUNTRIES.map((c) => c.key)
export const DEFAULT_COUNTRY = 'UG'

export function countryDef(key: string): CountryDef {
  return COUNTRIES.find((c) => c.key === key) ?? COUNTRIES[0]
}

// Union of all locations — used for validating existing rows and saved searches.
export const COUNTIES = COUNTRIES.flatMap((c) => [...c.locations]) as unknown as readonly string[]

// Currencies — UGX and TZS are zero-decimal in everyday trade, so amounts are
// whole numbers. KES allows minor decimals.
export interface CurrencyDef {
  key: 'UGX' | 'TZS' | 'KES'
  symbol: string
  zeroDecimal: boolean
}

export const CURRENCIES: CurrencyDef[] = [
  { key: 'UGX', symbol: 'USh', zeroDecimal: true },
  { key: 'TZS', symbol: 'TSh', zeroDecimal: true },
  { key: 'KES', symbol: 'KSh', zeroDecimal: false },
]

export function currencyDef(key: string): CurrencyDef {
  return CURRENCIES.find((c) => c.key === key) ?? CURRENCIES[0]
}

export const CURRENCY_KEYS = CURRENCIES.map((c) => c.key)
export const DEFAULT_CURRENCY = 'UGX'

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
