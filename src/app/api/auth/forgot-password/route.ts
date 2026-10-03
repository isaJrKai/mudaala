// Mudaala - step 1 of password reset: "I forgot my password, send me a code."
//
// ANTI-ENUMERATION IS THE CONTRACT HERE: the response is byte-identical
// whether or not the phone has an account. An attacker learns nothing except
// "your request looks fine". Everything that could differ (code creation, SMS
// delivery) happens or fails silently on the server side.
//
// Rate limits run BEFORE the account lookup: 3 requests per phone per hour
// and 10 per IP per hour, for EVERY number - existing or not. Otherwise the
// endpoint doubles as an SMS pump paid for by someone else.

import { db } from '@/lib/db'
import { route, jsonOk, jsonError, parseBody } from '@/lib/api'
import { forgotPasswordSchema, phoneCandidates } from '@/lib/validation'
import { hit, RESET_PHONE_MAX, RESET_IP_MAX, RESET_WINDOW_MS } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/client-ip'
import { chooseSmsProvider, generateResetCode, hashResetCode } from '@/lib/sms'
import { NextResponse } from 'next/server'

const RESET_CODE_TTL_MS = 10 * 60 * 1000

const OK_BODY = {
  ok: true,
  message: 'If that phone number has an account, a reset code is on its way. It expires in 10 minutes.',
} as const

export async function POST(request: Request) {
  return route(async () => {
    const data = await parseBody(request, forgotPasswordSchema)
    const ip = getClientIp(request)

    const candidates = phoneCandidates(data.phone)
    const phone = candidates[0]
    if (!phone) {
      // Invalid format - the same answer login gives, before anything else.
      return jsonError(400, 'Enter a valid Ugandan phone number (e.g. 0772 345 678)', {
        phone: 'Enter a valid Ugandan phone number (e.g. 0772 345 678)',
      })
    }

    // Caps for every number, real or not.
    const phoneVerdict = hit(`reset:phone:${phone}`, RESET_PHONE_MAX, RESET_WINDOW_MS)
    if (!phoneVerdict.ok) {
      return NextResponse.json(
        { error: 'Too many code requests for this number. Please wait an hour and try again.' },
        { status: 429, headers: { 'retry-after': String(phoneVerdict.retryAfterSeconds) } },
      )
    }
    const ipVerdict = hit(`reset:ip:${ip}`, RESET_IP_MAX, RESET_WINDOW_MS)
    if (!ipVerdict.ok) {
      return NextResponse.json(
        { error: 'Too many code requests from this device. Please wait an hour and try again.' },
        { status: 429, headers: { 'retry-after': String(ipVerdict.retryAfterSeconds) } },
      )
    }

    const user = await db.user.findFirst({ where: { phone: { in: candidates } } })

    if (user) {
      // One live code per user: a fresh request retires any older one, so a
      // flooded inbox can never hold two valid doors.
      await db.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } })

      const code = generateResetCode()
      await db.passwordReset.create({
        data: {
          userId: user.id,
          codeHash: hashResetCode(code),
          expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
        },
      })

      const message = `Your Mudaala password reset code is ${code}. It expires in 10 minutes. If you did not ask for this, ignore this message.`
      try {
        await chooseSmsProvider().send(user.phone, message)
      } catch (err) {
        // Never silent, never detailed: the operator must see that delivery is
        // broken, but the log must NOT carry the phone number or the code.
        console.error(
          `[sms] reset code delivery failed via ${chooseSmsProvider().name} (${
            err instanceof Error ? err.message : 'unknown error'
          }); the requester can ask for another code.`,
        )
      }
    }

    // Identical body either way - this is the anti-enumeration guarantee.
    return jsonOk(OK_BODY)
  })
}
