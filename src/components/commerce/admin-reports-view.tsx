'use client'

// The moderation queue, live from /api/admin/reports. Each open report shows
// what was reported (listing or shop), why, and the reporter's own words —
// with the three actions. Shop reports are Dismiss-only in V1: HIDDEN is a
// listing state, and taking down a whole shop is a bigger hammer than V1
// should swing without its own spec.

import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Flag, MapPin, RotateCcw, ShieldCheck, Store, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiGet, apiPatch } from '@/lib/client'
import { REPORT_REASONS_UI, type ReportReason } from '@/lib/constants'
import { EmptyState } from './empty-state'
import { ErrorState } from './listings-browse'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface AdminReportRow {
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

function reasonLabel(reason: string): string {
  return REPORT_REASONS_UI[reason as ReportReason]?.label ?? reason
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'HIDDEN'
      ? 'bg-red-100 text-red-900 border-red-200'
      : status === 'ACTIVE'
        ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
        : 'bg-stone-100 text-stone-700 border-stone-200'
  return (
    <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold', tone)}>
      {status === 'ACTIVE' ? 'Live' : status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

function ReportCard({ report, onDone }: { report: AdminReportRow; onDone: () => void }) {
  const act = async (action: 'HIDE' | 'RESTORE' | 'DISMISS') => {
    await apiPatch(`/api/admin/reports/${report.id}`, { action })
    onDone()
  }

  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
          <Flag className="size-3" aria-hidden /> {reasonLabel(report.reason)}
        </span>
        <span className="text-xs text-muted-foreground">
          {report.targetType === 'LISTING' ? 'Listing' : 'Shop'} ·{' '}
          {new Date(report.createdAt).toLocaleString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {report.listing ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <a
            href={`/l/${report.listing.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            {report.listing.title} <ExternalLink className="size-3" aria-hidden />
          </a>
          <StatusPill status={report.listing.status} />
        </div>
      ) : null}

      {report.shop ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Store className="size-3.5 text-muted-foreground" aria-hidden /> {report.shop.name}
          </span>
          {report.shop.shopCode ? (
            <span className="rounded border bg-secondary px-1.5 py-0.5 font-mono text-[12px] font-semibold">{report.shop.shopCode}</span>
          ) : null}
          {report.shop.hiddenListingCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {report.shop.hiddenListingCount} hidden listing{report.shop.hiddenListingCount === 1 ? '' : 's'}
            </span>
          ) : null}
          <a
            href={`/s/${report.shop.shopCode ?? ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            Shop page <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      ) : null}

      {report.details ? (
        <p className="mt-2 rounded-md bg-secondary/50 px-3 py-2 text-sm leading-relaxed text-foreground/90">
          “{report.details}”
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {report.targetType === 'LISTING' ? (
          <>
            {report.listing?.status !== 'HIDDEN' ? (
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => act('HIDE')}>
                <X className="size-3.5" aria-hidden /> Hide listing
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5 border-emerald-600 text-emerald-800 hover:bg-emerald-50" onClick={() => act('RESTORE')}>
                <RotateCcw className="size-3.5" aria-hidden /> Restore listing
              </Button>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Shop report — review and dismiss. Shop takedowns are not part of V1.
          </p>
        )}
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => act('DISMISS')}>
          <ShieldCheck className="size-3.5" aria-hidden /> Dismiss report
        </Button>
      </div>
    </article>
  )
}

export function AdminReportsView() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: () => apiGet<{ reports: AdminReportRow[] }>('/api/admin/reports'),
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return <ErrorState message={error instanceof Error ? error.message : 'Could not load the reports'} onRetry={() => refetch()} />
  }

  if (data.reports.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <EmptyState
          icon={<ShieldCheck />}
          title="No open reports"
          description="The market is calm. New reports from buyers and sellers will appear here."
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="size-3" aria-hidden /> {data.reports.length} open report{data.reports.length === 1 ? '' : 's'} · refreshes every 30s
      </p>
      {data.reports.map((report) => (
        <ReportCard key={report.id} report={report} onDone={() => refetch()} />
      ))}
    </div>
  )
}
