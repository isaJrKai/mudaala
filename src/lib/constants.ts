// Mudaala - shared domain constants.
// Single source of truth for both server validation and UI rendering.

export const LISTING_TYPES = ['OFFER', 'REQUEST'] as const
export type ListingType = (typeof LISTING_TYPES)[number]

// HIDDEN is the moderation state: admins (or the auto-hide rule) park a
// listing here while reports are reviewed. Hidden ads vanish from browse,
// search, the sitemap and direct links - to everyone, including search
// engines - and only an admin RESTORE brings them back.
const LISTING_STATUSES = ['ACTIVE', 'FULFILLED', 'EXPIRED', 'ARCHIVED', 'HIDDEN'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

// Deliberate status transitions. Anything not listed here is forbidden -
// a fulfilled listing must never silently become active through an unrelated edit.
// HIDDEN has no owner transitions at all: only the admin API restores it,
// so moderation can never be undone from the seller dashboard.
export const ALLOWED_STATUS_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  ACTIVE: ['FULFILLED', 'ARCHIVED'],
  FULFILLED: ['ACTIVE', 'ARCHIVED'],
  EXPIRED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ACTIVE'],
  HIDDEN: [],
}

// Report reasons - the vocabulary buyers use at the market, mapped to what
// moderation needs. LABELS is the buyer-facing wording on the report form.
export const REPORT_REASONS = ['SCAM', 'STOLEN_GOODS', 'PROHIBITED_ITEM', 'WRONG_INFO', 'OTHER'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SCAM: 'Scam or fraud',
  STOLEN_GOODS: 'Stolen goods',
  PROHIBITED_ITEM: 'Not allowed on Mudaala',
  WRONG_INFO: 'Wrong information',
  OTHER: 'Something else',
}

// Where buyers and hidden sellers should write for appeals. Set a real
// inbox in the environment before launch - the placeholder below is NOT a
// deliverable address.
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? 'support@mudaala.app'

// ---- Prohibited items (publish-time filter) ----
//
// The list lives here and is meant to be edited: every rule is one small
// object with the words to watch for and the sentence a seller sees when a
// listing is rejected. Patterns run against the listing title + description,
// case-insensitively. Keep the messages friendly and specific - a seller
// whose ad was rejected should always learn WHY, and what not to do next.

interface ProhibitedRule {
  id: string
  label: string // short name for moderation surfaces
  patterns: RegExp[]
  message: string // shown to the seller on rejection
}

const PROHIBITED_ITEMS: ProhibitedRule[] = [
  {
    id: 'weapons',
    label: 'Weapons & ammunition',
    patterns: [
      /\b(gun|guns|firearm|firearms|rifle|pistol|shotgun|revolver)\b/i,
      /\bak-?47\b|\bak-?74\b/i,
      /\b(bullet|bullets|ammunition|ammo)\b/i,
      /\btshopu\b/i, // local slang for a gun
    ],
    message:
      'Weapons and ammunition cannot be sold on Mudaala. This includes guns, rifles and bullets, even as a joke or a collectible. Please remove them from your listing.',
  },
  {
    id: 'drugs',
    label: 'Drugs',
    patterns: [
      /\b(cocaine|heroin|cannabis|marijuana|bhang|opium|ecstasy|methamphetamine|crystal meth)\b/i,
      /\bweed\b/i,
      /\bshisha\b/i,
    ],
    message:
      'Drugs cannot be sold on Mudaala. This includes cannabis, shisha and other controlled substances. Please remove them from your listing.',
  },
  {
    id: 'stolen-goods',
    label: 'Stolen-goods wording',
    patterns: [
      /\bstolen\b/i,
      /\bno papers\b/i,
      /\bno receipt\b/i,
      /\bsnatched\b/i,
      /\bburgled\b/i,
    ],
    message:
      'Listings cannot suggest goods are stolen or untraceable ("no papers", "stolen" and similar wording). Mudaala only allows honestly owned goods. Please rewrite your listing.',
  },
  {
    id: 'government-property',
    label: 'Government / police / military property',
    patterns: [
      /\bupdf\b/i,
      /\bstate house\b/i,
      /\bgovernment (property|asset|vehicle)\b/i,
      /\b(police|military|army|prison) (uniform|uniforms|boots|helmet|jacket|vest|tent|kit|property|assets|goods|radio|baton|handcuffs?)\b/i,
    ],
    message:
      'Government, police and military property cannot be sold on Mudaala. If your listing only mentions these words by mistake (for example a location), please reword it.',
  },
  {
    id: 'public-infrastructure',
    label: 'Public infrastructure',
    patterns: [
      /\belectric(al)? cable\b/i,
      /\btransformer (parts?|oil|coil)/i,
      /\bmanhole\b/i,
      /\brailway (metal|scrap|slippers?|clips?)\b/i,
      /\brail (metal|scrap)\b/i,
    ],
    message:
      'Public infrastructure (electric cables, transformer parts, manhole covers, railway metal) cannot be sold on Mudaala. Removing and selling these is a crime that puts lives at risk.',
  },
  {
    id: 'counterfeit',
    label: 'Counterfeit goods',
    patterns: [
      /\bcounterfeit\b/i,
      /\b(fake|replica|clone)\b/i,
    ],
    message:
      'Counterfeit or replica goods cannot be sold on Mudaala. Only genuine items may be listed. Please remove brand fakes from your listing.',
  },
]

/** Returns the first rule whose patterns match any of the given texts, or
 *  null when the text is clean. Called at publish time on title and
 *  description. */
export function findProhibitedItem(...texts: string[]): ProhibitedRule | null {
  const haystack = texts.filter(Boolean).join('\n')
  if (!haystack) return null
  for (const rule of PROHIBITED_ITEMS) {
    if (rule.patterns.some((p) => p.test(haystack))) return rule
  }
  return null
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

// Countries - Mudaala launches in Uganda and stays focused on it. The shape
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

// Union of all locations - used for validating existing rows and saved searches.
export const COUNTIES = COUNTRIES.flatMap((c) => [...c.locations]) as unknown as readonly string[]

// Currencies - UGX is zero-decimal in everyday trade, so amounts are
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
  HIDDEN: { label: 'Hidden by review', badge: 'bg-orange-50 text-orange-800 border-orange-200' },
}

// ---------------------------------------------------------------------------
// Legal (Task 4)
// ---------------------------------------------------------------------------

// Version stamp recorded on every account at the moment its owner accepts the
// Terms and Privacy Policy. Bump this value whenever the legal text changes
// meaningfully - users who accepted an older version can then be asked to
// re-confirm. Date-based so the version reads naturally in the database.
export const TERMS_VERSION = '2026-10-02'
