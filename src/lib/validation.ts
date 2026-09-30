// Duuka — shared validation schemas (zod).
// Used by BOTH the API routes (integrity boundary) and the forms (usability).
// Never duplicate these rules elsewhere.

import { z } from 'zod'
import { CATEGORY_KEYS, LISTING_TYPES, UNIT_KEYS, COUNTRY_KEYS, CURRENCY_KEYS, ALLOWED_STATUS_TRANSITIONS, type ListingStatus } from './constants'

// Multi-country phone normalization (Uganda, Tanzania, Kenya).
// Accepted inputs: 07XX XXX XXX, 7XXXXXXXX, +2567XXXXXXXX, 2567XXXXXXXX...
// Normalized to E.164: +2567XXXXXXXX / +2557XXXXXXXX / +2547XXXXXXXX.
export type CountryKey = 'UG' | 'TZ' | 'KE'

const DIAL_CODES: Record<CountryKey, string> = { UG: '256', TZ: '255', KE: '254' }
// Local part (after the leading 0) per country:
//   UG: mobiles 7XXXXXXXX (MTN/Airtel), fixed 3XXXXXXXX
//   TZ: mobiles 6XXXXXXXX / 7XXXXXXXX
//   KE: mobiles 7XXXXXXXX / 1XXXXXXXX
const LOCAL_PATTERNS: Record<CountryKey, RegExp> = {
  UG: /^[37]\d{8}$/,
  TZ: /^[67]\d{8}$/,
  KE: /^[17]\d{8}$/,
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

/** Normalize with a known country (register, listing contact fields). */
export function normalizePhone(raw: string, country: CountryKey = 'UG'): string | null {
  return normalizeFor(raw, country)
}

/** A raw local number is ambiguous across UG/TZ/KE — produce every candidate.
 *  Used by login so a returning user never needs to pick their country again. */
export function phoneCandidates(raw: string): string[] {
  const out = new Set<string>()
  for (const c of ['UG', 'TZ', 'KE'] as CountryKey[]) {
    const n = normalizeFor(raw, c)
    if (n) out.add(n)
  }
  return [...out]
}

export function countryPhoneMessage(country: CountryKey): string {
  if (country === 'UG') return 'Enter a valid Ugandan phone number (e.g. 0772 345 678)'
  if (country === 'TZ') return 'Enter a valid Tanzanian phone number (e.g. 0712 345 678)'
  return 'Enter a valid Kenyan phone number (e.g. 0712 345 678)'
}

// Shared untransformed phone string for schemas that carry an explicit country
// (register / listings) — the route normalizes after parsing so the error can
// name the right country.
const rawPhone = z.string().trim().min(1, 'Phone number is required').max(20, 'Phone number is too long')

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name is too long'),
  phone: rawPhone,
  country: z.enum(['UG', 'TZ', 'KE']).default('UG'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100, 'Password is too long'),
})

export const loginSchema = z.object({
  phone: rawPhone,
  password: z.string().min(1, 'Password is required'),
})

const priceSchema = z
  .number({ message: 'Price must be a number' })
  .min(0, 'Price cannot be negative')
  .max(100_000_000, 'Price is too large')
  .refine((v) => Number.isFinite(v) && Math.round(v * 100) === v * 100, 'Price can have at most 2 decimal places')

// Photo URLs — the upload API returns /uploads/<file>; external https URLs are
// allowed so sellers can paste a link instead of uploading. The API route
// sanitizes entries again (never trust the client array shape).
export const photoUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(500, 'Photo link is too long')
  .refine((v) => v.startsWith('/uploads/') || /^https:\/\/\S+$/i.test(v) || /^http:\/\/\S+$/i.test(v), {
    message: 'Invalid photo link',
  })
export const listingPhotosSchema = z.array(photoUrlSchema).max(4, 'Up to 4 photos per listing')

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
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest').optional(),
  page: z.number().int().min(1).max(1000).default(1).optional(),
  pageSize: z.number().int().min(1).max(50).default(20).optional(),
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

// Turn a ZodError into { field: message } for API error payloads.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_'
    if (!out[key]) out[key] = issue.message
  }
  return out
}
