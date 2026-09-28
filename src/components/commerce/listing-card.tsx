'use client'

import { MapPin, Package } from 'lucide-react'
import { formatPrice, formatQuantity, timeAgo } from '@/lib/format'
import { categoryLabel, unitLabel } from '@/lib/constants'
import { TypeBadge, StatusBadge, FreshnessDot } from './badges'
import type { Listing } from '@/lib/client'
import { cn } from '@/lib/utils'

interface ListingCardProps {
  listing: Listing
  onOpen: (id: string) => void
  actions?: React.ReactNode
  showStatus?: boolean
}

// One listing, scannable at a glance: what, how much, where, how fresh.
export function ListingCard({ listing, onOpen, actions, showStatus }: ListingCardProps) {
  const quantity = formatQuantity(listing.quantity, listing.unit)
  return (
    <div className="rounded-lg border bg-card transition-colors hover:border-input/80">
      <button
        type="button"
        onClick={() => onOpen(listing.id)}
        className="w-full p-4 text-left"
        aria-label={`Open listing: ${listing.title}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={listing.type} />
          <span className="text-xs text-muted-foreground">{categoryLabel(listing.category)}</span>
          {showStatus ? <StatusBadge status={listing.status} /> : null}
        </div>

        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h3 className="min-w-0 truncate text-[15px] font-semibold">{listing.title}</h3>
          {listing.type === 'OFFER' ? (
            <p className="shrink-0 text-[15px] font-semibold text-primary">
              {formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null)}
              {listing.priceNegotiable && listing.price !== null ? <span className="ml-1 text-xs font-normal text-muted-foreground">neg.</span> : null}
            </p>
          ) : (
            <p className="shrink-0 text-[13px] font-medium text-muted-foreground">
              {listing.price !== null ? `Budget: ${formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null)}` : 'Ask for price'}
            </p>
          )}
        </div>

        {quantity || listing.area ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            {quantity ? (
              <span className="inline-flex items-center gap-1">
                <Package className="size-3.5" aria-hidden /> {quantity} {listing.type === 'OFFER' ? 'available' : 'wanted'}
              </span>
            ) : null}
            {listing.area || listing.county ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {[listing.area, listing.county].filter(Boolean).join(', ')}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
          <FreshnessDot refreshedAt={listing.refreshedAt} />
          <span>{timeAgo(listing.refreshedAt)}</span>
          <span aria-hidden>·</span>
          <span>{listing.viewCount} views</span>
        </div>
      </button>
      {actions ? <div className={cn('border-t px-4 py-2.5')}>{actions}</div> : null}
    </div>
  )
}
