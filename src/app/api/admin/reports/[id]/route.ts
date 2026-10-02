import { NextRequest } from 'next/server'
import { route, jsonOk, parseBody, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'
import { reportActionSchema } from '@/lib/validation'
import { adminHideListing, adminRestoreListing, adminDismissReport } from '@/lib/reports'

type Params = { params: Promise<{ id: string }> }

// Act on a report: HIDE (take the listing down), RESTORE (bring it back),
// DISMISS (no action needed). Every action writes an AuditLog row and every
// route here is admin-gated (ADMIN_PHONES).
export async function PATCH(request: NextRequest, { params }: Params) {
  return route(async () => {
    const admin = await requireAdmin('Admins only')
    const { id } = await params
    const { action } = await parseBody(request, reportActionSchema)

    if (action === 'DISMISS') {
      await adminDismissReport(admin.id, id)
      return jsonOk({ ok: true })
    }

    // HIDE/RESTORE operate on the report's listing target; resolve it here so
    // the service functions keep single-target signatures.
    const report = await db.report.findUnique({ where: { id } })
    if (!report) throw new ApiError(404, 'This report does not exist')
    if (report.targetType !== 'LISTING') {
      throw new ApiError(409, 'This report is about a shop, not a listing — only Dismiss applies.')
    }
    if (action === 'HIDE') await adminHideListing(admin.id, report.targetId)
    if (action === 'RESTORE') await adminRestoreListing(admin.id, report.targetId)
    return jsonOk({ ok: true })
  })
}
