// POST /api/admin/reports/[id]/action — act on a report: HIDE the listing,
// RESTORE it, or DISMISS the report. Admin-only; every action lands in the
// AuditLog with the acting admin's id. SHOP reports only accept DISMISS —
// shops have no hidden state, so "hide" has nothing honest to mean there.

import { route, jsonOk, parseBody, ApiError } from '@/lib/api'
import { requireAdmin } from '@/lib/admin'
import { reportActionSchema } from '@/lib/validation'
import { db } from '@/lib/db'
import { hideListingByAdmin, restoreListingByAdmin, dismissReportByAdmin, TargetNotFoundError } from '@/lib/reports'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireAdmin('Only the Mudaala admin can act on reports')
    const { id } = await params
    const { action } = await parseBody(request, reportActionSchema)

    const report = await db.report.findUnique({ where: { id }, select: { id: true, targetType: true, targetId: true } })
    if (!report) throw new ApiError(404, 'This report no longer exists')

    try {
      if (action === 'DISMISS') {
        await dismissReportByAdmin(report.id, admin.id)
      } else if (report.targetType !== 'LISTING') {
        throw new ApiError(409, 'Only ads can be hidden or restored — shops can only be dismissed')
      } else if (action === 'HIDE') {
        await hideListingByAdmin(report.targetId, admin.id)
        await db.report.update({ where: { id: report.id }, data: { status: 'ACTIONED' } })
      } else {
        await restoreListingByAdmin(report.targetId, admin.id)
        await db.report.update({ where: { id: report.id }, data: { status: 'ACTIONED' } })
      }
    } catch (err) {
      if (err instanceof TargetNotFoundError) throw new ApiError(404, err.message)
      throw err
    }

    return jsonOk({ ok: true, action })
  })
}
