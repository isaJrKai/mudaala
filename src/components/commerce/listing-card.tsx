'use client'

// One listing, scannable at a glance. The card LEADS with the item name and
// price in large bold type; area, quantity and time posted sit on one plain
// meta line ("Nakasero · 20 min ago"). On phones the card is a ROW with a
// small photo on the side; in desktop grids it stacks into a compact block.
// Photos: object-fit cover, 8px max radius, 1px border, no shadows. A
// missing photo shows the neutral grey tile (category name + camera icon),
// never a stock or generated image. Contact stays on the card: Call and
// WhatsApp are reachable without opening the ad.

import { Check, Heart, Phone, Plus, Store } from 'lucide-react'
import { WhatsAppIcon } from '@/components/commerce/brand-icons'
import { formatPrice, formatQuantity, timeAgo, telLink, whatsappLink } from '@/lib/format'
import { unitLabel } from '@/lib/constants'
import { copy } from '@/lib/copy'
import { PlaceholderTile } from './placeholder-tile'
import { TypeBadge, StatusBadge, FreshnessDot } from './badges'
import { useAddedFlash } from './basket-view'
import { LOVED_CAP, isLoved, toggleLoved, useLovedIds } from '@/lib/loved'
import { useToast } from '@/hooks/use-toast'
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
  /** Overrides the shop display name - the browse feed uses it to tell
   *  same-name shops apart ("Nakato Fresh Produce · Jinja"). */
  shopLabel?: string
  /** Buyer-facing distance ("850 m", "2.3 km") shown while "Near me" is on. */
  distanceLabel?: string
}

// Photo rules for every card: cover fit, no shadows. The wrapper carries the
// 1px border and the 8px max radius; the image itself is square-cornered
// inside it.
function ListingPhoto({ listing, className }: { listing: Listing; className?: string }) {
  if (listing.photos.length > 0) {
    return <img src={listing.photos[0]} alt="" loading="lazy" className={cn('size-full object-cover', className)} />
  }
  // PLACEHOLDER RULE - no photo yet: the neutral tile (flat grey, category
  // name, small camera icon), never a stock or illustrated stand-in.
  return <PlaceholderTile category={listing.category} className={className} />
}

// A real discount exists only when the "was" price beats the current one.
function isDiscounted(listing: Pick<Listing, 'price' | 'compareAtPrice'>): boolean {
  return listing.price !== null && listing.compareAtPrice !== null && listing.compareAtPrice > listing.price
}

function discountPercent(listing: Pick<Listing, 'price' | 'compareAtPrice'>): number | null {
  if (!isDiscounted(listing) || listing.price === null || listing.compareAtPrice === null) return null
  return Math.round(((listing.compareAtPrice - listing.price) / listing.compareAtPrice) * 100)
}

// The heart - "I want to find this again". Stored on this phone like the
// basket (buyers never sign in). The pop plays ONLY on a real love. Remounting
// the icon via key replays the CSS bounce every single time.
export function HeartButton({
  listingId,
  title,
  onPhoto,
  className,
}: {
  listingId: string
  title: string
  /** Dark-photo variant (block cards) vs light-surface variant (detail). */
  onPhoto?: boolean
  className?: string
}) {
  const lovedIds = useLovedIds()
  const loved = isLoved(lovedIds, listingId)
  const { toast } = useToast()

  function handleToggle() {
    const result = toggleLoved(listingId)
    if (result === 'full') {
      toast({
        title: 'Your shortlist is full',
        description: `You can keep up to ${LOVED_CAP} loved items. Take one off to make room for this.`,
        variant: 'destructive',
      })
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-pressed={loved}
      aria-label={loved ? `Remove ${title} from your loved items` : `Love ${title}`}
      className={cn(
        'press inline-flex items-center justify-center rounded-md',
        onPhoto ? 'size-8 bg-black/70 text-white hover:bg-black/85' : 'size-10 border bg-card text-muted-foreground hover:border-destructive/40 hover:text-destructive',
        className,
      )}
    >
      {loved ? (
        <Heart key="loved" className="heart-pop size-4 fill-destructive text-destructive motion-reduce:animate-none" aria-hidden />
      ) : (
        <Heart key="plain" className="size-4" aria-hidden />
      )}
    </button>
  )
}

// The name + price lead. Tabular numbers keep the UGX digits aligned across
// a feed of cards.
function PriceLead({ listing, large }: { listing: Listing; large?: boolean }) {
  const discounted = isDiscounted(listing)
  const percentOff = discountPercent(listing)
  if (listing.type === 'OFFER') {
    return (
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <p className={cn('font-bold leading-none text-primary tabular-nums', large ? 'text-lg' : 'text-base')}>
          {formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)}
          {listing.priceNegotiable && listing.price !== null ? (
            <span className="ml-1 text-xs font-normal text-muted-foreground">{copy.common.negotiableShort}</span>
          ) : null}
        </p>
        {discounted ? (
          <>
            <span className="text-xs text-muted-foreground line-through tabular-nums">
              {formatPrice(listing.compareAtPrice, null, listing.currency)}
            </span>
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
              −{percentOff}%
            </span>
          </>
        ) : null}
      </div>
    )
  }
  return (
    <p className={cn('mt-1 font-semibold leading-none text-foreground/80 tabular-nums', large ? 'text-sm' : 'text-sm')}>
      {listing.price !== null
        ? `${copy.common.budget}: ${formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)}`
        : copy.common.askPrice}
    </p>
  )
}

// One plain meta line: "Nakasero · 20 min ago" (+ quantity and distance when
// they exist). Text, no icons - the words carry it.
function MetaLine({
  listing,
  quantity,
  distanceLabel,
}: {
  listing: Listing
  quantity: string | null
  distanceLabel?: string
}) {
  const place = [listing.area, listing.county].filter(Boolean).join(', ')
  const parts = [place, quantity, distanceLabel, timeAgo(listing.refreshedAt)].filter(Boolean)
  return (
    <p className="mt-1.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground tabular-nums">
      <FreshnessDot refreshedAt={listing.refreshedAt} />
      <span className="truncate">{parts.join(' · ')}</span>
    </p>
  )
}

export function ListingCard({ listing, onOpen, actions, showStatus, onOpenShop, shopLabel, distanceLabel }: ListingCardProps) {
  const quantity = formatQuantity(listing.quantity, listing.unit)
  const shop = listing.user
  const baseShopName = shop?.profile?.businessName?.trim() || shop?.name
  const shopDisplayName = shopLabel ?? baseShopName
  const shopPhoto = shop?.profile?.photoUrl ?? null
  const whatsappNumber = listing.contactWhatsapp ?? (listing.type === 'OFFER' ? listing.contactPhone : null)

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <button type="button" onClick={() => onOpen(listing.id)} className="w-full text-left" aria-label={copy.card.openAria(listing.title)}>
        <div className="flex gap-3 p-2.5">
          {/* Photo - small, on the side, its own 1px border and 8px radius */}
          <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border bg-secondary sm:size-28">
            <ListingPhoto listing={listing} />
            <span className="absolute left-1 top-1">
              <TypeBadge type={listing.type} />
            </span>
            {listing.photos.length > 1 ? (
              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
                {copy.card.photoCount(listing.photos.length - 1)}
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 min-w-0 text-[15px] font-bold leading-snug">{listing.title}</h3>
              {showStatus ? <StatusBadge status={listing.status} /> : null}
            </div>
            <PriceLead listing={listing} large />
            <MetaLine listing={listing} quantity={quantity} distanceLabel={distanceLabel} />
          </div>
        </div>
      </button>

      {actions ? (
        <div className="border-t px-3 py-2.5">{actions}</div>
      ) : onOpenShop && shop && shopDisplayName ? (
        // Buyer bar: who sells it (tap → shop), then direct call / WhatsApp.
        <div className="flex items-center gap-2 border-t px-2.5 py-2">
          <button
            type="button"
            onClick={() => onOpenShop(shop.id)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-secondary/60"
            aria-label={copy.card.visitShopAria(shopDisplayName)}
          >
            {shopPhoto ? (
              <img src={shopPhoto} alt="" className="size-6 shrink-0 rounded-md border object-cover" />
            ) : (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-[10px] font-bold text-accent-foreground">
                {shopDisplayName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/80">{shopDisplayName}</span>
            <Store className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
          <a
            href={telLink(listing.contactPhone)}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border bg-card px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
            aria-label={copy.card.callAria(shopDisplayName, listing.title)}
          >
            <Phone className="size-3.5 text-primary" aria-hidden /> {copy.common.call}
          </a>
          {whatsappNumber ? (
            <a
              href={whatsappLink(whatsappNumber, listing.title, listing.type)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-emerald-600/40 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
              aria-label={copy.card.whatsappAria(shopDisplayName, listing.title)}
            >
              <WhatsAppIcon className="size-3.5" aria-hidden /> {copy.common.whatsapp}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface ListingBlockProps {
  listing: Listing & { user?: ListingShopOwner }
  onOpen: (id: string) => void
  /** When provided (and the listing knows its owner), the buyer bar renders:
   *  shop chip (→ shop page) above Call + WhatsApp. Shop catalogues omit it -
   *  the buyer is already inside that shop. */
  onOpenShop?: (shopId: string) => void
  /** When provided (and the listing knows its owner), OFFER blocks get an
   *  add-to-basket button on the photo. Returns whether the add really
   *  happened (useAddToBasket does) so the button only flashes success
   *  honestly - void is treated as success for loose callers. */
  onAdd?: (listing: Listing & { user?: ListingShopOwner }) => boolean | void
  /** Same-name shop disambiguation, fed by the browse feed. */
  shopLabel?: string
  /** Buyer-facing distance ("850 m", "2.3 km") shown while "Near me" is on. */
  distanceLabel?: string
}

// The same listing as a card for grid surfaces (browse feed, shop catalogue,
// loved shelf). One component serves both shapes: a ROW with a small side
// photo on phones, a compact photo-first BLOCK in desktop grids - the CSS
// flips at sm. No nested buttons: the open affordance is a click LAYER under
// the corner overlays.
export function ListingBlock({ listing, onOpen, onOpenShop, onAdd, shopLabel, distanceLabel }: ListingBlockProps) {
  const quantity = formatQuantity(listing.quantity, listing.unit)
  const shop = listing.user
  const shopDisplayName = shopLabel ?? (shop?.profile?.businessName?.trim() || shop?.name)
  const shopPhoto = shop?.profile?.photoUrl ?? null
  const whatsappNumber = listing.contactWhatsapp ?? (listing.type === 'OFFER' ? listing.contactPhone : null)
  const [added, flashAdded] = useAddedFlash()

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-1 sm:block">
        {/* Photo: a bordered 96px tile beside the text on phones, the card's
            full-width top on desktop. No zoom-on-hover - the picture sells,
            it does not perform. */}
        <div className="relative m-2.5 size-24 shrink-0 overflow-hidden rounded-lg border bg-secondary sm:mx-0 sm:mb-0 sm:mt-0 sm:size-auto sm:aspect-[4/3] sm:w-full sm:rounded-none sm:border-0 sm:border-b">
          <ListingPhoto listing={listing} />
          <button type="button" onClick={() => onOpen(listing.id)} className="absolute inset-0 z-0" aria-label={copy.card.openAria(listing.title)} />
          <span className="pointer-events-none absolute left-1 top-1 z-10 sm:left-1.5 sm:top-1.5">
            <TypeBadge type={listing.type} />
          </span>
          {listing.type === 'OFFER' ? (
            <HeartButton
              listingId={listing.id}
              title={listing.title}
              onPhoto
              // The 96px row tile on phones is too small for three overlays -
              // the heart lives on the desktop block and the detail page.
              // sm:inline-flex (not sm:block): the chip needs flex centering
              // or the heart hugs the left edge of the box.
              className="absolute right-1 top-1 z-20 hidden sm:right-1.5 sm:top-1.5 sm:inline-flex"
            />
          ) : null}
          {listing.photos.length > 1 ? (
            <span className="pointer-events-none absolute bottom-1 right-1 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums sm:bottom-1.5 sm:right-1.5">
              {copy.card.photoCount(listing.photos.length - 1)}
            </span>
          ) : null}
          {onAdd && listing.type === 'OFFER' ? (
            <button
              type="button"
              onClick={() => flashAdded(onAdd(listing) !== false)}
              // Same as the heart: row tiles stay clean; the desktop block
              // and the ad page carry the add-to-basket button.
              className="press absolute bottom-1 left-1 z-20 hidden items-center justify-center rounded-md bg-black/70 text-white hover:bg-black/85 sm:bottom-1.5 sm:left-1.5 sm:inline-flex sm:size-8"
              aria-label={copy.card.addBasketAria(listing.title)}
            >
              {added ? (
                <Check className="size-4 animate-in fade-in zoom-in-75 text-emerald-300 motion-reduce:animate-none" style={{ animationDuration: '150ms' }} aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
            </button>
          ) : null}
        </div>

        <button type="button" onClick={() => onOpen(listing.id)} className="min-w-0 flex-1 text-left sm:w-full sm:flex-none" aria-label={copy.card.openAria(listing.title)}>
          {/* pr-2.5 on the row so long titles stop at the card edge; on
              desktop the padding wraps all sides evenly. */}
          <div className="py-2.5 pr-2.5 sm:p-2.5">
            {/* Exactly two lines of title keep every card in a row the same
                height - a 1-line title leaves room, a 5-line one gets cut. */}
            <h3 className="line-clamp-2 text-sm font-bold leading-snug">{listing.title}</h3>
            <PriceLead listing={listing} />
            <MetaLine listing={listing} quantity={quantity} distanceLabel={distanceLabel} />
          </div>
        </button>
      </div>

      {onOpenShop && shop && shopDisplayName ? (
        // Buyer bar, stacked for the narrow card: who sells it on top, then
        // Call | WhatsApp sharing the row. mt-auto pins it to the card bottom
        // so unequal titles never leave a ragged edge in the grid.
        <div className="mt-auto border-t px-2 py-2">
          <button
            type="button"
            onClick={() => onOpenShop(shop.id)}
            className="press flex w-full min-w-0 items-center gap-1.5 rounded-md px-0.5 py-0.5 text-left hover:bg-secondary/60"
            aria-label={copy.card.visitShopAria(shopDisplayName)}
          >
            {shopPhoto ? (
              <img src={shopPhoto} alt="" className="size-5 shrink-0 rounded-md border object-cover" />
            ) : (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent text-[9px] font-bold text-accent-foreground">
                {shopDisplayName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground/80">{shopDisplayName}</span>
            <Store className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          </button>
          <div className="mt-1.5 flex gap-1.5">
            <a
              href={telLink(listing.contactPhone)}
              className="press inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border bg-card text-xs font-semibold text-foreground hover:bg-secondary"
              aria-label={copy.card.callAria(shopDisplayName, listing.title)}
            >
              <Phone className="size-3.5 text-primary" aria-hidden /> {copy.common.call}
            </a>
            {whatsappNumber ? (
              <a
                href={whatsappLink(whatsappNumber, listing.title, listing.type)}
                target="_blank"
                rel="noopener noreferrer"
                className="press inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-emerald-600/40 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                aria-label={copy.card.whatsappAria(shopDisplayName, listing.title)}
              >
                <WhatsAppIcon className="size-3.5" aria-hidden /> {copy.common.whatsapp}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
