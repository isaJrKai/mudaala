// GET /api/admin/reports — the moderation queue. Admin-only (ADMIN_PHONES,
// fail closed). Each row carries what an admin needs to judge it: the
// target ad or shop, the reason in plain words, the reporter's optional
// note and when it came in. Defaults to the OPEN queue; pass ?status=…
// for reviewed history.

import { route, jsonOk, parseBody, ApiError } from '@/lib/api'
import { requireAdmin } from '@/lib/admin'
import { adminReportsQuerySchema } from '@/lib/validation'
import { db } from '@/lib/db'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  return route(async () => {
    await requireAdmin('Only the Mudaala admin can review reports')

    const raw = Object.fromEntries(request.nextUrl.searchParams.entries())
    const query = adminReportsQuerySchema.safeParse(raw)
    if (!query.success) throw new ApiError(400, 'Invalid report status filter')
    const status = query.data.status

    const reports = await db.report.findMany({
      where: status === 'ALL' ? {} : { status },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    // Reporter display names for signed-in reporters — admins may need to
    // follow up. Guests stay anonymous ("a guest") — IPs never reach the UI.
    const reporterIds = [...new Set(reports.map((r) => r.reporterId).filter(Boolean))] as string[]
    const reporters = await db.user.findMany({
      where: { id: { in: reporterIds } },
      select: { id: true, name: true },
    })
    const nameById = new Map(reporters.map((u) => [u.id, u.name]))

    // Attach the target's current face: listing title/owner or shop name.
    const listingIds = reports.filter((r) => r.targetType === 'LISTING').map((r) => r.targetId)
    const shopIds = reports.filter((r) => r.targetType === 'SHOP').map((r) => r.targetId)
    const [listings, shops] = await Promise.all([
      db.listing.findMany({
        where: { id: { in: listingIds } },
        select: { id: true, title: true, status: true, type: true, price: true, userId: true, user: { select: { name: true } } },
      }),
      db.businessProfile.findMany({
        where: { id: { in: shopIds } },
        select: { id: true, businessName: true, shopCode: true, county: true },
      }),
    ])
    const listingById = new Map(listings.map((l) => [l.id, l]))
    const shopById = new Map(shops.map((s) => [s.id, s]))

    return jsonOk({
      reports: reports.map((r) => {
        const listing = r.targetType === 'LISTING' ? listingById.get(r.targetId) : undefined
        const shop = r.targetType === 'SHOP' ? shopById.get(r.targetId) : undefined
        return {
          id: r.id,
          targetType: r.targetType,
          targetId: r.targetId,
          reason: r.reason,
          details: r.details,
          status: r.status,
          createdAt: r.createdAt,
          reporter: r.reporterId ? (nameById.get(r.reporterId) ?? 'a signed-in seller') : 'a guest',
          listing: listing
            ? { id: listing.id, title: listing.title, status: listing.status, type: listing.type, price: listing.price, ownerName: listing.user.name }
            : null, // target may have been deleted since the report
          shop: shop
            ? { id: shop.id, businessName: shop.businessName, shopCode: shop.shopCode, county: shop.county }
            : null,
        }
      }),
    })
  })
}
