'use client'

// Listing detail — everything needed to act: what it looks like (photos),
// who is selling (the named shop), how much, where (with directions for
// pickup), and direct contact. No login needed for any of it.

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, MapPin, Navigation, Package, Phone, Plus, Store } from 'lucide-react'
import { WhatsAppIcon } from '@/components/commerce/brand-icons'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { apiGet } from '@/lib/client'
import type { ListingDetail as ListingDetailT } from '@/lib/client'
import {
  formatPrice,
  formatQuantity,
  formatDateTime,
  timeAgo,
  expiryLabel,
  whatsappLink,
  telLink,
  formatPhonePretty,
  mapsSearchUrl,
} from '@/lib/format'
import { categoryLabel, unitLabel, countryDef } from '@/lib/constants'
import { ShareAdRow } from './share-row'
import { SafetyCard } from './safety-card'
import { ReportButton } from './report-button'
import { PlaceholderTile } from './placeholder-tile'
import { HeartButton } from './listing-card'
import { useAppStore } from '@/lib/store'
import { useAddToBasket, useAddedFlash } from './basket-view'
import { TypeBadge, StatusBadge } from './badges'
import { ListingListSkeleton } from './skeletons'
import { ErrorState } from './listings-browse'
import { EmptyState } from './empty-state'
import { copy } from '@/lib/copy'
import { cn } from '@/lib/utils'
import { useSession } from '@/hooks/use-session'
import { Camera } from 'lucide-react'

function PhotoGallery({ listing }: { listing: ListingDetailT }) {
  if (listing.photos.length === 0) {
    // PLACEHOLDER RULE — no photo yet: the neutral tile (flat grey, category
    // name, small camera icon), never a stock or illustrated stand-in.
    return (
      <div className="h-56 w-full sm:h-72">
        <PlaceholderTile
          category={listing.category}
          note="No photo — ask the seller for details"
          iconClassName="size-8"
        />
      </div>
    )
  }
  return (
    <div className="relative">
      <div
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto scrollbar-slim p-2"
        aria-label={copy.listing.photosOfAria(listing.title)}
      >
        {listing.photos.map((photo, i) => (
          <div key={photo} className="relative h-56 w-[88%] shrink-0 snap-center overflow-hidden rounded-lg border sm:h-80">
            <img
              src={photo}
              alt={copy.listing.photoAlt(listing.title, i, listing.photos.length)}
              loading={i === 0 ? 'eager' : 'lazy'}
              className="size-full object-cover"
            />
          </div>
        ))}
      </div>
      {listing.photos.length > 1 ? (
        <span className="absolute right-3 top-3 rounded bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
          {copy.listing.photoSwipe(listing.photos.length)}
        </span>
      ) : null}
    </div>
  )
}

export function ListingDetail({ id }: { id: string }) {
  const { navigate } = useAppStore()
  const addToBasket = useAddToBasket()
  const [added, flashAdded] = useAddedFlash()
  const { user } = useSession()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => apiGet<{ listing: ListingDetailT }>(`/api/listings/${id}`),
  })

  // The canonical ad-page URL: window origin + /l/{id}. Derived during
  // render, not synced through state — the origin is stable for the life of
  // the page, and only the browser ever has a listing to share (the query
  // only runs client-side), so no SSR guard is needed in practice.
  const listing = data?.listing
  const shareUrl = listing ? `${window.location.origin}/l/${listing.id}` : null

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate({ name: 'browse' })}>
          <ArrowLeft className="size-4" aria-hidden /> {copy.listing.backToBrowse}
        </Button>
        <ListingListSkeleton count={2} />
      </div>
    )
  }

  if (isError || !data || !listing) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate({ name: 'browse' })}>
          <ArrowLeft className="size-4" aria-hidden /> {copy.listing.backToBrowse}
        </Button>
        <ErrorState message={error instanceof Error ? error.message : copy.listing.loadError} onRetry={() => refetch()} />
      </div>
    )
  }

  const quantity = formatQuantity(listing.quantity, listing.unit)
  const sharePriceLabel = listing.price !== null ? formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency) : null
  const whatsapp = listing.contactWhatsapp ?? (listing.type === 'OFFER' ? listing.contactPhone : listing.contactWhatsapp)
  const shopDisplayName = listing.user.profile?.businessName?.trim() || listing.user.name
  const shopPhoto = listing.user.profile?.photoUrl ?? null
  const directionsUrl = mapsSearchUrl({
    area: listing.area,
    county: listing.county,
    country: countryDef(listing.country ?? 'UG').name,
  })

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate({ name: 'browse' })}>
        <ArrowLeft className="size-4" aria-hidden /> {copy.listing.backToBrowse}
      </Button>

      <article className="overflow-hidden rounded-lg border bg-card">
        <PhotoGallery listing={listing} />

        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={listing.type} />
            <StatusBadge status={listing.status} />
            <span className="text-xs text-muted-foreground">{categoryLabel(listing.category)}</span>
          </div>

          <h1 className="mt-2.5 text-xl font-bold tracking-tight">{listing.title}</h1>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-2xl font-bold text-primary tabular-nums">
              {formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)}
            </p>
            {/* A real discount: the struck-through "was" price says exactly what
                it is — no fake crossed-out prices can render here, because the
                API rejects old prices that are not higher than the current one. */}
            {listing.price !== null && listing.compareAtPrice !== null && listing.compareAtPrice > listing.price ? (
              <>
                <span className="text-sm text-muted-foreground line-through tabular-nums">
                  {copy.common.was} {formatPrice(listing.compareAtPrice, null, listing.currency)}
                </span>
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-600/20 tabular-nums">
                  −{Math.round(((listing.compareAtPrice - listing.price) / listing.compareAtPrice) * 100)}%
                </span>
              </>
            ) : null}
            {listing.priceNegotiable ? <span className="text-sm text-muted-foreground">{copy.common.negotiable}</span> : null}
            {/* The heart lives with the price: "come back to this one" sits
                right next to "this is what it costs". OFFERs only, like the
                basket — a shortlist of things you can actually take. */}
            {listing.type === 'OFFER' ? (
              <HeartButton
                listingId={listing.id}
                title={listing.title}
                className="ml-auto self-center"
              />
            ) : null}
          </div>

          {/* The buy action, next to the price where buy intent lives.
              OFFERs only: a REQUEST is someone offering to sell to YOU.
              The flash only plays when the basket really took the item —
              addToBasket reports back. */}
          {listing.type === 'OFFER' ? (
            <Button
              variant="secondary"
              className="press mt-3 h-10 w-full gap-1.5 text-[15px]"
              onClick={() => flashAdded(addToBasket(listing))}
            >
              {added ? (
                <>
                  <Check
                    className="size-4 animate-in fade-in zoom-in-75 text-emerald-700 motion-reduce:animate-none"
                    style={{ animationDuration: '150ms' }}
                    aria-hidden
                  />
                  {copy.listing.addedToBasket}
                </>
              ) : (
                <>
                  <Plus className="size-4" aria-hidden /> {copy.listing.addToBasket}
                </>
              )}
            </Button>
          ) : null}

          {/* Who you would be buying from — the seller's own shop name, said
              back to the buyer in plain words. */}
          <div className="mt-3 flex items-center gap-2.5 rounded-md border bg-secondary/40 px-3 py-2.5">
            {shopPhoto ? (
              <img src={shopPhoto} alt="" className="size-10 shrink-0 rounded-full border object-cover" />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                {shopDisplayName.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {listing.type === 'OFFER' ? copy.listing.buyFrom : copy.listing.sellTo}
              </p>
              <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
                <Store className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {shopDisplayName}
              </p>
            </div>
          </div>

          {listing.status !== 'ACTIVE' ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {listing.status === 'FULFILLED'
                ? copy.listing.fulfilledNote
                : listing.status === 'EXPIRED'
                  ? copy.listing.expiredNote
                  : copy.listing.archivedNote}
            </p>
          ) : null}

          {/* The seller's own photo-less ad: the one nudge that helps. Photos
              get more calls, and the upload button is right here. */}
          {user?.id === listing.userId && listing.photos.length === 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-primary/30 bg-accent/40 px-3 py-2.5">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground/85">
                <Camera className="size-4 shrink-0 text-primary" aria-hidden />
                {copy.listing.addPhotoTitle}
              </p>
              <Button size="sm" className="press h-8" onClick={() => navigate({ name: 'edit', id: listing.id })}>
                {copy.listing.addPhotoCta}
              </Button>
            </div>
          ) : null}

          <Separator className="my-4" />

          <h2 className="text-sm font-semibold">{copy.listing.description}</h2>
          <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{listing.description}</p>

          <Separator className="my-4" />

          <h2 className="text-sm font-semibold">{copy.listing.details}</h2>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {quantity ? (
              <div className="flex items-center gap-2">
                <Package className="size-4 text-muted-foreground" aria-hidden />
                <dt className="text-muted-foreground">{copy.listing.quantity}:</dt>
                <dd className="font-medium tabular-nums">{quantity}</dd>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" aria-hidden />
              <dt className="text-muted-foreground">{copy.listing.location}:</dt>
              <dd className="font-medium">{[listing.area, listing.county].filter(Boolean).join(', ')}</dd>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{copy.listing.updated}:</span>
              <dd className="flex items-center gap-1.5 font-medium">
                {timeAgo(listing.refreshedAt)}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{copy.listing.views}:</span>
              <dd className="font-medium tabular-nums">{listing.viewCount}</dd>
            </div>
            <div className="text-muted-foreground sm:col-span-2 tabular-nums">
              {copy.listing.posted(formatDateTime(listing.publishedAt), expiryLabel(listing.expiresAt))}
            </div>
          </dl>
        </div>

        {/* Contact — only real, owner-provided contact details. The safety
            card comes FIRST: read before contact happens. Plus directions
            for the "can I pick it up myself?" decision. */}
        <div className="border-t bg-secondary/40 p-4 sm:p-5">
          <h2 className="text-sm font-semibold">{copy.listing.contact(shopDisplayName)}</h2>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">{formatPhonePretty(listing.contactPhone)}</p>
          <div className="mt-3">
            <SafetyCard />
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button asChild className="press h-11 flex-1 text-[15px]">
              <a href={telLink(listing.contactPhone)} aria-label={`Call ${formatPhonePretty(listing.contactPhone)}`}>
                <Phone className="size-4" aria-hidden /> {copy.common.call}
              </a>
            </Button>
            {whatsapp ? (
              <Button
                asChild
                variant="outline"
                className="press h-11 flex-1 border-emerald-600 text-[15px] text-emerald-800 hover:bg-emerald-50"
              >
                <a href={whatsappLink(whatsapp, listing.title, listing.type)} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="size-4" aria-hidden /> {copy.common.whatsapp}
                </a>
              </Button>
            ) : null}
          </div>
          <Button asChild variant="outline" className="press mt-2 h-11 w-full gap-1.5 text-[15px]">
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={copy.listing.directionsAria([listing.area, listing.county].filter(Boolean).join(', '))}
            >
              <Navigation className="size-4" aria-hidden /> {copy.listing.directions}
              <span className="text-xs font-normal text-muted-foreground">{copy.listing.directionsHint}</span>
            </a>
          </Button>
          <div className="mt-3">
            <ReportButton targetType="LISTING" targetId={listing.id} noun="ad" />
          </div>
        </div>
      </article>

      {/* Share — every ad carries its own shareable ad-page URL, so what a
          seller forwards on WhatsApp opens as a real web page with photos,
          price and the shop, not a dead app fragment. */}
      {shareUrl ? (
        <section className="rounded-lg border bg-card p-4 sm:p-5" aria-label="Share this ad">
          <ShareAdRow title={listing.title} url={shareUrl} priceLabel={sharePriceLabel} />
        </section>
      ) : null}

      {/* Seller — real account info; no verification claims are made. */}
      <section className="rounded-lg border bg-card p-4 sm:p-5" aria-label="About the seller">
        <h2 className="text-sm font-semibold">{copy.listing.aboutSeller}</h2>
        <div className="mt-2 flex items-center gap-3">
          {shopPhoto ? (
            <img src={shopPhoto} alt="" className="size-11 shrink-0 rounded-md border object-cover" />
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-semibold text-accent-foreground">
              {shopDisplayName.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            {/* The shop name the seller chose — this is their space, named by them.
                Serif is reserved for exactly this: the shop's name. */}
            <p className="flex items-center gap-1.5 truncate font-display text-[17px] font-semibold">
              {shopDisplayName}
              <Store className="size-3.5 text-muted-foreground" aria-hidden />
            </p>
            <p className="text-sm text-muted-foreground">
              {listing.user.profile?.area || listing.user.profile?.county
                ? [listing.user.profile?.area, listing.user.profile?.county].filter(Boolean).join(', ') + ' · '
                : ''}
              {copy.listing.memberSince(new Date(listing.user.createdAt).toLocaleDateString('en', { month: 'short', year: 'numeric' }))}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="press mt-3 w-full gap-1.5"
          onClick={() => navigate({ name: 'shop', id: listing.userId })}
          aria-label={copy.listing.visitShopAria(shopDisplayName)}
        >
          <Store className="size-4" aria-hidden /> {copy.listing.visitShop(shopDisplayName)}
        </Button>
        {listing.user.profile?.description ? (
          <p className="mt-2.5 text-sm text-muted-foreground">{listing.user.profile.description}</p>
        ) : null}
        {listing.user.profile?.hours ? <p className="mt-1 text-sm text-muted-foreground">{copy.listing.hours(listing.user.profile.hours)}</p> : null}
      </section>
    </div>
  )
}

export { EmptyState }
