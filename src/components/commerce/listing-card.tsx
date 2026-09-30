'use client'

// One listing, scannable at a glance — and now photo-first, because our users
// read pictures before words. Layout: photo (or category icon block) on the
// left, what/how much/where on the right. The footer bar carries the three
// buyer actions: WHO sells it (tap → their shop), CALL, and WHATSAPP — all
// reachable without opening the listing at all.

import { MapPin, MessageCircle, Package, Phone, Store } from 'lucide-react'
import { formatPrice, formatQuantity, timeAgo, telLink, whatsappLink } from '@/lib/format'
import { categoryLabel, unitLabel } from '@/lib/constants'
import { CategoryGlyph, categoryTint } from './category-icons'
import { TypeBadge, StatusBadge, FreshnessDot } from './badges'
import type { Listing, ListingShopOwner } from '@/lib/client'
import { cn } from '@/lib/utils'

interface ListingCardProps {
  listing: Listing & { user?: ListingShopOwner }
  onOpen: (id: string) => void
  /** Owner actions strip (My Listings). Replaces the buyer shop bar. */
  actions?: React.ReactNode
  showStatus?: boolean
  /** When provided (and the listing knows its owner), the buyer bar renders:
   *  shop chip (→ shop page) + Call + WhatsApp. */
  onOpenShop?: (shopId: string) => void
  /** Overrides the shop display name — the browse feed uses it to tell
   *  same-name shops apart ("Nakato Fresh Produce · Jinja"). */
  shopLabel?: string
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

// A real discount exists only when the "was" price beats the current one.
export function isDiscounted(listing: Pick<Listing, 'price' | 'compareAtPrice'>): boolean {
  return listing.price !== null && listing.compareAtPrice !== null && listing.compareAtPrice > listing.price
}

export function discountPercent(listing: Pick<Listing, 'price' | 'compareAtPrice'>): number | null {
  if (!isDiscounted(listing) || listing.price === null || listing.compareAtPrice === null) return null
  return Math.round(((listing.compareAtPrice - listing.price) / listing.compareAtPrice) * 100)
}

export function ListingCard({ listing, onOpen, actions, showStatus, onOpenShop, shopLabel }: ListingCardProps) {
  const quantity = formatQuantity(listing.quantity, listing.unit)
  const shop = listing.user
  const baseShopName = shop?.profile?.businessName?.trim() || shop?.name
  const shopDisplayName = shopLabel ?? baseShopName
  const shopPhoto = shop?.profile?.photoUrl ?? null
  const discounted = isDiscounted(listing)
  const percentOff = discountPercent(listing)

  // WhatsApp rule shared with the detail page: explicit WhatsApp number, or
  // (for offers) the phone itself. Requests only show what the owner gave.
  const whatsappNumber = listing.contactWhatsapp ?? (listing.type === 'OFFER' ? listing.contactPhone : null)

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

            {/* Price — big, high-contrast, the second thing the eye lands on.
                A discount shows the struck-through "was" price next to it. */}
            {listing.type === 'OFFER' ? (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <p className="text-lg font-bold leading-none text-primary">
                  {formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)}
                  {listing.priceNegotiable && listing.price !== null ? <span className="ml-1 text-xs font-normal text-muted-foreground">neg.</span> : null}
                </p>
                {discounted ? (
                  <>
                    <span className="text-xs text-muted-foreground line-through">
                      {formatPrice(listing.compareAtPrice, null, listing.currency)}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
                      −{percentOff}%
                    </span>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-sm font-semibold leading-none text-foreground/80">
                {listing.price !== null ? `Budget: ${formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)}` : 'Ask for price'}
              </p>
            )}

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
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

      {actions ? (
        <div className="border-t px-3 py-2.5">{actions}</div>
      ) : onOpenShop && shop && shopDisplayName ? (
        // Buyer bar: who sells it (tap → shop), then direct call / WhatsApp.
        <div className="flex items-center gap-2 border-t px-3 py-2">
          <button
            type="button"
            onClick={() => onOpenShop(shop.id)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-secondary/60"
            aria-label={`Visit shop: ${shopDisplayName}`}
          >
            {shopPhoto ? (
              <img src={shopPhoto} alt="" className="size-6 shrink-0 rounded-full border object-cover" />
            ) : (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                {shopDisplayName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/80">{shopDisplayName}</span>
            <Store className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
          <a
            href={telLink(listing.contactPhone)}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border bg-card px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
            aria-label={`Call ${shopDisplayName} about ${listing.title}`}
          >
            <Phone className="size-3.5 text-primary" aria-hidden /> Call
          </a>
          {whatsappNumber ? (
            <a
              href={whatsappLink(whatsappNumber, listing.title, listing.type)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-emerald-600/40 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
              aria-label={`WhatsApp ${shopDisplayName} about ${listing.title}`}
            >
              <MessageCircle className="size-3.5" aria-hidden /> Chat
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
