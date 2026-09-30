'use client'

// The shop — a seller's own space on Duuka. Everything a buyer needs to trust
// them and browse their whole catalogue: who they are, where they are, when
// they are open, a call/WhatsApp button, and every active listing they run.
// Buyers never sign in to see any of this.

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, Clock, MapPin, MessageCircle, Package, Phone, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/client'
import type { ShopPage as ShopPageT, ListingShopOwner } from '@/lib/client'
import { telLink, whatsappLink } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import { ListingCard } from './listing-card'
import { ListingListSkeleton } from './skeletons'
import { ErrorState } from './listings-browse'
import { EmptyState } from './empty-state'

export function ShopView({ id }: { id: string }) {
  const { navigate } = useAppStore()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['shop', id],
    queryFn: () => apiGet<ShopPageT>(`/api/shops/${id}`),
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate({ name: 'browse' })}>
          <ArrowLeft className="size-4" aria-hidden /> Back to browse
        </Button>
        <ListingListSkeleton count={3} />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate({ name: 'browse' })}>
          <ArrowLeft className="size-4" aria-hidden /> Back to browse
        </Button>
        <ErrorState message={error instanceof Error ? error.message : 'Could not load this shop'} onRetry={() => refetch()} />
      </div>
    )
  }

  const { shop, listings } = data
  const whatsappNumber = shop.whatsapp ?? shop.phone
  const doneCount = Object.values(shop.checklist).filter(Boolean).length

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate({ name: 'browse' })}>
        <ArrowLeft className="size-4" aria-hidden /> Back to browse
      </Button>

      {/* Shop identity — the seller's own space, named by them */}
      <section className="overflow-hidden rounded-lg border bg-card" aria-label={`Shop: ${shop.name}`}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5">
          {shop.photoUrl ? (
            <img
              src={shop.photoUrl}
              alt={`Photo of ${shop.name}`}
              className="size-20 shrink-0 rounded-lg border object-cover sm:size-24"
            />
          ) : (
            <span className="flex size-20 shrink-0 items-center justify-center rounded-lg border bg-accent text-2xl font-bold text-accent-foreground sm:size-24">
              {shop.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{shop.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
              {shop.area || shop.county ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden /> {[shop.area, shop.county].filter(Boolean).join(', ')}
                </span>
              ) : null}
              {shop.hours ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden /> {shop.hours}
                </span>
              ) : null}
            </p>

            {/* Honest trust chips — what buyers can verify themselves */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {shop.complete ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
                  <BadgeCheck className="size-3.5" aria-hidden /> Complete shop profile
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Profile {doneCount}/5 complete
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Package className="size-3" aria-hidden /> {shop.activeCount} {shop.activeCount === 1 ? 'listing' : 'listings'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Store className="size-3" aria-hidden /> Since {new Date(shop.memberSince).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {shop.description ? (
          <p className="border-t px-4 py-3 text-sm leading-relaxed text-foreground/90 sm:px-5">{shop.description}</p>
        ) : null}

        {/* Shop contact — the same direct links buyers get everywhere */}
        <div className="border-t bg-secondary/40 p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="h-11 flex-1 text-[15px]">
              <a href={telLink(shop.phone)} aria-label={`Call ${shop.name}`}>
                <Phone className="size-4" aria-hidden /> Call {shop.name}
              </a>
            </Button>
            {whatsappNumber ? (
              <Button
                asChild
                variant="outline"
                className="h-11 flex-1 border-emerald-600 text-[15px] text-emerald-800 hover:bg-emerald-50"
              >
                <a
                  href={whatsappLink(whatsappNumber, shop.name, 'OFFER')}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`WhatsApp ${shop.name}`}
                >
                  <MessageCircle className="size-4" aria-hidden /> WhatsApp
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {/* The catalogue — every active listing this shop runs */}
      <section aria-label="Shop catalogue" className="space-y-3">
        <h2 className="text-base font-semibold">
          In this shop <span className="font-normal text-muted-foreground">({shop.activeCount})</span>
        </h2>

        {listings.length === 0 ? (
          <EmptyState
            icon={<Store />}
            title="Nothing in the shop right now"
            description="This shop has no active listings at the moment. Check back later, or browse other shops."
            action={
              <Button variant="outline" onClick={() => navigate({ name: 'browse' })}>
                Browse all listings
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={{ ...listing, user: shopOwnerFrom(shop) }}
                onOpen={(lid) => navigate({ name: 'listing', id: lid })}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// Catalogue cards already sit inside the shop, so the per-card shop chip is
// redundant — attach the owner identity for the record, not for navigation.
function shopOwnerFrom(shop: ShopPageT['shop']): ListingShopOwner {
  return {
    id: shop.id,
    name: shop.name,
    profile: { businessName: shop.name, photoUrl: shop.photoUrl },
  }
}
