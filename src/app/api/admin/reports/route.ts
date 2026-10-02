import { NextRequest } from 'next/server'
import { route, jsonOk } from '@/lib/api'
import { requireAdmin } from '@/lib/admin'
import { listOpenReports } from '@/lib/reports'

// The moderation queue: every OPEN report with its target summary. Admin only
// (ADMIN_PHONES) — everyone else, signed in or not, gets 403.
export async function GET(_request: NextRequest) {
  return route(async () => {
    const admin = await requireAdmin('Admins only')
    const reports = await listOpenReports()
    return jsonOk({ reports, actorId: admin.id })
  })
}
