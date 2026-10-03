'use client'

// Home - the signed-in dashboard. Public Browse is untouched; this view is
// the seller/buyer's own workbench: their numbers (all computed from real
// records), the freshest offers around their own location, their saved
// searches, a freshness nudge for listings going stale, and the market's
// price trends where enough real listings exist to speak.
//
// Style: cream paper, forest green. One sans everywhere; rectangles stay
// rectangles - this is a functional surface, no curves.

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownUp,
  Bell,
  Bookmark,
  CalendarClock,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Tag,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Line, LineChart, XAxis, YAxis } from 'recharts'
import { apiGet, apiPost, shopName, type HomeData, type ListingsPage, type PriceTrendsData } from '@/lib/client'
import { formatPrice, formatQuantity, timeAgo, whatsappLink, telLink } from '@/lib/format'
import { WhatsAppIcon } from '@/components/commerce/brand-icons'
import { haversineMeters, formatDistance } from '@/lib/geo'
import { CATEGORIES, COUNTRIES } from '@/lib/constants'
import { useAppStore, type BrowseFilters } from '@/lib/store'
import type { ListingQuery } from '@/lib/validation'
import { useSession } from '@/hooks/use-session'
import { useToast } from '@/hooks/use-toast'
import { PlaceholderTile } from './placeholder-tile'
import { cn } from '@/lib/utils'
import { copy } from '@/lib/copy'

// The chosen "near" location persists between visits; the profile default is
// what the server suggests when nothing is stored.
const LOCATION_KEY = 'mudaala.home.location.v1'

function readStoredCounty(): string | null | undefined {
  try {
    const raw = localStorage.getItem(LOCATION_KEY)
    if (raw === null) return undefined // never chosen
    const parsed = JSON.parse(raw) as { county?: string | null }
    return parsed.county ?? null
  } catch {
    return undefined
  }
}

function storeCounty(county: string | null): void {
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify({ county }))
  } catch {
    // private-mode storage - the choice just does not persist
  }
}

function dayGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return copy.home.greetingMorning
  if (hour < 17) return copy.home.greetingAfternoon
  return copy.home.greetingEvening
}

// Short axis label "25 Sep" from an ISO date string.
function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en', { day: 'numeric', month: 'short' })
}

// ---------------------------------------------------------------- shell

export function HomeDashboard() {
  const { user, isLoading: sessionLoading } = useSession()
  const { setAuthOpen } = useAppStore()

  if (sessionLoading) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-lg" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-primary">{copy.home.welcomeTitle}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.home.welcomeSub}</p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button onClick={() => setAuthOpen(true)}>{copy.home.signIn}</Button>
          <Button variant="outline" onClick={() => useAppStore.getState().navigate({ name: 'browse' })}>
            <Search className="size-4" aria-hidden />
            {copy.home.browseMarket}
          </Button>
        </div>
      </div>
    )
  }

  return <SignedInHome />
}

// ---------------------------------------------------------------- signed in

function SignedInHome() {
  const { navigate } = useAppStore()
  const queryClient = useQueryClient()

  const homeQuery = useQuery({
    queryKey: ['home'],
    queryFn: () => apiGet<HomeData>('/api/home'),
    staleTime: 60_000,
  })
  const data = homeQuery.data

  // Mark the visit ONCE per mount, after data is on screen - the "new
  // matches" number must never zero itself while the user is looking at it.
  const visitMarked = useRef(false)
  const visitMutation = useMutation({
    mutationFn: () => apiPost<{ ok: boolean }>('/api/home/visit'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'badge'] }),
  })
  useEffect(() => {
    if (homeQuery.isSuccess && !visitMarked.current) {
      visitMarked.current = true
      visitMutation.mutate()
    }
  }, [homeQuery.isSuccess])

  const renewMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ listing: { id: string } }>(`/api/listings/${id}/refresh`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['home'] }),
  })

  if (homeQuery.isError) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">{copy.home.loadError}</div>
    )
  }
  if (!data) return null

  const stats = [
    {
      label: copy.home.statSavedSearches,
      value: String(data.stats.savedSearches),
      icon: <Bookmark aria-hidden />,
      go: { name: 'saved' } as const,
    },
    {
      label: copy.home.statActiveListings,
      value: String(data.stats.activeListings),
      icon: <Tag aria-hidden />,
      go: { name: 'my-listings' } as const,
    },
    {
      label: copy.home.statNewMatches,
      value: String(data.stats.newMatches),
      icon: <Bell aria-hidden />,
      go: { name: 'notifications' } as const,
    },
    {
      label: copy.home.statLastUpdated,
      value: data.stats.lastUpdatedAt ? timeAgo(data.stats.lastUpdatedAt) : copy.home.statNotYet,
      icon: <CalendarClock aria-hidden />,
      go: { name: 'my-listings' } as const,
    },
  ]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {dayGreeting()}, {data.user.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy.home.dashSub}</p>
      </header>

      {data.staleListings.length > 0 ? (
        <FreshnessTip
          stale={data.staleListings}
          staleCount={data.staleCount}
          onRenew={(id) => renewMutation.mutate(id)}
          renewingId={renewMutation.isPending ? renewMutation.variables : undefined}
        />
      ) : null}

      <section aria-label="Your numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => navigate(stat.go)}
            className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-input/80 hover:bg-accent/40"
          >
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4">
              {stat.icon}
            </span>
            <span className="mt-2 block text-2xl font-bold leading-none tracking-tight tabular-nums">
              {stat.value}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{stat.label}</span>
          </button>
        ))}
      </section>

      <BestOffers location={data.location} />

      <MarketMoversCard />

      <section className="grid gap-4 lg:grid-cols-5">
        <SavedSearchesCard
          className="lg:col-span-2"
          searches={data.savedSearches}
          total={data.stats.savedSearches}
        />
        <PriceTrendsCard className="lg:col-span-3" />
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- freshness

function FreshnessTip({
  stale,
  staleCount,
  onRenew,
  renewingId,
}: {
  stale: HomeData['staleListings']
  staleCount: number
  onRenew: (id: string) => void
  renewingId?: string
}) {
  const { toast } = useToast()
  return (
    <Card className="border-amber-300/70 bg-amber-50/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCw className="size-4 text-amber-700" aria-hidden />
          {copy.home.freshnessTitle}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{copy.home.freshnessBody(staleCount)}</p>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {stale.map((listing) => (
          <div
            key={listing.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{listing.title}</p>
              <p className="text-xs text-muted-foreground">{copy.home.freshnessItemAge(listing.ageDays)}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={renewingId !== undefined}
              onClick={() => {
                onRenew(listing.id)
                toast({ title: copy.home.renewing })
              }}
            >
              <RefreshCw className={cn('size-3.5', renewingId === listing.id && 'animate-spin')} aria-hidden />
              {copy.home.renew}
            </Button>
          </div>
        ))}
        {staleCount > stale.length ? (
          <p className="text-xs text-muted-foreground">{copy.home.moreInListings(staleCount - stale.length)}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- best offers

interface ActiveLocation {
  county: string | null // null = anywhere
  isDefault: boolean
}

function BestOffers({ location }: { location: HomeData['location'] }) {
  const { navigate } = useAppStore()
  const [category, setCategory] = useState<string>('any')
  const [pickOpen, setPickOpen] = useState(false)

  // Default: the user's own shop area ("Kisenyi, Kampala"). A stored choice
  // wins; undefined means they never chose, so fall back to the server's
  // suggestion (profile area, then their most recent listing's district).
  const storedCounty = readStoredCounty()
  const [chosen, setChosen] = useState<ActiveLocation>(() => ({
    county: storedCounty !== undefined ? storedCounty : location.county,
    isDefault: storedCounty === undefined,
  }))

  // The profile's blurred spot orders "nearest" and powers distance labels -
  // but only while the user is still looking at their own default area.
  const refSpot =
    chosen.county === location.county && location.lat !== null && location.lng !== null
      ? { lat: location.lat, lng: location.lng }
      : null

  const params = new URLSearchParams({ type: 'OFFER', page: '1', pageSize: '8' })
  if (category !== 'any') params.set('category', category)
  if (chosen.county) params.set('county', chosen.county)
  if (refSpot) {
    params.set('sort', 'nearest')
    params.set('lat', String(refSpot.lat))
    params.set('lng', String(refSpot.lng))
  }
  const offersQuery = useQuery({
    queryKey: ['home-offers', params.toString()],
    queryFn: () => apiGet<ListingsPage>(`/api/listings?${params.toString()}`),
    placeholderData: (prev) => prev,
  })

  const locationLabel = chosen.county
    ? chosen.isDefault && location.area
      ? `${location.area}, ${location.county}`
      : chosen.county
    : copy.common.anywhere

  return (
    <section aria-label="Best offers near you" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">{copy.home.bestOffers}</h2>
        <button
          type="button"
          onClick={() => setPickOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-accent"
        >
          <MapPin className="size-3.5 text-primary" aria-hidden />
          {locationLabel}
          <span className="text-muted-foreground">· {copy.home.change}</span>
        </button>
      </div>

      {/* Category chips - the same aisle-sign row as Browse. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter by category">
        {[{ key: 'any', label: copy.common.all }, ...CATEGORIES.map((c) => ({ key: c.key, label: c.label }))].map(
          (chip) => {
            const active = category === chip.key
            return (
              <button
                key={chip.key}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(chip.key)}
                className={cn(
                  'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card text-foreground/80 hover:bg-accent',
                )}
              >
                {chip.label}
              </button>
            )
          },
        )}
      </div>

      {offersQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : (offersQuery.data?.items.length ?? 0) === 0 ? (
        <div className="rounded-lg border bg-card px-4 py-10 text-center">
          <p className="text-sm font-medium">{copy.home.noOffersTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{copy.home.noOffersIn(chosen.county)}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate({ name: 'browse' })}>
            {copy.common.browseEverything}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {offersQuery.data!.items.map((listing) => (
            <OfferRow key={listing.id} listing={listing} refSpot={refSpot} onOpen={(id) => navigate({ name: 'listing', id })} />
          ))}
        </div>
      )}

      <LocationPickerDialog
        key={pickOpen ? 'open' : 'closed'}
        open={pickOpen}
        onOpenChange={setPickOpen}
        current={chosen.county}
        defaultCounty={location.county}
        onPick={(county) => {
          setChosen({ county, isDefault: county === location.county })
          storeCounty(county)
          setPickOpen(false)
        }}
        onReset={() => {
          // Back to the shop-area default, and forget the stored override.
          try {
            localStorage.removeItem(LOCATION_KEY)
          } catch {
            // ignore
          }
          setChosen({ county: location.county, isDefault: true })
          setPickOpen(false)
        }}
      />
    </section>
  )
}

function OfferRow({
  listing,
  refSpot,
  onOpen,
}: {
  listing: ListingsPage['items'][number]
  refSpot: { lat: number; lng: number } | null
  onOpen: (id: string) => void
}) {
  const quantity = formatQuantity(listing.quantity, listing.unit)
  const shopDisplayName = shopName(listing.user ?? { name: '', profile: null })
  const spot = listing.user?.profile?.lat !== null && listing.user?.profile?.lat !== undefined &&
    listing.user?.profile?.lng !== null && listing.user?.profile?.lng !== undefined
    ? { lat: listing.user.profile.lat, lng: listing.user.profile.lng }
    : null
  const distance = refSpot && spot ? formatDistance(haversineMeters(refSpot, spot)) : null
  const place = [listing.area ?? listing.user?.profile?.area, listing.county].filter(Boolean).join(', ')
  const whatsappNumber = listing.contactWhatsapp ?? (listing.type === 'OFFER' ? listing.contactPhone : null)
  const photo = listing.photos[0]

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <button
        type="button"
        onClick={() => onOpen(listing.id)}
        className="relative size-16 shrink-0 overflow-hidden rounded-md border bg-secondary/30 sm:size-20"
        aria-label={`Open ${listing.title}`}
      >
        {photo ? (
          <img src={photo} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          // PLACEHOLDER RULE - flat grey tile with the category name and a
          // small camera icon, never a stock or illustrated stand-in.
          <PlaceholderTile category={listing.category} className="size-full" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{shopDisplayName}</p>
        <button
          type="button"
          onClick={() => onOpen(listing.id)}
          className="block w-full truncate text-left text-sm font-bold hover:underline"
        >
          {listing.title}
        </button>
        <p className="truncate text-sm font-bold text-primary tabular-nums">{formatPrice(listing.price, listing.unit, listing.currency)}</p>
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          {[quantity, distance, place, copy.home.updated(timeAgo(listing.refreshedAt))].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center">
        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs">
          <a href={telLink(listing.contactPhone)} aria-label={`Call ${shopDisplayName}`}>
            <Phone className="size-3.5" aria-hidden />
            {copy.common.call}
          </a>
        </Button>
        {whatsappNumber ? (
          <Button asChild size="sm" className="h-8 gap-1.5 px-2.5 text-xs">
            <a
              href={whatsappLink(whatsappNumber, listing.title, listing.type)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`WhatsApp ${shopDisplayName}`}
            >
              <WhatsAppIcon className="size-3.5" aria-hidden />
              {copy.common.whatsapp}
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function LocationPickerDialog({
  open,
  onOpenChange,
  current,
  defaultCounty,
  onPick,
  onReset,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: string | null
  defaultCounty: string | null
  onPick: (county: string | null) => void
  onReset: () => void
}) {
  // Mounted only while open (see BestOffers), so the select starts from the
  // current choice on every open - no state-sync effect needed.
  const [value, setValue] = useState<string>(current ?? 'any')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.home.chooseLocation}</DialogTitle>
          <DialogDescription>{copy.home.chooseLocationSub}</DialogDescription>
        </DialogHeader>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger aria-label="Location">
            <SelectValue placeholder={copy.home.pickDistrict} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="any">{copy.common.anywhere}</SelectItem>
            {defaultCounty ? (
              <SelectItem value={defaultCounty}>
                {copy.home.myShopArea(defaultCounty)}
              </SelectItem>
            ) : null}
            {COUNTRIES.map((country) => (
              <SelectGroup key={country.key}>
                <SelectLabel>{country.name}</SelectLabel>
                {country.locations
                  .filter((loc) => loc !== 'Other' && loc !== defaultCounty)
                  .map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={onReset}>
            {copy.home.useMyShopArea}
          </Button>
          <Button size="sm" onClick={() => onPick(value === 'any' ? null : value)}>
            {copy.home.showOffers}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- saved searches

function SavedSearchesCard({
  className,
  searches,
  total,
}: {
  className?: string
  searches: HomeData['savedSearches']
  total: number
}) {
  const { navigate, applyQuery } = useAppStore()
  const { toast } = useToast()

  function apply(search: HomeData['savedSearches'][number]) {
    try {
      const q = JSON.parse(search.queryJson) as Partial<ListingQuery>
      const patch: Partial<BrowseFilters> = {
        q: q.q ?? '',
        type: (q.type ?? 'any') as BrowseFilters['type'],
        category: q.category ?? 'any',
        county: q.county ?? 'any',
        unit: q.unit ?? 'any',
        minPrice: q.minPrice !== undefined ? String(q.minPrice) : '',
        maxPrice: q.maxPrice !== undefined ? String(q.maxPrice) : '',
        sort: 'newest',
        page: 1,
      }
      applyQuery(patch)
      navigate({ name: 'browse' })
    } catch {
      toast({ title: copy.home.savedCorrupt, variant: 'destructive' })
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Bookmark className="size-4 text-primary" aria-hidden />
            {copy.home.savedSearchesTitle}
          </span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{copy.home.savedSearchesTotal(total)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {searches.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-6 text-center">
            <p className="text-sm font-medium">{copy.home.noSavedTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">{copy.home.noSavedSub}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate({ name: 'browse' })}>
              {copy.common.browseListings}
            </Button>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {searches.map((search) => (
              <li key={search.id}>
                <button
                  type="button"
                  onClick={() => apply(search)}
                  className="w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{search.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{copy.home.matches(search.lastMatchCount)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {total > searches.length ? (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => navigate({ name: 'saved' })}>
            {copy.home.viewAllSaved(total)}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- price trends

const TREND_COLORS = ['#18583B', '#4A8A68', '#B8860B'] as const

// "Moving this week" - the market-wide companion to the personal trends
// chart: the categories whose recorded median moved most, either direction.
// Same query key as PriceTrendsCard, so one fetch serves both cards. A quiet
// market renders no card at all - an empty list titled "moving" would be a
// promise the data cannot keep.
function MarketMoversCard() {
  const { navigate, setFilters } = useAppStore()
  const trendsQuery = useQuery({
    queryKey: ['price-trends'],
    queryFn: () => apiGet<PriceTrendsData>('/api/price-trends'),
    staleTime: 5 * 60_000,
  })

  if (trendsQuery.isLoading) return null
  if (trendsQuery.isError || !trendsQuery.data || trendsQuery.data.movers.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowDownUp className="size-4 text-primary" aria-hidden />
          {copy.home.moversTitle}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{copy.home.moversSub}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y">
          {trendsQuery.data.movers.map((m) => (
            <button
              key={`${m.category}|${m.unit}|${m.currency}`}
              type="button"
              onClick={() => {
                setFilters({ category: m.category })
                navigate({ name: 'browse' })
              }}
              className="press -mx-1 flex w-full items-center gap-3 rounded-md px-1 py-2.5 text-left hover:bg-secondary/50"
              aria-label={copy.home.moversRowAria(
                m.categoryLabel,
                m.unit,
                formatPrice(m.lastMedian, null, m.currency),
                Math.abs(m.pct),
                m.sampleSize,
                m.direction === 'down' ? copy.home.moverDownWord : copy.home.moverUpWord,
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{m.categoryLabel}</span>
                <span className="block text-[11px] text-muted-foreground">{copy.home.moversPerUnit(m.unit)}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPrice(m.lastMedian, null, m.currency)}</span>
              <span
                className={cn(
                  'flex w-16 shrink-0 items-center justify-end gap-1 text-xs font-semibold tabular-nums',
                  m.direction === 'down' ? 'text-emerald-700' : 'text-amber-700',
                )}
              >
                {m.direction === 'down' ? (
                  <TrendingDown className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <TrendingUp className="size-3.5 shrink-0" aria-hidden />
                )}
                {Math.abs(m.pct)}%
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{copy.home.moversSource(trendsQuery.data.minSample)}</p>
      </CardContent>
    </Card>
  )
}

function PriceTrendsCard({ className }: { className?: string }) {
  const trendsQuery = useQuery({
    queryKey: ['price-trends'],
    queryFn: () => apiGet<PriceTrendsData>('/api/price-trends'),
    staleTime: 5 * 60_000,
  })

  if (trendsQuery.isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="pt-0">
          <Skeleton className="h-48 w-full rounded-md" />
        </CardContent>
      </Card>
    )
  }
  if (trendsQuery.isError || !trendsQuery.data) return null

  const series = trendsQuery.data.series
  const chartable = series.filter((s) => s.points.length >= 2)

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Tag className="size-4 text-primary" aria-hidden />
          {copy.home.trendsTitle}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{copy.home.trendsSub}</p>
      </CardHeader>
      <CardContent className="pt-0">
        {chartable.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-10 text-center">
            <p className="text-base font-semibold">{copy.home.trendsNotEnoughTitle}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {copy.home.trendsNotEnoughSub(trendsQuery.data.minSample)}
            </p>
          </div>
        ) : (
          <>
            <ChartContainer config={buildChartConfig(chartable)} className="h-48 w-full sm:h-56">
              <LineChart data={buildChartRows(chartable)} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={6} fontSize={11} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  fontSize={11}
                  tickFormatter={(v: number) => compactNumber(v)}
                />
                <ChartTooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      formatter={(value) => <span>{Number(value).toLocaleString('en')}</span>}
                    />
                  }
                />
                {chartable.map((s, i) => (
                  <Line
                    key={s.category}
                    type="monotone"
                    dataKey={s.category}
                    stroke={TREND_COLORS[i % TREND_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {trendsQuery.data.source}
              {series.length > chartable.length ? copy.home.trendsMoreData(series.length - chartable.length) : ''}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function buildChartConfig(series: { category: string; categoryLabel: string; unit: string; currency: string }[]): ChartConfig {
  const config: ChartConfig = {}
  series.forEach((s, i) => {
    config[s.category] = {
      label: `${s.categoryLabel} · ${s.currency}/${s.unit}`,
      color: TREND_COLORS[i % TREND_COLORS.length],
    }
  })
  return config
}

// One row per day; a series with no snapshot that day leaves the cell null
// and the line simply bridges it (connectNulls) - no invented numbers.
function buildChartRows(series: { category: string; points: { date: string; medianPrice: number }[] }[]) {
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days.map((date) => {
    const row: Record<string, string | number | null> = { date: shortDay(date) }
    for (const s of series) {
      const point = s.points.find((p) => p.date === date)
      row[s.category] = point ? point.medianPrice : null
    }
    return row
  })
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`
  return String(value)
}
