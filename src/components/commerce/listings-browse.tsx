'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, SlidersHorizontal, Bookmark, X, ChevronLeft, ChevronRight, MapPin, Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { apiGet, apiPost } from '@/lib/client'
import type { ListingsPage } from '@/lib/client'
import { normalizeShopName } from '@/lib/format'
import { haversineMeters, formatDistance } from '@/lib/geo'
import { CATEGORIES, COUNTIES, UNITS } from '@/lib/constants'
import { useAppStore, filtersToQuery, DEFAULT_FILTERS } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { ListingCard } from './listing-card'
import { ListingListSkeleton } from './skeletons'
import { EmptyState } from './empty-state'

// Two shops can legally share a name — when they appear in the SAME feed,
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
// back to idle with a gentle hint — browsing works fully without location.
type NearMeStatus = 'idle' | 'locating' | 'on' | 'denied'

interface NearMeState {
  status: NearMeStatus
  lat: number | null
  lng: number | null
}

const NEARME_IDLE: NearMeState = { status: 'idle', lat: null, lng: null }

// Browse — the primary user task: find who buys/sells what, nearby.
export function ListingsBrowse() {
  const { filters, setFilters, resetFilters, navigate } = useAppStore()
  const [showFilters, setShowFilters] = useState(false)
  const [searchInput, setSearchInput] = useState(filters.q)
  const [nearMe, setNearMe] = useState<NearMeState>(NEARME_IDLE)
  const nearOn = nearMe.status === 'on' && nearMe.lat !== null && nearMe.lng !== null

  // Debounced search input → store
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== filters.q) setFilters({ q: searchInput })
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput, filters.q, setFilters])

  // Location is requested ONLY on this tap — never on app open, so nobody is
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
  // Buyer coordinates ride on the URL (never persisted anywhere) and are part
  // of the cache key so toggling Near me refetches in the new order.
  const nearParams =
    nearOn && nearMe.lat !== null && nearMe.lng !== null ? `&lat=${nearMe.lat}&lng=${nearMe.lng}` : ''
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['listings', query, nearParams],
    queryFn: () => apiGet<ListingsPage>(`/api/listings?${query}${nearParams}`),
    placeholderData: (prev) => prev,
  })

  const shopLabels = useMemo(() => computeShopLabels(data?.items), [data])

  // Distance chips — computed from the same blurred coords the server used,
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
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            placeholder="Search copper, flour, maize…"
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search listings"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowFilters(true)}
          className="shrink-0 gap-1.5 px-3"
          aria-label="Open filters"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 ? (
            <span className="flex size-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
      </div>

      {/* Active filter chips + sort */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-slim pb-0.5">
        <Select value={filters.sort} onValueChange={(v) => setFilters({ sort: v as typeof filters.sort })}>
          <SelectTrigger size="sm" className="shrink-0 border-dashed text-muted-foreground" aria-label="Sort results">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            {nearOn ? <SelectItem value="nearest">Nearest first</SelectItem> : null}
            <SelectItem value="price_asc">Price: low to high</SelectItem>
            <SelectItem value="price_desc">Price: high to low</SelectItem>
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
          {nearMe.status === 'locating' ? 'Finding you…' : nearOn ? 'Near me ✓' : 'Near me'}
        </Button>
        <SaveSearchButton />
        {activeFilterCount > 0 ? (
          <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1 text-muted-foreground" onClick={resetFilters}>
            <X className="size-3.5" aria-hidden /> Clear all
          </Button>
        ) : null}
      </div>

      {nearMe.status === 'denied' ? (
        <p
          role="status"
          className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Location is off — allow it when the browser asks and shops closest to you come first. You can still browse everything.</span>
        </p>
      ) : null}

      <FilterDialog open={showFilters} onOpenChange={setShowFilters} />

      {isLoading ? (
        <ListingListSkeleton />
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'Could not load listings'} onRetry={() => refetch()} />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No listings found"
          description={
            activeFilterCount > 0 || filters.q
              ? 'Nothing matches your current search and filters. Try fewer filters or a different word.'
              : 'There are no listings yet. Be the first to post what you sell or need.'
          }
          action={
            activeFilterCount > 0 || filters.q ? (
              <Button variant="outline" onClick={resetFilters}>
                Clear search & filters
              </Button>
            ) : (
              <Button onClick={() => navigate({ name: 'publish' })}>Post a listing</Button>
            )
          }
        />
      ) : data ? (
        <div className={isFetching ? 'space-y-3 opacity-60 transition-opacity' : 'space-y-3'}>
          <p className="text-sm text-muted-foreground" role="status">
            {data.total} {data.total === 1 ? 'listing' : 'listings'} found
            {data.pageCount > 1 ? ` · page ${data.page} of ${data.pageCount}` : ''}
          </p>
          {data.items.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              shopLabel={shopLabels.get(listing.id)}
              distanceLabel={distanceLabels.get(listing.id)}
              onOpen={(id) => navigate({ name: 'listing', id })}
              onOpenShop={(shopId) => navigate({ name: 'shop', id: shopId })}
            />
          ))}

          {data.pageCount > 1 ? (
            <Pagination page={data.page} pageCount={data.pageCount} onPage={(p) => setFilters({ page: p })} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  return (
    <nav className="flex items-center justify-center gap-2 pt-2" aria-label="Pagination">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="size-4" aria-hidden /> Prev
      </Button>
      <span className="px-2 text-sm text-muted-foreground">
        {page} / {pageCount}
      </span>
      <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        Next <ChevronRight className="size-4" aria-hidden />
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
          <DialogTitle>Filters</DialogTitle>
          <DialogDescription>Narrow results by type, category, location and price.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
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
                  {t === 'any' ? 'All' : t}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-category">Category</Label>
            <Select value={filters.category} onValueChange={(v) => setFilters({ category: v })}>
              <SelectTrigger id="f-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="any">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-county">District / Region</Label>
            <Select value={filters.county} onValueChange={(v) => setFilters({ county: v })}>
              <SelectTrigger id="f-county">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="any">All districts</SelectItem>
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
              <Label htmlFor="f-min">Min price</Label>
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
              <Label htmlFor="f-max">Max price</Label>
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
            <Label htmlFor="f-unit">Price unit</Label>
            <Select value={filters.unit} onValueChange={(v) => setFilters({ unit: v })}>
              <SelectTrigger id="f-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any unit</SelectItem>
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
            Reset
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Show results
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
        <Bookmark className="size-3.5" aria-hidden /> Save this search
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this search</DialogTitle>
            <DialogDescription>We will alert you when new listings match these filters.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ss-name">Search name</Label>
            <Input id="ss-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </div>
          <DialogFooter>
            <Button type="button" onClick={save} disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : 'Save search'}
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
