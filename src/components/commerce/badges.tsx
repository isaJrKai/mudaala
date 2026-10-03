'use client'

import { Badge } from '@/components/ui/badge'
import { LISTING_TYPES_UI, STATUS_UI, type ListingStatus, type ListingType } from '@/lib/constants'
import { cn } from '@/lib/utils'

export function TypeBadge({ type, className }: { type: ListingType; className?: string }) {
  const ui = LISTING_TYPES_UI[type]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide',
        ui.badge,
        className,
      )}
    >
      {ui.label}
    </span>
  )
}

export function StatusBadge({ status, className }: { status: ListingStatus; className?: string }) {
  if (status === 'ACTIVE') return null // Active needs no badge - it is the normal case.
  const ui = STATUS_UI[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide',
        ui.badge,
        className,
      )}
    >
      {ui.label}
    </span>
  )
}

// Freshness dot: green < 24h, amber < 3 days, grey after that.
export function FreshnessDot({ refreshedAt, className }: { refreshedAt: string; className?: string }) {
  const ageHours = (Date.now() - new Date(refreshedAt).getTime()) / 3_600_000
  const color = ageHours < 24 ? 'bg-emerald-500' : ageHours < 72 ? 'bg-amber-500' : 'bg-stone-400'
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', color, className)} aria-hidden />
}
