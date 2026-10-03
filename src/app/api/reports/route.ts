// POST /api/reports - flag an ad or a shop. Guests can report; signed-in
// reporters get their own daily bucket. One OPEN report per reporter per
// target, ten accepted reports per reporter per day, and three distinct
// reporters on one listing auto-hide it (lib/reports.ts).

import { route, jsonOk, parseBody, ApiError } from '@/lib/api'
import { reportCreateSchema } from '@/lib/validation'
import { getSessionUser } from '@/lib/auth'
import { hit, REPORT_DAY_MAX, REPORT_IP_DAY_MAX, REPORT_WINDOW_MS } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/client-ip'
import { createReport, DuplicateReportError, TargetNotFoundError } from '@/lib/reports'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  return route(async () => {
    const data = await parseBody(request, reportCreateSchema)
    // The edge-stamped address: bucketing AND guest dedupe both key on it,
    // so a forged x-forwarded-for can neither buy budget nor dodge dedupe.
    const ip = getClientIp(request)
    const user = await getSessionUser()

    // Volume cap: per user when signed in, per IP for guests. The response
    // says when to come back - never just "no".
    const verdict = user
      ? hit(`report:user:${user.id}`, REPORT_DAY_MAX, REPORT_WINDOW_MS)
      : hit(`report:ip:${ip}`, REPORT_IP_DAY_MAX, REPORT_WINDOW_MS)
    if (!verdict.ok) {
      return NextResponse.json(
        { error: 'You have sent a lot of reports today. Please continue tomorrow. Thank you for helping keep Mudaala safe.' },
        { status: 429, headers: { 'retry-after': String(verdict.retryAfterSeconds) } },
      )
    }

    try {
      const report = await createReport({
        reporterId: user?.id ?? null,
        reporterIp: ip,
        targetType: data.targetType,
        targetId: data.targetId,
        reason: data.reason,
        details: data.details ?? null,
      })
      return jsonOk({ report: { id: report.id, status: report.status } }, 201)
    } catch (err) {
      if (err instanceof DuplicateReportError) throw new ApiError(409, err.message)
      if (err instanceof TargetNotFoundError) throw new ApiError(404, err.message)
      throw err
    }
  })
}
