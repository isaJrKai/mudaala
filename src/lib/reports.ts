// Mudaala — reports and moderation.
//
// A buyer flags an ad or a shop; moderation reviews. The rules that keep
// this honest and safe:
//
//   - Guests can report (identified by IP); signed-in reporters by user id.
//   - One OPEN report per reporter per target — a second attempt gets a
//     friendly "already reported" instead of piling up duplicates.
//   - Ten accepted reports per reporter per day (rate-limit.ts), so one
//     grudge cannot flood the queue.
//   - Three open reports from THREE DIFFERENT reporters on one listing
//     auto-hide it: the listing goes HIDDEN everywhere, the owner gets a
//     notification that explains why and points at [SUPPORT EMAIL] for
//     appeals, and the system logs its own action in the AuditLog.
//   - Every admin action (hide, restore, dismiss) leaves an AuditLog row.

import { db } from '@/lib/db'
import { SUPPORT_EMAIL } from '@/lib/constants'
import type { Report } from '@prisma/client'

export interface CreateReportInput {
  reporterId: string | null
  reporterIp: string | null
  targetType: 'LISTING' | 'SHOP'
  targetId: string
  reason: string
  details: string | null
}

/** The reporter's identity key for dedupe and distinct-reporter counting:
 *  a signed-in user is their user id; a guest is their IP. */
function reporterKey(report: Pick<Report, 'reporterId' | 'reporterIp'>): string {
  return report.reporterId ?? `ip:${report.reporterIp ?? 'unknown'}`
}

export class DuplicateReportError extends Error {}
export class TargetNotFoundError extends Error {}

export async function createReport(input: CreateReportInput): Promise<Report> {
  // The target must exist right now — reporting a ghost helps nobody.
  if (input.targetType === 'LISTING') {
    const listing = await db.listing.findUnique({ where: { id: input.targetId }, select: { id: true } })
    if (!listing) throw new TargetNotFoundError('This ad no longer exists')
  } else {
    const shop = await db.businessProfile.findUnique({ where: { id: input.targetId }, select: { id: true } })
    if (!shop) throw new TargetNotFoundError('This shop no longer exists')
  }

  // One OPEN report per reporter per target. Duplicate attempts are answered
  // (and stopped) BEFORE the daily cap is touched — hammering the same report
  // is a duplicate problem, not a volume problem.
  const existing = await db.report.findFirst({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
      status: 'OPEN',
      ...(input.reporterId
        ? { reporterId: input.reporterId }
        : { reporterId: null, reporterIp: input.reporterIp ?? 'unknown' }),
    },
    select: { id: true },
  })
  if (existing) {
    throw new DuplicateReportError('You have already reported this — our team is on it.')
  }

  const report = await db.report.create({
    data: {
      reporterId: input.reporterId,
      reporterIp: input.reporterId ? null : input.reporterIp,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details?.trim() || null,
    },
  })

  if (input.targetType === 'LISTING') {
    await autoHideListingIfFlagged(input.targetId)
  }
  return report
}

/** Auto-hide rule: 3 or more OPEN reports from 3 DISTINCT reporters send the
 *  listing to HIDDEN. Runs after every accepted listing report; cheap until
 *  it matters (one indexed query per report). */
async function autoHideListingIfFlagged(listingId: string): Promise<void> {
  const open = await db.report.findMany({
    where: { targetType: 'LISTING', targetId: listingId, status: 'OPEN' },
    select: { reporterId: true, reporterIp: true },
  })
  const distinctReporters = new Set(open.map(reporterKey))
  if (distinctReporters.size < 3) return

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, userId: true, title: true, status: true },
  })
  // Gone, or already handled (HIDDEN / FULFILLED / ARCHIVED) — never resurrect
  // a fulfilled sale by hiding it, and never hide twice.
  if (!listing || listing.status !== 'ACTIVE') return

  await db.$transaction([
    db.listing.update({ where: { id: listing.id }, data: { status: 'HIDDEN' } }),
    db.notification.create({
      data: {
        userId: listing.userId,
        type: 'LISTING_HIDDEN',
        title: `Your listing "${listing.title}" was hidden`,
        body:
          `Several buyers reported this ad, so we have hidden it while our team reviews it. ` +
          `Reports like this usually mean the ad looks misleading or offers something that is not allowed on Mudaala. ` +
          `If you believe this was a mistake, email ${SUPPORT_EMAIL} and we will look again within a day.`,
        listingId: listing.id,
      },
    }),
    db.auditLog.create({
      data: {
        actorId: null, // the system acted on the community's behalf
        action: 'AUTO_HIDE_LISTING',
        targetType: 'LISTING',
        targetId: listing.id,
      },
    }),
  ])
}

/** Admin manual hide — same owner notification, human actor in the log. */
export async function hideListingByAdmin(listingId: string, adminId: string): Promise<void> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, userId: true, title: true, status: true },
  })
  if (!listing) throw new TargetNotFoundError('This ad no longer exists')

  if (listing.status === 'ACTIVE') {
    await db.$transaction([
      db.listing.update({ where: { id: listing.id }, data: { status: 'HIDDEN' } }),
      db.notification.create({
        data: {
          userId: listing.userId,
          type: 'LISTING_HIDDEN',
          title: `Your listing "${listing.title}" was hidden`,
          body:
            `Our team reviewed reports about this ad and hid it while we look closer. ` +
            `If you believe this was a mistake, email ${SUPPORT_EMAIL} and we will look again within a day.`,
          listingId: listing.id,
        },
      }),
    ])
  }
  await db.auditLog.create({
    data: { actorId: adminId, action: 'HIDE_LISTING', targetType: 'LISTING', targetId: listingId },
  })
}

/** Admin restore — back to ACTIVE, logged. */
export async function restoreListingByAdmin(listingId: string, adminId: string): Promise<void> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, status: true },
  })
  if (!listing) throw new TargetNotFoundError('This ad no longer exists')

  if (listing.status === 'HIDDEN') {
    await db.listing.update({ where: { id: listingId }, data: { status: 'ACTIVE' } })
  }
  await db.auditLog.create({
    data: { actorId: adminId, action: 'RESTORE_LISTING', targetType: 'LISTING', targetId: listingId },
  })
}

/** Admin dismiss — the report is closed without action, logged. */
export async function dismissReportByAdmin(reportId: string, adminId: string): Promise<void> {
  const report = await db.report.findUnique({ where: { id: reportId }, select: { id: true } })
  if (!report) throw new TargetNotFoundError('This report no longer exists')

  await db.$transaction([
    db.report.update({ where: { id: reportId }, data: { status: 'DISMISSED' } }),
    db.auditLog.create({
      data: { actorId: adminId, action: 'DISMISS_REPORT', targetType: 'REPORT', targetId: reportId },
    }),
  ])
}
