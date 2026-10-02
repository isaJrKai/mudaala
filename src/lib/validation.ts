// Mudaala — shared validation schemas (zod).
// Used by BOTH the API routes (integrity boundary) and the forms (usability).
// Never duplicate these rules elsewhere.

import { z } from 'zod'
import { CATEGORY_KEYS, LISTING_TYPES, UNIT_KEYS, COUNTRY_KEYS, CURRENCY_KEYS, ALLOWED_STATUS_TRANSITIONS, REPORT_REASONS, type ListingStatus } from './constants'

// Uganda phone normalization. Accepted inputs: 07XX XXX XXX, 7XXXXXXXX,
// +2567XXXXXXXX, 2567XXXXXXXX...
// Normalized to E.164: +2567XXXXXXXX (mobiles 7XXXXXXXX, fixed 3XXXXXXXX).
export type CountryKey = 'UG'

const DIAL_CODES: Record<CountryKey, string> = { UG: '256' }
const LOCAL_PATTERNS: Record<CountryKey, RegExp> = {
  UG: /^[37]\d{8}$/,
}

function normalizeFor(raw: string, country: CountryKey): string | null {
  const digits = raw.replace(/[\s\-()]/g, '')
  const dial = DIAL_CODES[country]
  let local = ''
  if (digits.startsWith(`+${dial}`)) local = digits.slice(1 + dial.length)
  else if (digits.startsWith(dial)) local = digits.slice(dial.length)
  else if (digits.startsWith('0')) local = digits.slice(1)
  else if (/^\d{8,9}$/.test(digits)) local = digits
  else return null
  if (!LOCAL_PATTERNS[country].test(local)) return null
  return `+${dial}${local}`
}

/** Normalize a Ugandan phone number (register, listing contact fields). */
export function normalizePhone(raw: string, country: CountryKey = 'UG'): string | null {
  return normalizeFor(raw, country)
}

/** A raw number may arrive in any dial format — produce the normalized
 *  candidate(s). Kept plural on purpose: if another market is ever added,
 *  login should not need rewriting. */
export function phoneCandidates(raw: string): string[] {
  const out = new Set<string>()
  for (const c of ['UG'] as CountryKey[]) {
    const n = normalizeFor(raw, c)
    if (n) out.add(n)
  }
  return [...out]
}

export function countryPhoneMessage(country: CountryKey): string {
  return 'Enter a valid Ugandan phone number (e.g. 0772 345 678)'
}

// Shared untransformed phone string for schemas that carry an explicit country
// (register / listings) — the route normalizes after parsing so the error can
// name the right country.
const rawPhone = z.string().trim().min(1, 'Phone number is required').max(20, 'Phone number is too long')

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name is too long'),
  phone: rawPhone,
  country: z.enum(COUNTRY_KEYS as [string, ...string[]]).default('UG'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100, 'Password is too long'),
  // Task 4 — the 18+ / Terms / Privacy confirmation. Optional in the SCHEMA
  // (so the route can answer with one friendly message for both missing and
  // false), but REQUIRED by the route: registration is refused without it.
  acceptTerms: z.boolean().optional(),
})
export const loginSchema = z.object({
  phone: rawPhone,
  password: z.string().min(1, 'Password is required'),
})

// ---- The one password rulebook (register AND reset share it) ----
// Why a function and not schema refinements: the "not your phone number" rule
// needs the NORMALIZED phone, and normalization happens after the raw body is
// parsed. Both routes call passwordProblem() with the normalized phone.
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  '11111111',
  '00000000',
  'iloveyou',
  'letmein1',
  'admin1234',
])

/** Returns the friendly problem with the password, or null when it is fine. */
export function passwordProblem(password: string, phone?: string | null): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (password.length > 100) return 'Password is too long'
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'That password is too easy to guess — please choose a different one'
  }
  if (phone) {
    // Every everyday form of the number is off-limits: +2567…, 07… and the
    // bare local digits — people really do type their own number as a password.
    const local = phone.replace(/^\+\d{3}/, '')
    if (password === phone || password === `0${local}` || password === local) {
      return 'Your password cannot be your phone number'
    }
  }
  return null
}

// ---- Forgot / reset password ----

export const forgotPasswordSchema = z.object({
  phone: rawPhone,
})

export const resetPasswordSchema = z.object({
  phone: rawPhone,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from the SMS'),
  newPassword: z.string().min(1, 'Choose a new password'),
})

const priceSchema = z
  .number({ message: 'Price must be a number' })
  .min(0, 'Price cannot be negative')
  .max(100_000_000, 'Price is too large')
  .refine((v) => Number.isFinite(v) && Math.round(v * 100) === v * 100, 'Price can have at most 2 decimal places')

// Photo URLs — the upload API returns /uploads/<file>; external https URLs are
// allowed so sellers can paste a link instead of uploading. The API route
// sanitizes entries again (never trust the client array shape).
const photoUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(500, 'Photo link is too long')
  .refine((v) => v.startsWith('/uploads/') || /^https:\/\/\S+$/i.test(v) || /^http:\/\/\S+$/i.test(v), {
    message: 'Invalid photo link',
  })

const quantitySchema = z
  .number({ message: 'Quantity must be a number' })
  .min(0.001, 'Quantity must be greater than zero')
  .max(10_000_000, 'Quantity is too large')

// Base object schema (no refinements) so .partial()/.omit() remain available.
// NOTE: country/currency are deliberately OPTIONAL without defaults — in zod 4
// a .default() survives .partial() and would silently inject 'UG'/'UGX' into
// every PATCH. Servers derive the country from the user/listing instead.
const listingBaseSchema = z.object({
  type: z.enum(LISTING_TYPES, { message: 'Choose OFFER or REQUEST' }),
  title: z.string().trim().min(4, 'Title must be at least 4 characters').max(120, 'Title must be 120 characters or fewer'),
  description: z.string().trim().min(20, 'Describe what you offer or need (at least 20 characters)').max(2000, 'Description must be 2000 characters or fewer'),
  category: z.enum(CATEGORY_KEYS as [string, ...string[]], { message: 'Choose a category' }),
  price: priceSchema.nullable(),
  // Optional "was" price for discounts. Only meaningful alongside a current
  // price — the create schema and the PATCH handler enforce that pairing.
  compareAtPrice: priceSchema.nullable().optional(),
  currency: z.enum(CURRENCY_KEYS as [string, ...string[]]).optional(),
  priceNegotiable: z.boolean().default(false),
  unit: z.enum(UNIT_KEYS as [string, ...string[]]).nullable(),
  quantity: quantitySchema.nullable(),
  country: z.enum(COUNTRY_KEYS as [string, ...string[]]).optional(),
  county: z.string({ message: 'Choose your district or region' }).trim().min(1, 'Choose your district or region').max(30),
  area: z.string().trim().max(80, 'Area must be 80 characters or fewer').nullable(),
  contactPhone: rawPhone,
  contactWhatsapp: rawPhone.nullable(),
  photos: z.array(z.string().trim().max(500)).max(4).optional(),
})

export const listingCreateSchema = listingBaseSchema
  .refine((v) => v.price !== null || v.priceNegotiable || v.type === 'REQUEST', {
    message: 'Enter a price or mark it as negotiable',
    path: ['price'],
  })
  .refine((v) => v.price === null || v.unit !== null, {
    message: 'Choose the unit the price refers to',
    path: ['unit'],
  })
  .refine((v) => v.compareAtPrice == null || v.price !== null, {
    message: 'Add the current price first — the old price only shows as a discount next to it',
    path: ['compareAtPrice'],
  })
  .refine((v) => v.compareAtPrice == null || v.price == null || v.compareAtPrice > v.price, {
    message: 'The old price must be higher than the current price',
    path: ['compareAtPrice'],
  })

// Edits: same fields minus type (type is fixed at publish time).
// Cross-field price/unit rules are enforced by the PATCH handler against the
// merged record (partial payloads cannot be validated in isolation).
export const listingUpdateSchema = listingBaseSchema
  .omit({ type: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' })

export const listingStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'FULFILLED', 'ARCHIVED', 'EXPIRED'] as const),
})

export function isTransitionAllowed(from: string, to: string): boolean {
  const allowed = ALLOWED_STATUS_TRANSITIONS[from as ListingStatus]
  return Array.isArray(allowed) && allowed.includes(to as ListingStatus)
}

// Saved-search / browse filter query.
export const listingQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  type: z.enum(LISTING_TYPES).optional(),
  category: z.string().trim().max(40).optional(),
  county: z.string().trim().max(30).optional(),
  minPrice: z.number().min(0).max(100_000_000).optional(),
  maxPrice: z.number().min(0).max(100_000_000).optional(),
  unit: z.string().trim().max(20).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'nearest']).default('newest').optional(),
  // Buyer's position for sort=nearest ("Near me"). Never persisted — it only
  // shapes the ordering of one response.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  page: z.number().int().min(1).max(1000).default(1).optional(),
  pageSize: z.number().int().min(1).max(50).default(20).optional(),
})

// Seller sharing their shop's spot. Both keys travel together: two numbers to
// save, two nulls to remove. The API rounds to ~100 m before storing.
export const profileLocationSchema = z
  .object({
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
  })
  .refine((d) => (d.lat === null) === (d.lng === null), {
    message: 'Send both coordinates, or both null to remove',
    path: ['lat'],
  })

export type ListingQuery = z.infer<typeof listingQuerySchema>

export const savedSearchCreateSchema = z.object({
  name: z.string().trim().min(1, 'Give the search a name').max(60, 'Name must be 60 characters or fewer'),
  query: listingQuerySchema.omit({ page: true, pageSize: true, sort: true }),
})

export const businessProfileSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name must be at least 2 characters').max(80, 'Business name is too long'),
  photoUrl: photoUrlSchema.nullable(),
  category: z.enum(CATEGORY_KEYS as [string, ...string[]]).nullable(),
  description: z.string().trim().max(500, 'Description must be 500 characters or fewer').nullable(),
  county: z.string().trim().min(1, 'Choose your district or region').max(30).nullable(),
  area: z.string().trim().max(80, 'Area must be 80 characters or fewer').nullable(),
  phone: rawPhone,
  whatsapp: rawPhone.nullable(),
  hours: z.string().trim().max(120, 'Opening hours must be 120 characters or fewer').nullable(),
})

// PostgreSQL deployment connection (Settings → Advanced Settings).
export const postgresConfigSchema = z.object({
  connectionString: z.string().trim().max(500).optional().nullable(),
  host: z.string().trim().max(200).optional().nullable(),
  port: z.number().int().min(1).max(65535).optional().nullable(),
  database: z.string().trim().max(100).optional().nullable(),
  user: z.string().trim().max(100).optional().nullable(),
  password: z.string().max(200).optional().nullable(),
  sslMode: z.enum(['disable', 'prefer', 'require']).default('prefer'),
})

export type PostgresConfig = z.infer<typeof postgresConfigSchema>

// ---- Reports & moderation ----

export const reportCreateSchema = z.object({
  targetType: z.enum(['LISTING', 'SHOP'], { message: 'Choose what you are reporting' }),
  targetId: z.string().trim().min(1).max(64),
  reason: z.enum(REPORT_REASONS, { message: 'Choose a reason for the report' }),
  details: z
    .string()
    .trim()
    .max(500, 'Please keep the details under 500 characters')
    .optional()
    .nullable(),
})

export const reportActionSchema = z.object({
  action: z.enum(['HIDE', 'RESTORE', 'DISMISS'], { message: 'Choose an action' }),
})

export const adminReportsQuerySchema = z.object({
  status: z.enum(['OPEN', 'ACTIONED', 'DISMISSED', 'ALL']).default('OPEN'),
})

// Turn a ZodError into { field: message } for API error payloads.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_'
    if (!out[key]) out[key] = issue.message
  }
  return out
}
