'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, SlidersHorizontal, Bookmark, X, ChevronLeft, ChevronRight, Hash, Heart, MapPin, Info, Phone } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { apiGet, apiPost } from '@/lib/client'
import type { ListingsPage, ShopLookupResponse, ListingDetail as ListingDetailT, Listing, ListingShopOwner as ListingShopOwnerT, ShopPage as ShopPageT } from '@/lib/client'
import { normalizeShopName, normalizeShopCode, telLink } from '@/lib/format'
import { haversineMeters, formatDistance } from '@/lib/geo'
import { CATEGORIES, COUNTIES, UNITS } from '@/lib/constants'
import { useAppStore, filtersToQuery, DEFAULT_FILTERS } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { unlove, useLovedIds } from '@/lib/loved'
import { useAddToBasket } from './basket-view'
import { ListingBlock, HeartButton } from './listing-card'
import { ListingGridSkeleton } from './skeletons'
import { EmptyState } from './empty-state'
import { MudaalaCurve } from './mudaala-curve'
import { PlaceholderTile } from './placeholder-tile'
import { copy } from '@/lib/copy'
import QRCode from 'react-qr-code'
import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

// Two shops can legally share a name - when they appear in the SAME feed,
// suffix each with their area so buyers tap the right one. The shop's own
// location wins (profile area → district), falling back to the listing's.
function computeShopLabels(items: ListingsPage['items'] | undefined): Map<string, string> {
  const labels = new Map<string, string>()
  if (!items) return labels

  const ownerIdsByName = new Map<string, Set<string>>()
  for (const listing of items) {
    const owner = listing.user
    const name = owner?.profile?.businessName?.trim() || owner?.name
    if (!owner || !name) continue
    const key = normalizeShopName(name)
    const ids = ownerIdsByName.get(key) ?? new Set<string>()
    ids.add(owner.id)
    ownerIdsByName.set(key, ids)
  }

  for (const listing of items) {
    const owner = listing.user
    const name = owner?.profile?.businessName?.trim() || owner?.name
    if (!owner || !name) continue
    const ids = ownerIdsByName.get(normalizeShopName(name))
    if (!ids || ids.size < 2) continue
    const area = owner.profile?.area || owner.profile?.county || listing.county
    labels.set(listing.id, area ? `${name} · ${area}` : name)
  }
  return labels
}

// "Near me" state machine: idle → locating → on. Denied/unsupported falls
// back to idle with a gentle hint - browsing works fully without location.
type NearMeStatus = 'idle' | 'locating' | 'on' | 'denied'

interface NearMeState {
  status: NearMeStatus
  lat: number | null
  lng: number | null
}

const NEARME_IDLE: NearMeState = { status: 'idle', lat: null, lng: null }

// Browse - the primary user task: find who buys/sells what, nearby.
export function ListingsBrowse() {
  const { filters, setFilters, resetFilters, navigate } = useAppStore()
  const addToBasket = useAddToBasket()
  const lovedIds = useLovedIds()
  const [lovedOnly, setLovedOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [searchInput, setSearchInput] = useState(filters.q)
  const [nearMe, setNearMe] = useState<NearMeState>(NEARME_IDLE)
  const nearOn = nearMe.status === 'on' && nearMe.lat !== null && nearMe.lng !== null

  // Debounced search input → store. Typing is a different intent than
  // shortlisting, so it also steps out of Loved mode.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== filters.q) {
        setFilters({ q: searchInput })
        setLovedOnly(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput, filters.q, setFilters])

  // Location is requested ONLY on this tap - never on app open, so nobody is
  // greeted by a permission wall. Denial keeps the whole feed usable.
  function toggleNearMe() {
    if (nearMe.status === 'locating') return
    if (nearOn) {
      setNearMe(NEARME_IDLE)
      if (filters.sort === 'nearest') setFilters({ sort: 'newest' })
      return
    }
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setNearMe({ status: 'denied', lat: null, lng: null })
      return
    }
    setNearMe({ status: 'locating', lat: null, lng: null })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNearMe({ status: 'on', lat: pos.coords.latitude, lng: pos.coords.longitude })
        setFilters({ sort: 'nearest' })
      },
      () => setNearMe({ status: 'denied', lat: null, lng: null }),
      // Low accuracy is a feature: network positioning is faster and kinder
      // to cheap-phone batteries than GPS, and market-level blur is all the
      // "nearest first" ordering needs.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  const query = filtersToQuery(filters)
  // A code-shaped query ("dk 2623", "MD-2623") is a till-number punch, not a
  // text search - canonicalize it and look the shop up directly. Anything
  // else keeps flowing through the normal listing search.
  const codeQuery = useMemo(() => (filters.q ? (normalizeShopCode(filters.q) ?? '') : ''), [filters.q])
  // Buyer coordinates ride on the URL (never persisted anywhere) and are part
  // of the cache key so toggling Near me refetches in the new order.
  const nearParams =
    nearOn && nearMe.lat !== null && nearMe.lng !== null ? `&lat=${nearMe.lat}&lng=${nearMe.lng}` : ''
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['listings', query, nearParams],
    queryFn: () => apiGet<ListingsPage>(`/api/listings?${query}${nearParams}`),
    placeholderData: (prev) => prev,
  })

  const codeLookup = useQuery({
    queryKey: ['shop-code', codeQuery],
    queryFn: () => apiGet<ShopLookupResponse>(`/api/shops/lookup?code=${encodeURIComponent(codeQuery)}`),
    enabled: codeQuery !== '',
    // A code either exists or it doesn't - the first honest answer is final.
    retry: false,
  })
  const codeShop = codeQuery !== '' && codeLookup.data ? codeLookup.data.shop : null

  const shopLabels = useMemo(() => computeShopLabels(data?.items), [data])

  // Distance chips - computed from the same blurred coords the server used,
  // so the label a buyer reads always matches the order they see.
  const distanceLabels = useMemo(() => {
    const map = new Map<string, string>()
    if (!data || nearMe.lat === null || nearMe.lng === null) return map
    for (const listing of data.items) {
      const spot = listing.user?.profile
      if (!spot || spot.lat === null || spot.lng === null) continue
      map.set(listing.id, formatDistance(haversineMeters({ lat: nearMe.lat, lng: nearMe.lng }, { lat: spot.lat, lng: spot.lng })))
    }
    return map
  }, [data, nearMe.lat, nearMe.lng])

  const activeFilterCount = [
    filters.type !== 'any' ? 1 : 0,
    filters.category !== 'any' ? 1 : 0,
    filters.county !== 'any' ? 1 : 0,
    filters.unit !== 'any' ? 1 : 0,
    filters.minPrice !== '' ? 1 : 0,
    filters.maxPrice !== '' ? 1 : 0,
  ].reduce<number>((a, b) => a + b, 0)

  return (
    <div className="space-y-3">
      {/* The front door - one green ribbon and the words that matter:
          what this place is and what to do first. No eyebrow labels, no
          slogan chips, no photo slot: the grey "coming soon" tile read as
          unfinished, so the ribbon stands on its words alone. */}
      <section aria-labelledby="browse-heading">
        <MudaalaCurve className="block h-6 w-full text-primary sm:h-9" />
        <div className="bg-primary text-primary-foreground">
          <div className="px-5 py-5 sm:px-8 sm:py-9">
            <h1 id="browse-heading" className="text-[22px] font-bold leading-tight tracking-tight sm:text-3xl">
              {copy.browse.heading}
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-primary-foreground/85 sm:text-sm">
              {/* One line on the phone keeps the whole ribbon ~150px tall;
                  the full sentence earns its space where there's room. */}
              <span className="sm:hidden">Shops post what they sell. You call them direct.</span>
              <span className="hidden sm:inline">{copy.browse.sub}</span>
            </p>
          </div>
        </div>
        <MudaalaCurve className="block h-6 w-full text-background sm:h-9" />
      </section>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            placeholder={copy.browse.searchPlaceholder}
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={copy.browse.searchLabel}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowFilters(true)}
          className="shrink-0 gap-1.5 px-3"
          aria-label={copy.browse.openFiltersAria}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="hidden sm:inline">{copy.browse.filters}</span>
          {activeFilterCount > 0 ? (
            <span className="flex size-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
      </div>

      {/* Category pills - the aisle signs of the market, one tap under the
          search bar. Same filter machinery as the FilterDialog dropdown
          (filters.category, 'any' = All), just always visible. Horizontally
          scrollable because eleven aisles don't fit a phone. */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-slim pb-0.5" role="group" aria-label="Filter by category">
        {([['any', 'All'], ...CATEGORIES.map((c) => [c.key, c.label])] as Array<[string, string]>).map(([key, label]) => {
          const active = filters.category === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilters({ category: key })}
              aria-pressed={active}
              className={cn(
                'press shrink-0 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Active filter chips + sort */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-slim pb-0.5">
        <Select value={filters.sort} onValueChange={(v) => setFilters({ sort: v as typeof filters.sort })}>
          <SelectTrigger size="sm" className="shrink-0 border-dashed text-muted-foreground" aria-label={copy.browse.sortLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{copy.browse.sortNewest}</SelectItem>
            {nearOn ? <SelectItem value="nearest">{copy.browse.sortNearest}</SelectItem> : null}
            <SelectItem value="price_asc">{copy.browse.sortPriceAsc}</SelectItem>
            <SelectItem value="price_desc">{copy.browse.sortPriceDesc}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant={nearOn ? 'default' : 'outline'}
          className="shrink-0 gap-1.5"
          onClick={toggleNearMe}
          disabled={nearMe.status === 'locating'}
          aria-pressed={nearOn}
        >
          <MapPin className="size-3.5" aria-hidden />
          {nearMe.status === 'locating' ? copy.browse.nearMeLocating : copy.browse.nearMe}
        </Button>
        <SaveSearchButton />
        {/* Loved - the buyer's shortlist. Same family as Near me: an explicit
            mode chip, count visible at a glance, pressed state unambiguous. */}
        <Button
          type="button"
          size="sm"
          variant={lovedOnly ? 'default' : 'outline'}
          className="shrink-0 gap-1.5"
          onClick={() => setLovedOnly((v) => !v)}
          aria-pressed={lovedOnly}
          aria-label={lovedOnly ? copy.browse.lovedAriaOn : copy.browse.lovedAriaOff(lovedIds.length)}
        >
          <Heart className={cn('size-3.5', lovedOnly && 'fill-current')} aria-hidden />
          {copy.browse.loved}
          {lovedIds.length > 0 ? (
            <span
              className={cn(
                'flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                lovedOnly ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary',
              )}
            >
              {lovedIds.length}
            </span>
          ) : null}
        </Button>
        {activeFilterCount > 0 ? (
          <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1 text-muted-foreground" onClick={resetFilters}>
            <X className="size-3.5" aria-hidden /> {copy.common.clearAll}
          </Button>
        ) : null}
      </div>

      {nearMe.status === 'denied' ? (
        <p
          role="status"
          className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Location is off. Allow it when the browser asks and shops closest to you come first. You can still browse everything.</span>
        </p>
      ) : null}

      <FilterDialog open={showFilters} onOpenChange={setShowFilters} />

      {/* Loved mode replaces the whole feed - the buyer asked for their
          shortlist, not the market. Explicit intent wins over every other
          mode (search, filters, code punch all wait their turn). */}
      {lovedOnly ? (
        <LovedShelf
          onOpen={(id) => navigate({ name: 'listing', id })}
          onOpenShop={(shopId) => navigate({ name: 'shop', id: shopId })}
          onAdd={addToBasket}
          onBrowse={() => setLovedOnly(false)}
        />
      ) : codeQuery !== '' ? (
        codeLookup.isLoading ? (
          <p className="text-sm text-muted-foreground" role="status">
            {copy.browse.codeFinding(codeQuery)}
          </p>
        ) : codeLookup.isError ? (
          <p
            role="status"
            className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {codeLookup.error instanceof Error
                ? codeLookup.error.message
                : copy.browse.codeError}
            </span>
          </p>
        ) : codeShop ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground" role="status">
              {copy.browse.codeShopLabel(codeQuery)}
            </p>
            <ShopCodeCard shop={codeShop} onOpen={() => navigate({ name: 'shop', id: codeShop.id })} />
          </div>
        ) : null
      ) : isLoading ? (
        <ListingGridSkeleton />
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'Could not load listings'} onRetry={() => refetch()} />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title={activeFilterCount > 0 || filters.q ? copy.browse.emptyFilteredTitle : copy.browse.emptyTitle}
          description={
            activeFilterCount > 0 || filters.q ? copy.browse.emptyFilteredSub : copy.browse.emptySub
          }
          action={
            activeFilterCount > 0 || filters.q ? (
              <Button variant="outline" onClick={resetFilters}>
                {copy.browse.clearSearchFilters}
              </Button>
            ) : (
              <Button onClick={() => navigate({ name: 'publish' })}>{copy.common.postAnAd}</Button>
            )
          }
        />
      ) : data ? (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start lg:gap-4">
          <div className={isFetching ? 'space-y-3 opacity-60 transition-opacity' : 'space-y-3'}>
            <p className="text-sm text-muted-foreground" role="status">
              {copy.browse.resultsFound(data.total, data.pageCount > 1 ? { page: data.page, pageCount: data.pageCount } : undefined)}
            </p>
            {/* Rows on the phone (small photo on the side), compact blocks in
                a grid on desktop - the same card flips at sm. */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
              {data.items.map((listing) => (
                <ListingBlock
                  key={listing.id}
                  listing={listing}
                  shopLabel={shopLabels.get(listing.id)}
                  distanceLabel={distanceLabels.get(listing.id)}
                  onOpen={(id) => navigate({ name: 'listing', id })}
                  onOpenShop={(shopId) => navigate({ name: 'shop', id: shopId })}
                  onAdd={addToBasket}
                />
              ))}
            </div>

            {data.pageCount > 1 ? (
              <Pagination page={data.page} pageCount={data.pageCount} onPage={(p) => setFilters({ page: p })} />
            ) : null}
          </div>

          <FeaturedShopPanel items={data.items} />
        </div>
      ) : null}
    </div>
  )
}

// The featured-shop rail - desktop's right column turns the current results
// into a doorway: one shop from whatever the buyer is looking at, its poster
// code, its phone line. It follows the search the way a shop window follows
// the street you're standing on. Hidden below lg - on the phone the feed IS
// the page. A rectangle, not a curve: it is a card, and the restraint rule
// keeps the signature off cards.
function FeaturedShopPanel({ items }: { items: ListingsPage['items'] }) {
  // Same hydration-safe origin pattern as shop-view: '' during SSR, the real
  // origin after mount (a page's origin never changes while it is open).
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  )
  // First result with a named shop wins the rail.
  const shopId = items.find((l) => l.user?.profile?.businessName)?.user?.id ?? null
  const shopQuery = useQuery({
    queryKey: ['featured-shop', shopId],
    enabled: Boolean(shopId),
    staleTime: 60_000,
    queryFn: () => apiGet<ShopPageT>(`/api/shops/${shopId}`),
  })
  const shop = shopQuery.data?.shop ?? null
  const shopUrl = useMemo(
    () => (origin && shop ? `${origin}/#/shop/${shop.id}` : ''),
    [origin, shop],
  )

  return (
    <aside className="hidden lg:block" aria-label="Featured shop from your results">
      {shop ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          {shop.photoUrl ? (
            <img src={shop.photoUrl} alt="" loading="lazy" className="h-32 w-full object-cover" />
          ) : (
            // PLACEHOLDER RULE - no shop photo yet: the neutral grey tile
            // with the shop's name, never a stock or generated image.
            <PlaceholderTile title={shop.name} label={copy.shop.coverTileAria(shop.name)} className="h-32 w-full" />
          )}
          <div className="p-4">
            <p className="text-xs font-medium text-muted-foreground">{copy.browse.featuredShop}</p>
            <h2 className="mt-1 font-display text-lg font-semibold leading-tight tracking-tight text-primary">
              {shop.name}
            </h2>
            {shop.area || shop.county ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{[shop.area, shop.county].filter(Boolean).join(', ')}</p>
            ) : null}
            <div className="mt-3 flex items-center gap-3">
              <div className="shrink-0 bg-white p-1.5">
                {shopUrl ? <QRCode value={shopUrl} size={64} role="img" aria-label={`QR code for ${shop.name}'s shop`} /> : null}
              </div>
              <div className="min-w-0">
                {shop.shopCode ? (
                  <p className="text-sm font-bold tracking-widest text-foreground tabular-nums">{shop.shopCode}</p>
                ) : null}
                <p className="text-[11px] leading-snug text-muted-foreground">{copy.browse.featuredCodeHint}</p>
              </div>
            </div>
            <a
              href={telLink(shop.phone)}
              className="press mt-3 flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Phone className="size-4" aria-hidden /> {copy.common.call}
            </a>
          </div>
        </div>
      ) : (
        <div className="h-64 animate-pulse rounded-lg border bg-muted/40" aria-hidden />
      )}
    </aside>
  )
}

// The Loved shelf - the shortlist, rendered as the same photo-first blocks
// as the feed. Every item is re-fetched from the public API when the shelf
// opens (the heart stores only an id), so what the buyer sees is what is
// really there right now: sold-out items say so instead of pretending.
function LovedShelf({
  onOpen,
  onOpenShop,
  onAdd,
  onBrowse,
}: {
  onOpen: (id: string) => void
  onOpenShop: (shopId: string) => void
  // Same shape ListingBlock hands every caller - blocks may come back from
  // the public detail endpoint, but the add contract stays the wide one.
  onAdd: (listing: Listing & { user?: ListingShopOwnerT }) => boolean | void
  onBrowse: () => void
}) {
  const lovedIds = useLovedIds()

  const itemsQuery = useQuery({
    queryKey: ['loved-items', lovedIds.join(',')],
    enabled: lovedIds.length > 0,
    retry: false,
    staleTime: 15_000,
    queryFn: async () => {
      const results = await Promise.all(
        lovedIds.map(async (id) => {
          try {
            const res = await apiGet<{ listing: ListingDetailT }>(`/api/listings/${id}`)
            return res.listing
          } catch (err) {
            // A 404 means the seller deleted it - a heart on a ghost is
            // clutter that also eats a shortlist slot, so it unloves itself.
            if (err instanceof Error && /404|does not exist|removed/i.test(err.message)) {
              unlove(id)
              return null
            }
            throw err
          }
        }),
      )
      return results.filter((l): l is ListingDetailT => l !== null)
    },
  })

  if (lovedIds.length === 0) {
    return (
      <EmptyState
        title={copy.browse.lovedEmptyTitle}
        description={copy.browse.lovedEmptySub}
        action={<Button onClick={onBrowse}>{copy.common.browseListings}</Button>}
      />
    )
  }

  if (itemsQuery.isLoading) {
    return <ListingGridSkeleton />
  }

  if (itemsQuery.isError || !itemsQuery.data) {
    return <ErrorState message="Could not load your loved items" onRetry={() => itemsQuery.refetch()} />
  }

  const items = itemsQuery.data
  const available = items.filter((l) => l.status === 'ACTIVE')
  const unavailable = items.filter((l) => l.status !== 'ACTIVE')

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground" role="status">
        {copy.browse.lovedShelfCount(items.length)}
      </p>

      {available.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          {available.map((listing) => (
            <ListingBlock
              key={listing.id}
              listing={listing}
              onOpen={onOpen}
              onOpenShop={onOpenShop}
              onAdd={onAdd}
            />
          ))}
        </div>
      ) : null}

      {/* Honest shelf: what expired or sold out is said out loud, with the
          one action that fixes it. */}
      {unavailable.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3">
          <p className="flex items-start gap-1.5 text-xs font-medium text-amber-800">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {unavailable.length === 1
              ? copy.browse.lovedUnavailable(1)
              : copy.browse.lovedUnavailable(unavailable.length)}
          </p>
          <ul className="mt-1.5 space-y-1">
            {unavailable.map((listing) => (
              <li key={listing.id} className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => onOpen(listing.id)}
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                >
                  {listing.title}
                </button>
                <HeartButton listingId={listing.id} title={listing.title} className="size-7 shrink-0 border-0 bg-transparent hover:bg-transparent" />
                <span className="shrink-0 text-xs text-amber-800">{copy.browse.lovedForget}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

// The result of punching a MD code into search - one shop, whole card taps
// through, same affordance as a listing card. The code chip repeats so the
// buyer can confirm the number they typed matches the shop they got.
function ShopCodeCard({ shop, onOpen }: { shop: ShopLookupResponse['shop']; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/40"
      aria-label={`Open shop: ${shop.name}`}
    >
      {shop.photoUrl ? (
        <img src={shop.photoUrl} alt="" className="size-14 shrink-0 rounded-lg border object-cover" />
      ) : (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-accent text-xl font-bold text-accent-foreground">
          {shop.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{shop.name}</span>
        <span className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          {[shop.area, shop.county].filter(Boolean).join(', ') || 'Shop on Mudaala'}
        </span>
        <span className="mt-1.5 inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/20">
          <Hash className="size-3" aria-hidden /> <span className="tracking-wide tabular-nums">{shop.shopCode}</span>
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}

function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  return (
    <nav className="flex items-center justify-center gap-2 pt-2" aria-label="Pagination">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="size-4" aria-hidden /> {copy.common.prev}
      </Button>
      <span className="px-2 text-sm text-muted-foreground tabular-nums">
        {page} / {pageCount}
      </span>
      <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        {copy.common.next} <ChevronRight className="size-4" aria-hidden />
      </Button>
    </nav>
  )
}

function FilterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { filters, setFilters } = useAppStore()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.browse.filterHeading}</DialogTitle>
          <DialogDescription>{copy.browse.filterSub}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{copy.browse.type}</Label>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Listing type">
              {(['any', 'OFFER', 'REQUEST'] as const).map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={filters.type === t ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilters({ type: t })}
                  aria-pressed={filters.type === t}
                >
                  {t === 'any' ? copy.common.all : t}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-category">{copy.browse.category}</Label>
            <Select value={filters.category} onValueChange={(v) => setFilters({ category: v })}>
              <SelectTrigger id="f-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="any">{copy.common.anyCategory}</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-county">{copy.browse.district}</Label>
            <Select value={filters.county} onValueChange={(v) => setFilters({ county: v })}>
              <SelectTrigger id="f-county">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="any">{copy.common.anyDistrict}</SelectItem>
                {COUNTIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="f-min">{copy.browse.minPrice}</Label>
              <Input
                id="f-min"
                type="number"
                inputMode="numeric"
                min={0}
                value={filters.minPrice}
                onChange={(e) => setFilters({ minPrice: e.target.value })}
                placeholder="Any"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-max">{copy.browse.maxPrice}</Label>
              <Input
                id="f-max"
                type="number"
                inputMode="numeric"
                min={0}
                value={filters.maxPrice}
                onChange={(e) => setFilters({ maxPrice: e.target.value })}
                placeholder="Any"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-unit">{copy.browse.priceUnit}</Label>
            <Select value={filters.unit} onValueChange={(v) => setFilters({ unit: v })}>
              <SelectTrigger id="f-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{copy.common.anyUnit}</SelectItem>
                {UNITS.map((u) => (
                  <SelectItem key={u.key} value={u.key}>
                    per {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFilters({ ...DEFAULT_FILTERS, q: filters.q, sort: filters.sort })
            }}
          >
            {copy.browse.reset}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {copy.browse.showResults}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SaveSearchButton() {
  const { filters } = useAppStore()
  const { user } = useSession()
  const setAuthOpen = useAppStore((s) => s.setAuthOpen)
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  function openDialog() {
    if (!user) {
      setAuthOpen(true)
      return
    }
    // Suggest an honest, readable name from current filters.
    const bits: string[] = []
    if (filters.type !== 'any') bits.push(filters.type === 'OFFER' ? 'Offers' : 'Requests')
    if (filters.category !== 'any') bits.push(CATEGORIES.find((c) => c.key === filters.category)?.label ?? filters.category)
    if (filters.county !== 'any') bits.push(filters.county)
    if (filters.q) bits.push(`"${filters.q}"`)
    setName(bits.join(' · ') || 'Everything')
    setOpen(true)
  }

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await apiPost('/api/saved-searches', {
        name: name.trim(),
        query: {
          q: filters.q || undefined,
          type: filters.type !== 'any' ? filters.type : undefined,
          category: filters.category !== 'any' ? filters.category : undefined,
          county: filters.county !== 'any' ? filters.county : undefined,
          unit: filters.unit !== 'any' ? filters.unit : undefined,
          minPrice: filters.minPrice !== '' ? Number(filters.minPrice) : undefined,
          maxPrice: filters.maxPrice !== '' ? Number(filters.maxPrice) : undefined,
        },
      })
      await queryClient.invalidateQueries({ queryKey: ['saved-searches'] })
      toast({ title: 'Search saved', description: 'You will get alerts when new listings match.' })
      setOpen(false)
    } catch (err) {
      toast({ title: 'Could not save search', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={openDialog}>
        <Bookmark className="size-3.5" aria-hidden /> {copy.browse.saveSearch}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{copy.browse.saveSearch}</DialogTitle>
            <DialogDescription>We will alert you when new listings match these filters.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ss-name">Search name</Label>
            <Input id="ss-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </div>
          <DialogFooter>
            <Button type="button" onClick={save} disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : copy.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
      <p className="text-sm font-medium">{message}</p>
      <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}
