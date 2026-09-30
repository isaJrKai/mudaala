'use client'

// The shop — a seller's own space on Duuka. Everything a buyer needs to trust
// them and browse their whole catalogue: who they are, where they are, when
// they are open, a call/WhatsApp button, and every active listing they run.
// Buyers never sign in to see any of this.
// The shop's identity code (DK-XXXX) and its printable QR poster live here
// too — the poster is the seller's tool for pulling walk-up customers onto
// their page (print it, stick it on the stall, buyers scan).

import { useMemo, useState, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, Clock, Hash, MapPin, MessageCircle, Package, Phone, Printer, QrCode, Store, X } from 'lucide-react'
import QRCode from 'react-qr-code'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/client'
import type { ShopPage as ShopPageT, ListingShopOwner } from '@/lib/client'
import { telLink, whatsappLink } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { ListingCard } from './listing-card'
import { ListingListSkeleton } from './skeletons'
import { ErrorState } from './listings-browse'
import { EmptyState } from './empty-state'

export function ShopView({ id }: { id: string }) {
  const { navigate } = useAppStore()
  const { user, isLoading: sessionLoading } = useSession()
  const [posterOpen, setPosterOpen] = useState(false)
  // The QR encodes an absolute URL, which only exists in the browser.
  // useSyncExternalStore gives '' during SSR/hydration and the real origin
  // after mount — hydration-safe without setState-in-effect (the origin of a
  // page never changes while it is open, so no real subscription is needed).
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  )
  const shopUrl = useMemo(
    () => (origin ? `${origin}/#/shop/${id}` : ''),
    [origin, id],
  )

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
  const isOwner = !sessionLoading && user?.id === shop.id

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
              {shop.shopCode ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/20"
                  title="This shop's code on Duuka — every shop has its own"
                >
                  <Hash className="size-3" aria-hidden /> Shop code <span className="font-mono tracking-wide">{shop.shopCode}</span>
                </span>
              ) : null}
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

      {/* Owner tool: the printable QR poster. Buyers never see this — they are
          already on the page. The seller prints it for the stall, a wheelbarrow
          notice or the shop window; one scan lands on this exact shop. */}
      {isOwner && shop.shopCode ? (
        <section aria-label="Your shop QR poster" className="rounded-lg border bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-md border bg-white p-2">
              {shopUrl ? <QRCode value={shopUrl} size={64} role="img" aria-label={`QR code for ${shop.name}'s shop`} /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">Your shop QR poster</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Print it and put it where customers stand. Anyone who scans lands right here — no typing, no searching.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your code is <span className="font-mono font-semibold text-foreground">{shop.shopCode}</span> — it never changes, so old posters keep working.
              </p>
            </div>
            <Button variant="outline" className="shrink-0 gap-1.5" onClick={() => setPosterOpen(true)}>
              <QrCode className="size-4" aria-hidden /> Show poster & print
            </Button>
          </div>
        </section>
      ) : null}

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

      {/* Printable poster overlay — flat white, big QR, the permanent code.
          The print stylesheet (globals.css) makes the paper show only this. */}
      {posterOpen ? (
        <div className="shop-poster fixed inset-0 z-50 overflow-y-auto bg-white p-5" role="dialog" aria-modal="true" aria-label={`QR poster for ${shop.name}`}>
          <div className="no-print mx-auto flex max-w-md items-center justify-between pb-4">
            <p className="text-sm font-medium text-neutral-500">Poster preview — print and stick it up</p>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setPosterOpen(false)}>
              <X className="size-4" aria-hidden /> Close
            </Button>
          </div>
          <div className="mx-auto max-w-md rounded-lg border-2 border-neutral-900 p-8 text-center">
            {shop.photoUrl ? (
              <img src={shop.photoUrl} alt="" className="mx-auto size-24 rounded-lg border border-neutral-300 object-cover" />
            ) : (
              <span className="mx-auto flex size-24 items-center justify-center rounded-lg border border-neutral-300 text-3xl font-bold text-neutral-800">
                {shop.name.charAt(0).toUpperCase()}
              </span>
            )}
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-neutral-900">{shop.name}</h2>
            {shop.area || shop.county ? (
              <p className="mt-1 text-sm text-neutral-600">{[shop.area, shop.county].filter(Boolean).join(', ')}</p>
            ) : null}
            <div className="mx-auto mt-6 w-fit bg-white p-3">
              {shopUrl ? <QRCode value={shopUrl} size={200} role="img" aria-label={`QR code for ${shop.name}'s shop`} /> : null}
            </div>
            <p className="mt-5 text-base font-semibold text-neutral-900">Scan to see our shop on Duuka</p>
            <p className="mt-3 font-mono text-3xl font-bold tracking-widest text-neutral-900">{shop.shopCode}</p>
            <p className="mt-1 text-xs uppercase tracking-wider text-neutral-500">Shop code</p>
            <p className="mt-6 text-sm text-neutral-600">Or call us: {shop.phone}</p>
          </div>
          <div className="no-print mx-auto max-w-md pt-4">
            <Button className="w-full gap-1.5" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> Print poster
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// Catalogue cards already sit inside the shop, so the per-card shop chip is
// redundant — attach the owner identity for the record, not for navigation.
// (The shop page has no use for coordinates; nulls keep the shape honest.)
function shopOwnerFrom(shop: ShopPageT['shop']): ListingShopOwner {
  return {
    id: shop.id,
    name: shop.name,
    profile: { businessName: shop.name, photoUrl: shop.photoUrl, area: shop.area, county: shop.county, lat: null, lng: null },
  }
}
