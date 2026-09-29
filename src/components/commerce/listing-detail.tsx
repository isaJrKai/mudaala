'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, MapPin, Package, Phone, MessageCircle, Eye, Clock, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { apiGet } from '@/lib/client'
import type { ListingDetail } from '@/lib/client'
import { formatPrice, formatQuantity, formatDateTime, timeAgo, expiryLabel, whatsappLink, telLink, formatPhonePretty } from '@/lib/format'
import { categoryLabel, unitLabel } from '@/lib/constants'
import { useAppStore } from '@/lib/store'
import { TypeBadge, StatusBadge, FreshnessDot } from './badges'
import { ListingListSkeleton } from './skeletons'
import { ErrorState } from './listings-browse'
import { EmptyState } from './empty-state'

// Listing detail — everything needed to act: price, quantity, location,
// freshness, status, and direct contact with the right person.
export function ListingDetail({ id }: { id: string }) {
  const { navigate } = useAppStore()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => apiGet<{ listing: ListingDetail }>(`/api/listings/${id}`),
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

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate({ name: 'browse' })}>
        <ArrowLeft className="size-4" aria-hidden /> Back to browse
      </Button>

      <article className="rounded-lg border bg-card">
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={listing.type} />
            <StatusBadge status={listing.status} />
            <span className="text-xs text-muted-foreground">{categoryLabel(listing.category)}</span>
          </div>

          <h1 className="mt-2.5 text-xl font-semibold tracking-tight">{listing.title}</h1>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-xl font-semibold text-primary">
              {formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)}
            </p>
            {listing.priceNegotiable ? <span className="text-sm text-muted-foreground">Negotiable</span> : null}
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
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              <dt className="text-muted-foreground">Freshness:</dt>
              <dd className="flex items-center gap-1.5 font-medium">
                <FreshnessDot refreshedAt={listing.refreshedAt} /> updated {timeAgo(listing.refreshedAt)}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-muted-foreground" aria-hidden />
              <dt className="text-muted-foreground">Views:</dt>
              <dd className="font-medium">{listing.viewCount}</dd>
            </div>
            <div className="text-muted-foreground sm:col-span-2">
              Posted {formatDateTime(listing.publishedAt)} · {expiryLabel(listing.expiresAt)}
            </div>
          </dl>
        </div>

        {/* Contact — only real, owner-provided contact details. */}
        <div className="border-t bg-secondary/40 p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Contact</h2>
          <p className="mt-1 text-sm text-muted-foreground">{formatPhonePretty(listing.contactPhone)}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button asChild className="flex-1">
              <a href={telLink(listing.contactPhone)} aria-label={`Call ${formatPhonePretty(listing.contactPhone)}`}>
                <Phone className="size-4" aria-hidden /> Call seller
              </a>
            </Button>
            {whatsapp ? (
              <Button asChild variant="outline" className="flex-1 border-emerald-600 text-emerald-800 hover:bg-emerald-50">
                <a href={whatsappLink(whatsapp, listing.title, listing.type)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" aria-hidden /> WhatsApp
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </article>

      {/* Seller — real account info; no verification claims are made. */}
      <section className="rounded-lg border bg-card p-4 sm:p-5" aria-label="About the seller">
        <h2 className="text-sm font-semibold">About the seller</h2>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
            {(listing.user.profile?.businessName || listing.user.name).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            {/* The shop name the seller chose — this is their space, named by them. */}
            <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
              {listing.user.profile?.businessName?.trim() || listing.user.name}
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
        {listing.user.profile?.description ? (
          <p className="mt-2.5 text-sm text-muted-foreground">{listing.user.profile.description}</p>
        ) : null}
        {listing.user.profile?.hours ? <p className="mt-1 text-sm text-muted-foreground">Hours: {listing.user.profile.hours}</p> : null}
      </section>
    </div>
  )
}

export { EmptyState }
