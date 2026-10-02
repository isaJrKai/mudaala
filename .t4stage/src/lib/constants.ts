// Mudaala — shared domain constants.
// Single source of truth for both server validation and UI rendering.

export const LISTING_TYPES = ['OFFER', 'REQUEST'] as const
export type ListingType = (typeof LISTING_TYPES)[number]

const LISTING_STATUSES = ['ACTIVE', 'FULFILLED', 'EXPIRED', 'ARCHIVED', 'HIDDEN'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

// Deliberate status transitions. Anything not listed here is forbidden —
// a fulfilled listing must never silently become active through an unrelated edit.
// HIDDEN is the moderation takedown state: owners have NO self-service way out
// (the appeal path is the support email in the owner's notification); only the
// admin Restore action returns a hidden listing to ACTIVE, and it writes an
// AuditLog row when it does.
export const ALLOWED_STATUS_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  ACTIVE: ['FULFILLED', 'ARCHIVED'],
  FULFILLED: ['ACTIVE', 'ARCHIVED'],
  EXPIRED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ACTIVE'],
  HIDDEN: [],
}

interface CategoryDef {
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

interface UnitDef {
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

// Countries — Mudaala launches in Uganda and stays focused on it. The shape
// (array, not a single constant) is kept so new markets can be added later
// without touching call sites.
export interface CountryDef {
  key: 'UG'
  name: string
  dialCode: string
  currency: 'UGX'
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
]

export const COUNTRY_KEYS = COUNTRIES.map((c) => c.key)
export const DEFAULT_COUNTRY = 'UG'

export function countryDef(key: string): CountryDef {
  return COUNTRIES.find((c) => c.key === key) ?? COUNTRIES[0]
}

// Union of all locations — used for validating existing rows and saved searches.
export const COUNTIES = COUNTRIES.flatMap((c) => [...c.locations]) as unknown as readonly string[]

// Currencies — UGX is zero-decimal in everyday trade, so amounts are
// whole numbers.
interface CurrencyDef {
  key: 'UGX'
  symbol: string
  zeroDecimal: boolean
}

export const CURRENCIES: CurrencyDef[] = [
  { key: 'UGX', symbol: 'USh', zeroDecimal: true },
]

export function currencyDef(key: string): CurrencyDef {
  return CURRENCIES.find((c) => c.key === key) ?? CURRENCIES[0]
}

export const CURRENCY_KEYS = CURRENCIES.map((c) => c.key)

// Time-dependent business rules (single source of truth).
export const LISTING_ACTIVE_DAYS = 30
export const REFRESH_COOLDOWN_HOURS = 24
export const EXPIRING_SOON_DAYS = 5
// A listing not refreshed for this long triggers the Home "freshness tip".
export const STALE_LISTING_DAYS = 7

export const LISTING_TYPES_UI: Record<ListingType, { label: string; badge: string; dot: string }> = {
  OFFER: { label: 'OFFER', badge: 'bg-emerald-100 text-emerald-900 border-emerald-200', dot: 'bg-emerald-600' },
  REQUEST: { label: 'REQUEST', badge: 'bg-amber-100 text-amber-900 border-amber-200', dot: 'bg-amber-600' },
}

export const STATUS_UI: Record<ListingStatus, { label: string; badge: string }> = {
  ACTIVE: { label: 'Active', badge: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
  FULFILLED: { label: 'Fulfilled', badge: 'bg-stone-200 text-stone-700 border-stone-300' },
  EXPIRED: { label: 'Expired', badge: 'bg-red-50 text-red-800 border-red-200' },
  ARCHIVED: { label: 'Archived', badge: 'bg-stone-100 text-stone-600 border-stone-200' },
  HIDDEN: { label: 'Hidden', badge: 'bg-red-100 text-red-900 border-red-200' },
}

// ---------------------------------------------------------------------------
// Reports & moderation (Task 2)
// ---------------------------------------------------------------------------

// [SUPPORT EMAIL] — placeholder pending the real support address. Every
// owner-facing moderation notice points appeals here; replace the value once
// and every notice is correct.
export const SUPPORT_EMAIL = '[SUPPORT EMAIL]'

// A listing is auto-hidden at this many OPEN reports from DISTINCT reporters
// (a reporter is one account, or one guest IP).
export const AUTO_HIDE_REPORT_COUNT = 3

// Reports per calendar day (UTC) per reporter — one account OR one guest IP.
export const REPORT_DAILY_LIMIT = 10

export const REPORT_REASONS = ['SCAM', 'STOLEN_GOODS', 'PROHIBITED_ITEM', 'WRONG_INFO', 'OTHER'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

// Friendly words for the report dialog and the admin queue.
export const REPORT_REASONS_UI: Record<ReportReason, { label: string; hint: string }> = {
  SCAM: { label: 'Scam or fraud', hint: 'Fake goods, fake prices, asks for money in advance' },
  STOLEN_GOODS: { label: 'Stolen goods', hint: 'The item looks stolen or the story does not add up' },
  PROHIBITED_ITEM: { label: 'Not allowed on Mudaala', hint: 'Weapons, drugs, prohibited or counterfeit items' },
  WRONG_INFO: { label: 'Wrong information', hint: 'Wrong price, wrong place, or not what the photos show' },
  OTHER: { label: 'Something else', hint: 'Tell us what is wrong in your own words' },
}

export const REPORT_TARGET_TYPES = ['LISTING', 'SHOP'] as const
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number]

// ---------------------------------------------------------------------------
// Prohibited items — the publish-time filter.
// This list is MEANT to be edited: add a term (lowercase) and every new or
// edited listing containing it is rejected with the rule's friendly label.
// Terms match as whole words/phrases, so "gunia" (sacks) never trips "gun".
// ---------------------------------------------------------------------------
export interface ProhibitedRule {
  key: string
  // The friendly explanation shown to the seller — name what is not allowed
  // and why, never shame the person.
  label: string
  terms: string[]
}

export const PROHIBITED_ITEMS: ProhibitedRule[] = [
  {
    key: 'weapons',
    label: 'weapons or ammunition',
    terms: ['gun', 'guns', 'rifle', 'pistol', 'shotgun', 'revolver', 'ak47', 'ak-47', 'ammo', 'ammunition', 'bullet', 'bullets', 'cartridge'],
  },
  {
    key: 'drugs',
    label: 'drugs or narcotics',
    terms: ['cocaine', 'heroin', 'marijuana', 'opium', 'methamphetamine', 'mdma', 'ecstasy', 'khat', 'muguka'],
  },
  {
    key: 'stolen',
    label: 'stolen goods — every item on Mudaala must be yours to sell, with papers on request',
    terms: ['stolen', 'no papers', 'without papers', 'no receipt', 'without receipt', 'no origin', 'hot goods', 'quick sale no questions'],
  },
  {
    key: 'authority',
    label: 'government, police or military property',
    terms: ['police uniform', 'military uniform', 'army uniform', 'updf', 'police property', 'government property', 'state house', 'prison', 'number plate', 'number plates', 'road sign', 'street sign', 'court seal'],
  },
  {
    key: 'infrastructure',
    label: 'public infrastructure materials — electric cable, transformer parts, manhole covers and railway metal belong to the utility, and trading them puts everyone at risk',
    terms: ['electric cable', 'electrical cable', 'power cable', 'copper cable', 'electric wire', 'transformer', 'manhole', 'railway metal', 'railway line', 'rail metal', 'train track', 'umeme pole', 'utility pole'],
  },
  {
    key: 'counterfeit',
    label: 'counterfeit goods',
    terms: ['counterfeit', 'knockoff', 'knock-off', 'fake original', 'replica', 'first copy', 'fake iphone', 'fake samsung'],
  },
]

/** Find the first prohibited rule whose term appears in the text as a whole
 *  word or phrase. Case-insensitive; returns null for clean text. Client-safe
 *  (pure string work) so forms can pre-warn, but the API is the enforcer. */
export function findProhibitedItem(text: string): { rule: ProhibitedRule; term: string } | null {
  const haystack = text.toLowerCase()
  for (const rule of PROHIBITED_ITEMS) {
    for (const term of rule.terms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`(^|\\W)${escaped}($|\\W)`).test(haystack)) {
        return { rule, term }
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Legal (Task 4)
// ---------------------------------------------------------------------------

// Version stamp recorded on every account at the moment its owner accepts the
// Terms and Privacy Policy. Bump this value whenever the legal text changes
// meaningfully — users who accepted an older version can then be asked to
// re-confirm. Date-based so the version reads naturally in the database.
export const TERMS_VERSION = '2026-10-02'
