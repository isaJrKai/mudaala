'use client'

// One listing, scannable at a glance — and now photo-first, because our users
// read pictures before words. Layout: photo (or category icon block) on the
// left, what/how much/where on the right, and the SELLER'S SHOP under the
// title so a buyer always knows who they would be buying from.

import { MapPin, Package } from 'lucide-react'
import { formatPrice, formatQuantity, timeAgo } from '@/lib/format'
import { categoryLabel, unitLabel } from '@/lib/constants'
import { CategoryGlyph, categoryTint } from './category-icons'
import { TypeBadge, StatusBadge, FreshnessDot } from './badges'
import type { Listing, ListingShopOwner } from '@/lib/client'
import { cn } from '@/lib/utils'

interface ListingCardProps {
  listing: Listing & { user?: ListingShopOwner }
  onOpen: (id: string) => void
  actions?: React.ReactNode
  showStatus?: boolean
}

function ListingPhoto({ listing, className }: { listing: Listing; className?: string }) {
  if (listing.photos.length > 0) {
    return (
      <img
        src={listing.photos[0]}
        alt=""
        loading="lazy"
        className={cn('size-full object-cover', className)}
      />
    )
  }
  return (
    <div className={cn('flex size-full items-center justify-center', categoryTint(listing.category), className)}>
      <CategoryGlyph category={listing.category} className="[&_svg]:size-8" />
    </div>
  )
}

export function ListingCard({ listing, onOpen, actions, showStatus }: ListingCardProps) {
  const quantity = formatQuantity(listing.quantity, listing.unit)
  const shop = listing.user
  const shopDisplayName = shop?.profile?.businessName?.trim() || shop?.name
  const shopPhoto = shop?.profile?.photoUrl ?? null

  return (
    <div className="overflow-hidden rounded-lg border bg-card transition-colors hover:border-input/80">
      <button
        type="button"
        onClick={() => onOpen(listing.id)}
        className="w-full text-left"
        aria-label={`Open listing: ${listing.title}`}
      >
        <div className="flex gap-3 p-3">
          {/* Photo — the first thing the eye lands on */}
          <div className="relative size-24 shrink-0 overflow-hidden rounded-md border bg-secondary/30 sm:size-28">
            <ListingPhoto listing={listing} />
            <span className="absolute left-1 top-1">
              <TypeBadge type={listing.type} />
            </span>
            {listing.photos.length > 1 ? (
              <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                +{listing.photos.length - 1}
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 min-w-0 text-[15px] font-semibold leading-snug">{listing.title}</h3>
              {showStatus ? <StatusBadge status={listing.status} /> : null}
            </div>

            {/* Price — big, high-contrast, the second thing the eye lands on */}
            {listing.type === 'OFFER' ? (
              <p className="mt-1 text-lg font-bold leading-none text-primary">
                {formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)}
                {listing.priceNegotiable && listing.price !== null ? <span className="ml-1 text-xs font-normal text-muted-foreground">neg.</span> : null}
              </p>
            ) : (
              <p className="mt-1 text-sm font-semibold leading-none text-foreground/80">
                {listing.price !== null ? `Budget: ${formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)}` : 'Ask for price'}
              </p>
            )}

            {/* Who is selling — the trust line */}
            {shopDisplayName ? (
              <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                {shopPhoto ? (
                  <img src={shopPhoto} alt="" className="size-4 shrink-0 rounded-full border object-cover" />
                ) : (
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                    {shopDisplayName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate text-xs font-medium text-foreground/80">{shopDisplayName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">· {categoryLabel(listing.category)}</span>
              </div>
            ) : null}

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {quantity ? (
                <span className="inline-flex items-center gap-1">
                  <Package className="size-3.5" aria-hidden /> {quantity}
                </span>
              ) : null}
              {listing.area || listing.county ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden /> {[listing.area, listing.county].filter(Boolean).join(', ')}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <FreshnessDot refreshedAt={listing.refreshedAt} /> {timeAgo(listing.refreshedAt)}
              </span>
            </div>
          </div>
        </div>
      </button>
      {actions ? <div className={cn('border-t px-3 py-2.5')}>{actions}</div> : null}
    </div>
  )
}
