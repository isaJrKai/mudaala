'use client'

// Listing detail — everything needed to act: what it looks like (photos),
// who is selling (the named shop), how much, where (with directions for
// pickup), and direct contact. No login needed for any of it.

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, MapPin, MessageCircle, Navigation, Package, Phone, Plus, Store } from 'lucide-react'
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
import { CategoryGlyph, categoryTint } from './category-icons'
import { useAppStore } from '@/lib/store'
import { useAddToBasket } from './basket-view'
import { TypeBadge, StatusBadge } from './badges'
import { ListingListSkeleton } from './skeletons'
import { ErrorState } from './listings-browse'
import { EmptyState } from './empty-state'
import { cn } from '@/lib/utils'

function PhotoGallery({ listing }: { listing: ListingDetailT }) {
  if (listing.photos.length === 0) {
    return (
      <div className={cn('flex h-56 w-full flex-col items-center justify-center gap-2 text-center sm:h-72', categoryTint(listing.category))}>
        <CategoryGlyph category={listing.category} className="[&_svg]:size-12" />
        <span className="px-4 text-sm font-medium">{categoryLabel(listing.category)}</span>
        <span className="px-4 text-xs text-muted-foreground">No photo — ask the seller for details</span>
      </div>
    )
  }
  return (
    <div className="relative">
      <div
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto scrollbar-slim p-2"
        aria-label={`Photos of ${listing.title}`}
      >
        {listing.photos.map((photo, i) => (
          <img
            key={photo}
            src={photo}
            alt={`${listing.title} — photo ${i + 1} of ${listing.photos.length}`}
            loading={i === 0 ? 'eager' : 'lazy'}
            className="h-56 w-[88%] shrink-0 snap-center rounded-md border object-cover sm:h-80"
          />
        ))}
      </div>
      {listing.photos.length > 1 ? (
        <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          {listing.photos.length} photos · swipe
        </span>
      ) : null}
    </div>
  )
}

export function ListingDetail({ id }: { id: string }) {
  const { navigate } = useAppStore()
  const addToBasket = useAddToBasket()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => apiGet<{ listing: ListingDetailT }>(`/api/listings/${id}`),
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate({ name: 'browse' })}>
          <ArrowLeft className="size-4" aria-hidden /> Back to browse
        </Button>
        <ListingListSkeleton count={2} />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate({ name: 'browse' })}>
          <ArrowLeft className="size-4" aria-hidden /> Back to browse
        </Button>
        <ErrorState message={error instanceof Error ? error.message : 'Could not load this listing'} onRetry={() => refetch()} />
      </div>
    )
  }

  const { listing } = data
  const quantity = formatQuantity(listing.quantity, listing.unit)
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
        <ArrowLeft className="size-4" aria-hidden /> Back to browse
      </Button>

      <article className="overflow-hidden rounded-lg border bg-card">
        <PhotoGallery listing={listing} />

        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={listing.type} />
            <StatusBadge status={listing.status} />
            <span className="text-xs text-muted-foreground">{categoryLabel(listing.category)}</span>
          </div>

          <h1 className="mt-2.5 text-xl font-semibold tracking-tight">{listing.title}</h1>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-2xl font-bold text-primary">
              {formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)}
            </p>
            {/* A real discount: the struck-through "was" price says exactly what
                it is — no fake crossed-out prices can render here, because the
                API rejects old prices that are not higher than the current one. */}
            {listing.price !== null && listing.compareAtPrice !== null && listing.compareAtPrice > listing.price ? (
              <>
                <span className="text-sm text-muted-foreground line-through">
                  was {formatPrice(listing.compareAtPrice, null, listing.currency)}
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
                  −{Math.round(((listing.compareAtPrice - listing.price) / listing.compareAtPrice) * 100)}%
                </span>
              </>
            ) : null}
            {listing.priceNegotiable ? <span className="text-sm text-muted-foreground">Negotiable</span> : null}
          </div>

          {/* The buy action, next to the price where buy intent lives.
              OFFERs only: a REQUEST is someone offering to sell to YOU. */}
          {listing.type === 'OFFER' ? (
            <Button variant="secondary" className="mt-3 h-10 w-full gap-1.5 text-[15px]" onClick={() => addToBasket(listing)}>
              <Plus className="size-4" aria-hidden /> Add to basket
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
                {listing.type === 'OFFER' ? 'You would be buying from' : 'You would be selling to'}
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
                ? 'This listing has been marked as fulfilled by the owner.'
                : listing.status === 'EXPIRED'
                  ? 'This listing has expired and may no longer be available.'
                  : 'This listing was archived by the owner.'}
            </p>
          ) : null}

          <Separator className="my-4" />

          <h2 className="text-sm font-semibold">Description</h2>
          <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{listing.description}</p>

          <Separator className="my-4" />

          <h2 className="text-sm font-semibold">Details</h2>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {quantity ? (
              <div className="flex items-center gap-2">
                <Package className="size-4 text-muted-foreground" aria-hidden />
                <dt className="text-muted-foreground">Quantity:</dt>
                <dd className="font-medium">{quantity}</dd>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" aria-hidden />
              <dt className="text-muted-foreground">Location:</dt>
              <dd className="font-medium">{[listing.area, listing.county].filter(Boolean).join(', ')}</dd>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Updated:</span>
              <dd className="flex items-center gap-1.5 font-medium">
                {timeAgo(listing.refreshedAt)}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Views:</span>
              <dd className="font-medium">{listing.viewCount}</dd>
            </div>
            <div className="text-muted-foreground sm:col-span-2">
              Posted {formatDateTime(listing.publishedAt)} · {expiryLabel(listing.expiresAt)}
            </div>
          </dl>
        </div>

        {/* Contact — only real, owner-provided contact details. Plus directions
            for the "can I pick it up myself?" decision. */}
        <div className="border-t bg-secondary/40 p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Contact {shopDisplayName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{formatPhonePretty(listing.contactPhone)}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button asChild className="h-11 flex-1 text-[15px]">
              <a href={telLink(listing.contactPhone)} aria-label={`Call ${formatPhonePretty(listing.contactPhone)}`}>
                <Phone className="size-4" aria-hidden /> Call seller
              </a>
            </Button>
            {whatsapp ? (
              <Button
                asChild
                variant="outline"
                className="h-11 flex-1 border-emerald-600 text-[15px] text-emerald-800 hover:bg-emerald-50"
              >
                <a href={whatsappLink(whatsapp, listing.title, listing.type)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" aria-hidden /> WhatsApp
                </a>
              </Button>
            ) : null}
          </div>
          <Button asChild variant="outline" className="mt-2 h-11 w-full gap-1.5 text-[15px]">
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Get directions to ${[listing.area, listing.county].filter(Boolean).join(', ')}`}
            >
              <Navigation className="size-4" aria-hidden /> Get directions
              <span className="text-xs font-normal text-muted-foreground">(Google Maps — for pickup)</span>
            </a>
          </Button>
        </div>
      </article>

      {/* Seller — real account info; no verification claims are made. */}
      <section className="rounded-lg border bg-card p-4 sm:p-5" aria-label="About the seller">
        <h2 className="text-sm font-semibold">About the seller</h2>
        <div className="mt-2 flex items-center gap-3">
          {shopPhoto ? (
            <img src={shopPhoto} alt="" className="size-11 shrink-0 rounded-full border object-cover" />
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
              {shopDisplayName.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            {/* The shop name the seller chose — this is their space, named by them. */}
            <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
              {shopDisplayName}
              <Store className="size-3.5 text-muted-foreground" aria-hidden />
            </p>
            <p className="text-sm text-muted-foreground">
              {listing.user.profile?.area || listing.user.profile?.county
                ? [listing.user.profile?.area, listing.user.profile?.county].filter(Boolean).join(', ') + ' · '
                : ''}
              Member since {new Date(listing.user.createdAt).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="mt-3 w-full gap-1.5"
          onClick={() => navigate({ name: 'shop', id: listing.userId })}
          aria-label={`Visit ${shopDisplayName}'s shop`}
        >
          <Store className="size-4" aria-hidden /> Visit {shopDisplayName}'s shop
        </Button>
        {listing.user.profile?.description ? (
          <p className="mt-2.5 text-sm text-muted-foreground">{listing.user.profile.description}</p>
        ) : null}
        {listing.user.profile?.hours ? <p className="mt-1 text-sm text-muted-foreground">Hours: {listing.user.profile.hours}</p> : null}
      </section>
    </div>
  )
}

export { EmptyState }
