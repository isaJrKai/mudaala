// Commerce OS — shared validation schemas (zod).
// Used by BOTH the API routes (integrity boundary) and the forms (usability).
// Never duplicate these rules elsewhere.

import { z } from 'zod'
import { CATEGORY_KEYS, LISTING_TYPES, UNIT_KEYS, COUNTIES, ALLOWED_STATUS_TRANSITIONS, type ListingStatus } from './constants'

// Kenyan phone numbers: 07XX/01XX, 7XX/1XX, 2547XX/2541XX, +2547XX...
// Normalized to +2547XXXXXXXX / +2541XXXXXXXX.
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, '')
  let local = ''
  if (/^\+254\d{9}$/.test(digits)) local = digits.slice(4)
  else if (/^254\d{9}$/.test(digits)) local = digits.slice(3)
  else if (/^0\d{9}$/.test(digits)) local = digits.slice(1)
  else if (/^[17]\d{8}$/.test(digits)) local = digits
  else return null
  if (!/^[17]\d{8}$/.test(local)) return null
  return `+254${local}`
}

export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .transform((v) => normalizePhone(v))
  .refine((v): v is string => v !== null, 'Enter a valid Kenyan phone number (e.g. 0712 345 678)')

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name is too long'),
  phone: phoneSchema,
  password: z.string().min(8, 'Password must be at least 8 characters').max(100, 'Password is too long'),
})

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Password is required'),
})

const priceSchema = z
  .number({ message: 'Price must be a number' })
  .min(0, 'Price cannot be negative')
  .max(100_000_000, 'Price is too large')
  .refine((v) => Number.isFinite(v) && Math.round(v * 100) === v * 100, 'Price can have at most 2 decimal places')

const quantitySchema = z
  .number({ message: 'Quantity must be a number' })
  .min(0.001, 'Quantity must be greater than zero')
  .max(10_000_000, 'Quantity is too large')

// Base object schema (no refinements) so .partial()/.omit() remain available.
const listingBaseSchema = z.object({
  type: z.enum(LISTING_TYPES, { message: 'Choose OFFER or REQUEST' }),
  title: z.string().trim().min(4, 'Title must be at least 4 characters').max(120, 'Title must be 120 characters or fewer'),
  description: z.string().trim().min(20, 'Describe what you offer or need (at least 20 characters)').max(2000, 'Description must be 2000 characters or fewer'),
  category: z.enum(CATEGORY_KEYS as [string, ...string[]], { message: 'Choose a category' }),
  price: priceSchema.nullable(),
  priceNegotiable: z.boolean().default(false),
  unit: z.enum(UNIT_KEYS as [string, ...string[]]).nullable(),
  quantity: quantitySchema.nullable(),
  county: z.enum(COUNTIES as unknown as [string, ...string[]], { message: 'Choose a county' }),
  area: z.string().trim().max(80, 'Area must be 80 characters or fewer').nullable(),
  contactPhone: phoneSchema,
  contactWhatsapp: phoneSchema.nullable(),
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
  category: z.enum(CATEGORY_KEYS as [string, ...string[]]).nullable(),
  description: z.string().trim().max(500, 'Description must be 500 characters or fewer').nullable(),
  county: z.enum(COUNTIES as unknown as [string, ...string[]]).nullable(),
  area: z.string().trim().max(80, 'Area must be 80 characters or fewer').nullable(),
  phone: phoneSchema,
  whatsapp: phoneSchema.nullable(),
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
