// Mudaala — reports & moderation service (Task 2).
//
// One flag per person per target, guests included; a daily ceiling per
// reporter; and an auto-hide tripwire at three distinct reporters. The
// reporter identity is deliberately minimal (account id, else coarse client
// IP) and is NEVER rendered, never logged, and never echoed back to any
// client — including admins.
//
// The daily limit counts persisted Report rows (UTC calendar day), not
// in-memory buckets: it stays truthful across restarts and deployments.

import { db } from '@/lib/db'
import { ApiError } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { AUTO_HIDE_REPORT_COUNT, REPORT_DAILY_LIMIT, SUPPORT_EMAIL } from '@/lib/constants'
import type { Report } from '@prisma/client'

/** Coarse client IP: first hop of x-forwarded-for, then x-real-ip, else
 *  "unknown" (local dev). Only ever stored on the report row for dedupe and
 *  rate limiting — the string is never logged anywhere. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first.slice(0, 60)
  }
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim().slice(0, 60)
  return 'unknown'
}

/** One person = one key: the account id when signed in, else the guest IP. */
function reporterKeyOf(reporterId: string | null, reporterIp: string): string {
  return reporterId ? `u:${reporterId}` : `ip:${reporterIp}`
}

// The daily ceiling: every report created today by this person counts, no
// matter which target it touched. Signed-in reporters are keyed by account;
// guests by IP. The identity match is built conditionally — an `OR` with a
// null reporterId would match EVERY guest report (null equals null in SQL),
// pooling all guests into one imaginary reporter.
function identityOf(reporterId: string | null, reporterIp: string): { reporterId: string } | { reporterIp: string } {
  return reporterId ? { reporterId } : { reporterIp }
}

async function assertDailyLimit(reporterId: string | null, reporterIp: string): Promise<void> {
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const used = await db.report.count({
    where: {
      createdAt: { gte: dayStart },
      ...identityOf(reporterId, reporterIp),
    },
  })
  if (used >= REPORT_DAILY_LIMIT) {
    throw new ApiError(
      429,
      `You have reached today's limit of ${REPORT_DAILY_LIMIT} reports. Please try again tomorrow.`,
    )
  }
}

// One OPEN report per reporter per target. A closed report (actioned or
// dismissed) does not block a fresh flag — a new violation is a new report.
async function assertNoOpenDuplicate(
  reporterId: string | null,
  reporterIp: string,
  targetType: string,
  targetId: string,
): Promise<void> {
  const existing = await db.report.findFirst({
    where: {
      targetType,
      targetId,
      status: 'OPEN',
      ...identityOf(reporterId, reporterIp),
    },
    select: { id: true },
  })
  if (existing) {
    throw new ApiError(409, 'You have already reported this. Our team is on it — thank you.')
  }
}

// The owner's notification for a takedown: what happened, what happens next,
// and where appeals go. One place, so the wording never drifts.
function takedownNotice(title: string, why: string): { type: string; title: string; body: string } {
  return {
    type: 'LISTING_HIDDEN',
    title: 'Your listing was hidden',
    body: `"${title}" was ${why} It is no longer visible to buyers. Our team will review it — to appeal, email ${SUPPORT_EMAIL}.`,
  }
}

// Auto-hide tripwire: count DISTINCT reporters among the OPEN reports on a
// listing. At three, the listing is hidden and the owner is told why — once
// (the listing is already HIDDEN on any later trip, so no repeat notices).
async function maybeAutoHideListing(listingId: string): Promise<void> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, userId: true, title: true, status: true },
  })
  if (!listing || listing.status !== 'ACTIVE') return

  const openReports = await db.report.findMany({
    where: { targetType: 'LISTING', targetId: listingId, status: 'OPEN' },
    select: { reporterId: true, reporterIp: true },
  })
  const distinct = new Set(openReports.map((r) => reporterKeyOf(r.reporterId, r.reporterIp ?? 'unknown')))
  if (distinct.size < AUTO_HIDE_REPORT_COUNT) return

  await db.$transaction([
    db.listing.update({ where: { id: listing.id }, data: { status: 'HIDDEN' } }),
    db.notification.create({
      data: {
        userId: listing.userId,
        ...takedownNotice(listing.title, `hidden automatically after ${distinct.size} reports from different people.`),
        listingId: listing.id,
      },
    }),
  ])
}

export interface CreateReportInput {
  targetType: 'LISTING' | 'SHOP'
  targetId: string
  reason: string
  details?: string | null
}

/** Create a report from the current request (guests welcome). Returns the
 *  stored row; the caller serializes the safe fields only. */
export async function createReport(request: Request, input: CreateReportInput): Promise<Report> {
  const user = await getSessionUser()
  const ip = clientIp(request)
  const reporterId = user?.id ?? null

  // The ceiling first: probing with duplicates must not earn unlimited tries.
  await assertDailyLimit(reporterId, ip)

  // The target must exist. Shops are addressed by owner id (same as
  // /api/shops/[id] and the in-app deep links); listings by listing id.
  if (input.targetType === 'LISTING') {
    const listing = await db.listing.findUnique({ where: { id: input.targetId }, select: { id: true } })
    if (!listing) throw new ApiError(404, 'This listing does not exist or has been removed')
  } else {
    const shop = await db.user.findUnique({ where: { id: input.targetId }, select: { id: true } })
    if (!shop) throw new ApiError(404, 'This shop does not exist or has been removed')
  }

  await assertNoOpenDuplicate(reporterId, ip, input.targetType, input.targetId)

  const report = await db.report.create({
    data: {
      reporterId,
      reporterIp: reporterId ? null : ip,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details?.trim() ? input.details.trim().slice(0, 500) : null,
      status: 'OPEN',
    },
  })

  if (input.targetType === 'LISTING') {
    await maybeAutoHideListing(input.targetId)
  }

  return report
}

// What the admin queue shows per report. Phones, reporter identities and
// IPs are excluded by construction — the queue needs the WHAT, never the WHO.
export interface AdminReportRow {
  id: string
  reason: string
  details: string | null
  status: string
  createdAt: string
  targetType: 'LISTING' | 'SHOP'
  targetId: string
  listing: { id: string; title: string; status: string; price: number | null; currency: string } | null
  shop: { id: string; name: string; shopCode: string | null; hiddenListingCount: number } | null
}

export async function listOpenReports(): Promise<AdminReportRow[]> {
  const reports = await db.report.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'asc' },
  })

  const listingIds = [...new Set(reports.filter((r) => r.targetType === 'LISTING').map((r) => r.targetId))]
  const shopIds = [...new Set(reports.filter((r) => r.targetType === 'SHOP').map((r) => r.targetId))]

  const listings = await db.listing.findMany({
    where: { id: { in: listingIds } },
    select: { id: true, title: true, status: true, price: true, currency: true },
  })
  const shops = await db.user.findMany({
    where: { id: { in: shopIds } },
    select: {
      id: true,
      name: true,
      profile: { select: { businessName: true, shopCode: true } },
      listings: { where: { status: 'HIDDEN' }, select: { id: true } },
    },
  })
  const listingById = new Map(listings.map((l) => [l.id, l]))
  const shopById = new Map(shops.map((s) => [s.id, s]))

  return reports.map((r) => ({
    id: r.id,
    reason: r.reason,
    details: r.details,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    targetType: r.targetType as 'LISTING' | 'SHOP',
    targetId: r.targetId,
    listing:
      r.targetType === 'LISTING'
        ? (listingById.get(r.targetId) ?? null)
        : null,
    shop:
      r.targetType === 'SHOP'
        ? (() => {
            const s = shopById.get(r.targetId)
            if (!s) return null
            return {
              id: s.id,
              name: s.profile?.businessName?.trim() || s.name,
              shopCode: s.profile?.shopCode ?? null,
              hiddenListingCount: s.listings.length,
            }
          })()
        : null,
  }))
}

async function audit(actorId: string, action: string, targetType: string, targetId: string): Promise<void> {
  await db.auditLog.create({ data: { actorId, action, targetType, targetId } })
}

/** Admin HIDE: take the listing down now. Every OPEN report on it becomes
 *  ACTIONED (the queue stays honest — nothing open remains for a hidden
 *  target), and the owner is told why with the appeals address. Idempotent
 *  on an already-hidden listing; the action is still audited. */
export async function adminHideListing(actorId: string, listingId: string): Promise<void> {
  const listing = await db.listing.findUnique({ where: { id: listingId } })
  if (!listing) throw new ApiError(404, 'This listing does not exist or has been removed')

  if (listing.status !== 'HIDDEN') {
    await db.$transaction([
      db.listing.update({ where: { id: listing.id }, data: { status: 'HIDDEN' } }),
      db.notification.create({
        data: {
          userId: listing.userId,
          ...takedownNotice(listing.title, 'hidden by the Mudaala team after a report.'),
          listingId: listing.id,
        },
      }),
    ])
  }
  await db.report.updateMany({
    where: { targetType: 'LISTING', targetId: listing.id, status: 'OPEN' },
    data: { status: 'ACTIONED' },
  })
  await audit(actorId, 'HIDE_LISTING', 'LISTING', listing.id)
}

/** Admin RESTORE: bring a hidden listing back. Only a HIDDEN listing can be
 *  restored — the owner's own Fulfilled/Archived choices are not overridden.
 *  Restoring says "this listing is fine": remaining OPEN reports on it are
 *  DISMISSED so the same three people cannot instantly re-hide it. */
export async function adminRestoreListing(actorId: string, listingId: string): Promise<void> {
  const listing = await db.listing.findUnique({ where: { id: listingId } })
  if (!listing) throw new ApiError(404, 'This listing does not exist or has been removed')
  if (listing.status !== 'HIDDEN') {
    throw new ApiError(409, `This listing is ${listing.status.toLowerCase()}, not hidden — there is nothing to restore.`)
  }

  await db.listing.update({ where: { id: listing.id }, data: { status: 'ACTIVE' } })
  await db.report.updateMany({
    where: { targetType: 'LISTING', targetId: listing.id, status: 'OPEN' },
    data: { status: 'DISMISSED' },
  })
  await audit(actorId, 'RESTORE_LISTING', 'LISTING', listing.id)
}

/** Admin DISMISS: this report needs no action. The listing's status is left
 *  exactly as it is — restoring a hidden listing is a separate, explicit
 *  Restore decision with its own audit row. */
export async function adminDismissReport(actorId: string, reportId: string): Promise<void> {
  const report = await db.report.findUnique({ where: { id: reportId } })
  if (!report) throw new ApiError(404, 'This report does not exist')
  if (report.status !== 'OPEN') {
    throw new ApiError(409, 'This report has already been handled')
  }
  await db.report.update({ where: { id: report.id }, data: { status: 'DISMISSED' } })
  await audit(actorId, 'DISMISS_REPORT', 'REPORT', report.id)
}
