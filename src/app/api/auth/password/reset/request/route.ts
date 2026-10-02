// Mudaala — step 1 of password reset: ask for a code by SMS.
//
// NO ACCOUNT ENUMERATION, enforced three ways:
//  1. The success response is one fixed message for every valid request,
//     whether or not the phone has an account.
//  2. The phone rate budget is consumed for every valid-format phone — an
//     account-less phone hits the same 429 wall as a real one.
//  3. The per-IP budget bounds probing many numbers from one machine.
//
// Limits: 3 codes per phone per hour, 10 per IP per hour.

import { NextResponse } from 'next/server'
import { route, jsonOk, jsonError, parseBody } from '@/lib/api'
import { passwordResetRequestSchema, phoneCandidates } from '@/lib/validation'
import { hit, RESET_PHONE_MAX, RESET_IP_MAX, RESET_WINDOW_MS } from '@/lib/rate-limit'
import { createPasswordReset } from '@/lib/password-reset'

const OK_MESSAGE =
  'If that number has an account, a 6-digit reset code is on its way by SMS. It expires in 10 minutes.'

function tooMany(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many reset codes requested. Please wait a while, then try again.' },
    { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
  )
}

export async function POST(request: Request) {
  return route(async () => {
    // First hop of x-forwarded-for, or "local" on direct dev access — same
    // convention as login/register.
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'

    // Per-IP flood barrier before anything else: one machine requesting codes
    // for many numbers is the expensive thing to stop early.
    const ipVerdict = hit(`reset:req:ip:${ip}`, RESET_IP_MAX, RESET_WINDOW_MS)
    if (!ipVerdict.ok) return tooMany(ipVerdict.retryAfterSeconds)

    const data = await parseBody(request, passwordResetRequestSchema)
    const candidates = phoneCandidates(data.phone)
    if (candidates.length === 0) {
      return jsonError(400, 'Enter a valid Ugandan phone number (e.g. 0772 345 678)', {
        phone: 'Enter a valid Ugandan phone number (e.g. 0772 345 678)',
      })
    }

    // Consume the phone budget BEFORE the account lookup so the 429 behaviour
    // is identical for numbers with and without accounts. Every dial format
    // of the same number shares one budget.
    for (const phone of candidates) {
      const verdict = hit(`reset:req:phone:${phone}`, RESET_PHONE_MAX, RESET_WINDOW_MS)
      if (!verdict.ok) return tooMany(verdict.retryAfterSeconds)
    }

    // Does the real work only when an account exists; never throws for a
    // missing account, and SMS failures are logged (without PII) upstream.
    await createPasswordReset(data.phone)

    return jsonOk({ ok: true, message: OK_MESSAGE })
  })
}
