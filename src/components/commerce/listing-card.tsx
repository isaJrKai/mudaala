'use client'

// One listing, scannable at a glance — and now photo-first, because our users
// read pictures before words. Layout: photo (or category icon block) on the
// left, what/how much/where on the right. The footer bar carries the three
// buyer actions: WHO sells it (tap → their shop), CALL, and WHATSAPP — all
// reachable without opening the listing at all.

import { Check, Heart, MapPin, Navigation, Package, Phone, Plus, Store } from 'lucide-react'
import { WhatsAppIcon } from '@/components/commerce/brand-icons'
import { formatPrice, formatQuantity, timeAgo, telLink, whatsappLink } from '@/lib/format'
import { categoryLabel, unitLabel } from '@/lib/constants'
import { CategoryGlyph, categoryTint } from './category-icons'
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
  /** Overrides the shop display name — the browse feed uses it to tell
   *  same-name shops apart ("Nakato Fresh Produce · Jinja"). */
  shopLabel?: string
  /** Buyer-facing distance ("850 m", "2.3 km") shown while "Near me" is on. */
  distanceLabel?: string
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
function isDiscounted(listing: Pick<Listing, 'price' | 'compareAtPrice'>): boolean {
  return listing.price !== null && listing.compareAtPrice !== null && listing.compareAtPrice > listing.price
}

// The heart — "I want to find this again". Stored on this phone like the
// basket (buyers never sign in). The pop plays ONLY on a real love: the
// store reports back, a full shortlist says so instead of animating a lie.
// Remounting the icon via key replays the CSS bounce every single time.
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
        description: `You can keep up to ${LOVED_CAP} loved items — take one off to make room for this.`,
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
        'press inline-flex items-center justify-center rounded-full',
        onPhoto
          ? 'size-8 bg-black/60 text-white backdrop-blur-sm hover:bg-black/75'
          : 'size-10 border bg-card text-muted-foreground hover:border-destructive/40 hover:text-destructive',
        className,
      )}
    >
      {loved ? (
        <Heart
          key="loved"
          className="heart-pop size-4 fill-destructive text-destructive motion-reduce:animate-none"
          aria-hidden
        />
      ) : (
        <Heart key="plain" className="size-4" aria-hidden />
      )}
    </button>
  )
}

function discountPercent(listing: Pick<Listing, 'price' | 'compareAtPrice'>): number | null {
  if (!isDiscounted(listing) || listing.price === null || listing.compareAtPrice === null) return null
  return Math.round(((listing.compareAtPrice - listing.price) / listing.compareAtPrice) * 100)
}

export function ListingCard({ listing, onOpen, actions, showStatus, onOpenShop, shopLabel, distanceLabel }: ListingCardProps) {
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
              {distanceLabel ? (
                <span className="inline-flex items-center gap-1 font-medium text-foreground/70">
                  <Navigation className="size-3.5" aria-hidden /> {distanceLabel}
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
              <WhatsAppIcon className="size-3.5" aria-hidden /> Chat
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
   *  shop chip (→ shop page) above Call + WhatsApp. Shop catalogues omit it —
   *  the buyer is already inside that shop. */
  onOpenShop?: (shopId: string) => void
  /** When provided (and the listing knows its owner), OFFER blocks get an
   *  add-to-basket button on the photo. Returns whether the add really
   *  happened (useAddToBasket does) so the button only flashes success
   *  honestly — void is treated as success for loose callers. */
  onAdd?: (listing: Listing & { user?: ListingShopOwner }) => boolean | void
  /** Same-name shop disambiguation, fed by the browse feed. */
  shopLabel?: string
  /** Buyer-facing distance ("850 m", "2.3 km") shown while "Near me" is on. */
  distanceLabel?: string
}

// The same listing as a photo-first BLOCK for grid surfaces (browse feed,
// shop catalogue). Pictures sell: the photo gets the card's full width and
// what/how much/where stack under it. Contact stays on the card — Call and
// WhatsApp are reachable without ever opening the listing.
export function ListingBlock({ listing, onOpen, onOpenShop, onAdd, shopLabel, distanceLabel }: ListingBlockProps) {
  const quantity = formatQuantity(listing.quantity, listing.unit)
  const shop = listing.user
  const shopDisplayName = shopLabel ?? (shop?.profile?.businessName?.trim() || shop?.name)
  const shopPhoto = shop?.profile?.photoUrl ?? null
  const discounted = isDiscounted(listing)
  const percentOff = discountPercent(listing)
  const whatsappNumber = listing.contactWhatsapp ?? (listing.type === 'OFFER' ? listing.contactPhone : null)
  const place = [listing.area, listing.county].filter(Boolean).join(', ')
  const [added, flashAdded] = useAddedFlash()

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-input/80">
      {/* Photo — the whole reason this is a block. The open affordance is a
          click LAYER under the overlays, so the basket button can be a real
          sibling button (nested buttons are invalid HTML and break taps).
          On pointer devices the photo leans in a touch under the cursor —
          an invitation, not a show (4%, 300ms, hover-gated). */}
      <div className="group/photo relative aspect-[4/3] w-full overflow-hidden border-b bg-secondary/30">
        <ListingPhoto
          listing={listing}
          className="transition-transform duration-300 ease-out group-hover/photo:scale-[1.04] motion-reduce:transition-none motion-reduce:transform-none"
        />
        <button
          type="button"
          onClick={() => onOpen(listing.id)}
          className="absolute inset-0 z-0"
          aria-label={`Open listing: ${listing.title}`}
        />
        <span className="pointer-events-none absolute left-1.5 top-1.5 z-10">
          <TypeBadge type={listing.type} />
        </span>
        {listing.type === 'OFFER' ? (
          <HeartButton
            listingId={listing.id}
            title={listing.title}
            onPhoto
            className="absolute right-1.5 top-1.5 z-20"
          />
        ) : null}
        {listing.photos.length > 1 ? (
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 z-10 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            +{listing.photos.length - 1}
          </span>
        ) : null}
        {onAdd && listing.type === 'OFFER' ? (
          <button
            type="button"
            onClick={() => flashAdded(onAdd(listing) !== false)}
            className="press absolute bottom-1.5 left-1.5 z-20 inline-flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/75"
            aria-label={`Add ${listing.title} to basket`}
          >
            {added ? (
              <Check
                className="size-4 animate-in fade-in zoom-in-75 text-emerald-300 motion-reduce:animate-none"
                style={{ animationDuration: '150ms' }}
                aria-hidden
              />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onOpen(listing.id)}
        className="w-full flex-1 text-left"
        aria-label={`Open listing: ${listing.title}`}
      >
        <div className="p-2.5">
          {/* Exactly two lines of title keep every card in a row the same
              height — a 1-line title leaves room, a 5-line one gets cut. */}
          <h3 className="line-clamp-2 min-h-10 text-sm font-medium leading-snug">{listing.title}</h3>

          {listing.type === 'OFFER' ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
              <p className="text-base font-bold leading-tight text-primary">
                {formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)}
                {listing.priceNegotiable && listing.price !== null ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">neg.</span> : null}
              </p>
              {discounted ? (
                <>
                  <span className="text-[11px] text-muted-foreground line-through">
                    {formatPrice(listing.compareAtPrice, null, listing.currency)}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
                    −{percentOff}%
                  </span>
                </>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 text-sm font-semibold leading-tight text-foreground/80">
              {listing.price !== null ? `Budget: ${formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)}` : 'Ask for price'}
            </p>
          )}

          <p className="mt-1 flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
            {quantity ? (
              <>
                <Package className="size-3 shrink-0" aria-hidden /> {quantity}
              </>
            ) : null}
            {place ? (
              <>
                {quantity ? <span aria-hidden>·</span> : null}
                <MapPin className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{place}</span>
              </>
            ) : null}
          </p>
          <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FreshnessDot refreshedAt={listing.refreshedAt} /> {timeAgo(listing.refreshedAt)}
            </span>
            {distanceLabel ? (
              <span className="inline-flex items-center gap-0.5 font-medium text-foreground/70">
                <Navigation className="size-3" aria-hidden /> {distanceLabel}
              </span>
            ) : null}
          </p>
        </div>
      </button>

      {onOpenShop && shop && shopDisplayName ? (
        // Buyer bar, stacked for the narrow block: who sells it on top, then
        // Call | WhatsApp sharing the row. mt-auto pins it to the card bottom
        // so unequal titles never leave a ragged edge in the grid.
        <div className="mt-auto border-t px-2 py-2">
          <button
            type="button"
            onClick={() => onOpenShop(shop.id)}
            className="press flex w-full min-w-0 items-center gap-1.5 rounded-md px-0.5 py-0.5 text-left hover:bg-secondary/60"
            aria-label={`Visit shop: ${shopDisplayName}`}
          >
            {shopPhoto ? (
              <img src={shopPhoto} alt="" className="size-5 shrink-0 rounded-full border object-cover" />
            ) : (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                {shopDisplayName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground/80">{shopDisplayName}</span>
            <Store className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          </button>
          <div className="mt-1.5 flex gap-1.5">
            <a
              href={telLink(listing.contactPhone)}
              className="press inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border bg-card text-xs font-semibold text-foreground hover:bg-secondary"
              aria-label={`Call ${shopDisplayName} about ${listing.title}`}
            >
              <Phone className="size-3.5 text-primary" aria-hidden /> Call
            </a>
            {whatsappNumber ? (
              <a
                href={whatsappLink(whatsappNumber, listing.title, listing.type)}
                target="_blank"
                rel="noopener noreferrer"
                className="press inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-emerald-600/40 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                aria-label={`WhatsApp ${shopDisplayName} about ${listing.title}`}
              >
                <WhatsAppIcon className="size-3.5" aria-hidden /> Chat
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
