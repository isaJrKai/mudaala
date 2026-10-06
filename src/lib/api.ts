// Mudaala - API route helpers.
// Explicit error handling: expected failures return typed JSON errors,
// unexpected failures are logged with context and return a generic 500.
// Failed operations are NEVER converted into success responses.

import { NextResponse } from 'next/server'
import { ZodError, type ZodType } from 'zod'
import { fieldErrors } from './validation'
import { getSessionUser } from './auth'
import type { User } from '@/generated/prisma/client'

export class ApiError extends Error {
  status: number
  fields?: Record<string, string>
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

export function jsonError(status: number, message: string, fields?: Record<string, string>): NextResponse {
  return NextResponse.json({ error: message, ...(fields ? { fields } : {}) }, { status })
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

// Wrap a route handler so thrown ApiErrors become clean JSON responses.
export function route(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  return handler().catch((err: unknown) => {
    if (err instanceof ApiError) {
      return jsonError(err.status, err.message, err.fields)
    }
    if (err instanceof ZodError) {
      return jsonError(400, 'Invalid request', fieldErrors(err))
    }
    // Prisma connection/authentication failures are operational outages, not browser errors.
    // Return 503 so clients can distinguish a server/database outage from a bad request,
    // while keeping driver details and credentials out of the response.
    const errorName = err instanceof Error ? err.name : ''
    if (
      errorName === 'PrismaClientInitializationError' ||
      errorName === 'PrismaClientKnownRequestError' ||
      errorName === 'PrismaClientUnknownRequestError'
    ) {
      console.error('[api] database error:', err)
      return jsonError(503, 'The market database is temporarily unavailable. Please try again in a moment.')
    }
    // Unexpected: log context server-side, never expose internals to the client.
    console.error('[api] unexpected error:', err)
    return jsonError(500, 'Something went wrong. Please try again in a moment.')
  })
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON')
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new ApiError(400, 'Please fix the highlighted fields', fieldErrors(result.error))
  }
  return result.data
}

export async function requireUser(message = 'Sign in to continue'): Promise<User> {
  const user = await getSessionUser()
  if (!user) throw new ApiError(401, message)
  return user
}

// Parse comma/space separated ids or "all".
export function readIdList(raw: string | null): string[] | 'all' | null {
  if (raw === null) return null
  if (raw === 'all') return 'all'
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return ids.length > 0 ? ids : null
}
