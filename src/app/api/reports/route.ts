import { NextRequest } from 'next/server'
import { route, jsonOk, parseBody } from '@/lib/api'
import { reportCreateSchema } from '@/lib/validation'
import { createReport } from '@/lib/reports'

// Create a report. Guests may report — the reporter identity (account id or
// coarse IP) is attached server-side and never echoed back. Dedupe, the
// daily ceiling and the auto-hide tripwire live in the report service.
export async function POST(request: NextRequest) {
  return route(async () => {
    const data = await parseBody(request, reportCreateSchema)
    const report = await createReport(request, {
      targetType: data.targetType,
      targetId: data.targetId,
      reason: data.reason,
      details: data.details ?? null,
    })
    // The row itself carries the reporter's IP for guests — serialize the
    // safe fields only.
    return jsonOk({ report: { id: report.id, status: report.status, createdAt: report.createdAt.toISOString() } }, 201)
  })
}
