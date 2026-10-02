// Ad pages — the crawlable, shareable face of every listing.
//
// This is the page a WhatsApp link opens, the page Google indexes, the page
// a buyer forwards to a cousin in another district. The in-app detail view
// stays for signed-in sellers and fast in-app browsing; THIS page is built
// for the open web: real URL with keyword slug, full metadata, Product
// JSON-LD, WhatsApp share, honest seller identity, and the market-check
// chip no other Ugandan marketplace has.
//
// URL shape: /listing/{keywords}-{id}. The id is the identity; the keywords
// are presentation. Bare-id and stale-keyword URLs permanently redirect to
// the current canonical URL, so links never rot and search engines keep
// exactly one copy of every ad.

import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { cache } from 'react'
import { MapPin, Navigation, Package, Phone, ShieldCheck, Store } from 'lucide-react'
import { WhatsAppIcon } from '@/components/commerce/brand-icons'
import { StatusBadge, TypeBadge } from '@/components/commerce/badges'
import { CategoryGlyph, categoryTint } from '@/components/commerce/category-icons'
import { ShareAdRow } from '@/components/commerce/share-row'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { db } from '@/lib/db'
import { expireOverdueListings } from '@/lib/listings'
import { siteUrl } from '@/lib/site'
import {
  adPath,
  adSlug,
  formatPhonePretty,
  formatPrice,
  formatQuantity,
  formatDateTime,
  timeAgo,
  expiryLabel,
  telLink,
  whatsappLink,
  mapsSearchUrl,
} from '@/lib/format'
import { categoryLabel, countryDef, unitLabel, type ListingStatus, type ListingType } from '@/lib/constants'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string }> }

// One loader per request (React.cache dedupes the generateMetadata + page pair).
// Redirects and 404s are raised HERE so both callers behave identically.
const loadAd = cache(async (param: string) => {
  await expireOverdueListings()

  let listing = await db.listing.findUnique({
    where: { id: param },
    include: { user: { include: { profile: true } } },
  })
  if (!listing && param.includes('-')) {
    const tail = param.slice(param.lastIndexOf('-') + 1)
    if (tail) {
      listing = await db.listing.findUnique({
        where: { id: tail },
        include: { user: { include: { profile: true } } },
      })
    }
  }
  if (!listing) notFound()

  const canonicalTail = adPath(listing.title, listing.id).replace(/^\/listing\//, '')
  if (param !== canonicalTail) permanentRedirect(`/listing/${canonicalTail}`)

  return listing
})

function photosOf(photosJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(photosJson)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is string => typeof p === 'string').slice(0, 8)
  } catch {
    return []
  }
}

function absolutePhoto(photo: string): string {
  return photo.startsWith('http') ? photo : new URL(photo, siteUrl).toString()
}

function placeOf(listing: { area: string | null; county: string }): string {
  return listing.area ? `${listing.area}, ${listing.county}` : listing.county
}

function priceLabelOf(listing: { price: number | null; unit: string | null; currency: string }): string | null {
  if (listing.price === null) return null
  return formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)
}

function metaTitle(listing: { type: string; title: string; area: string | null; county: string; price: number | null; unit: string | null; currency: string }): string {
  const place = placeOf(listing)
  if (listing.type === 'REQUEST') return `Wanted: ${listing.title} in ${place} | Mudaala`
  const price = priceLabelOf(listing)
  return price ? `${listing.title} — ${price} in ${place} | Mudaala` : `${listing.title} in ${place} | Mudaala`
}

function metaDescription(listing: { description: string; area: string | null; county: string }): string {
  const base = listing.description.replace(/\s+/g, ' ').trim()
  const clipped = base.length > 140 ? `${base.slice(0, 140).replace(/\s+\S*$/, '')}…` : base
  return `${clipped} · ${placeOf(listing)}, Uganda · on Mudaala`
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const listing = await loadAd(slug)
  const tail = adPath(listing.title, listing.id).replace(/^\/listing\//, '')
  const photos = photosOf(listing.photos)

  return {
    title: metaTitle(listing),
    description: metaDescription(listing),
    alternates: { canonical: `/listing/${tail}` },
    // ACTIVE ads are indexable; anything else stays out of search but still
    // renders for whoever holds the link, with an honest status banner.
    robots:
      listing.status === 'ACTIVE'
        ? { index: true, follow: true }
        : { index: false, follow: true },
    openGraph: {
      title: metaTitle(listing),
      description: metaDescription(listing),
      url: `/listing/${tail}`,
      siteName: 'Mudaala',
      type: 'website',
      ...(photos.length > 0 ? { images: photos.slice(0, 3).map(absolutePhoto) } : {}),
    },
  }
}

// The market-check chip: the cron sweep records a daily median asking price
// per (category, unit, currency) whenever at least MIN_SAMPLE real listings
// back it. When this ad's exact market has data, the page shows it — the
// buyer walks into the WhatsApp chat knowing what the market says, not just
// what this seller asks. No data means no chip: absence stays honest.
const MARKET_WINDOW_DAYS = 7
async function marketContext(listing: { type: string; price: number | null; unit: string | null; category: string; currency: string }) {
  if (listing.type !== 'OFFER' || listing.price === null || !listing.unit) return null
  const since = new Date(Date.now() - (MARKET_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const points = await db.priceSnapshot.findMany({
    where: { category: listing.category, unit: listing.unit, currency: listing.currency, date: { gte: since } },
    orderBy: { date: 'asc' },
    select: { date: true, medianPrice: true, sampleSize: true },
  })
  const latest = points[points.length - 1]
  if (!latest || latest.sampleSize < 5) return null
  return { points, latest, unit: listing.unit, currency: listing.currency }
}

// Tiny axis-less trend line for the market chip. Pure SVG, no JS, scales to
// the series' own min/max — the shape is the message, not the grid.
function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * 68 + 2).toFixed(1)},${(18 - ((v - min) / span) * 14).toFixed(1)}`)
    .join(' ')
  return (
    <svg viewBox="0 0 72 20" className={className} aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default async function AdPage({ params }: Params) {
  const { slug } = await params
  const listing = await loadAd(slug)
  const canonicalUrl = `${siteUrl}/listing/${adSlug(listing.title)}-${listing.id}`

  const { passwordHash: _unused, ...owner } = listing.user
  const photos = photosOf(listing.photos)
  const quantity = formatQuantity(listing.quantity, listing.unit)
  const priceLabel = priceLabelOf(listing)
  const whatsapp = listing.contactWhatsapp ?? (listing.type === 'OFFER' ? listing.contactPhone : listing.contactWhatsapp)
  const shopDisplayName = owner.profile?.businessName?.trim() || owner.name
  const shopPhoto = owner.profile?.photoUrl ?? null
  const activeSince = owner.profile?.createdAt ?? owner.createdAt
  const directionsUrl = mapsSearchUrl({ area: listing.area, county: listing.county, country: countryDef(listing.country ?? 'UG').name })
  const market = await marketContext(listing)

  // Same fire-and-forget counter the API detail uses; crawlers included,
  // because a view is a view whoever asked.
  db.listing.update({ where: { id: listing.id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined)

  // Structured data: OFFERs get full Product + Offer markup so Google can
  // surface price and availability. REQUESTs get none — a "wanted" ad is
  // not a product for sale, and pretending otherwise would be dishonest
  // markup. Verification claims, ratings and fake reviews are omitted on
  // purpose: none of that exists yet.
  const jsonLd =
    listing.type === 'OFFER'
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: listing.title,
          description: listing.description,
          ...(photos.length > 0 ? { image: photos.map(absolutePhoto) } : {}),
          category: categoryLabel(listing.category),
          offers: {
            '@type': 'Offer',
            url: canonicalUrl,
            priceCurrency: listing.currency,
            ...(listing.price !== null ? { price: listing.price } : {}),
            availability:
              listing.status === 'ACTIVE'
                ? 'https://schema.org/InStock'
                : listing.status === 'FULFILLED'
                  ? 'https://schema.org/SoldOut'
                  : 'https://schema.org/OutOfStock',
            seller: { '@type': 'Organization', name: shopDisplayName },
          },
        }
      : null

  return (
    <div className="mx-auto min-h-dvh max-w-2xl bg-background">
      <header className="flex items-center justify-between border-b bg-card px-4 py-3">
        <a href="/" className="font-display text-xl font-semibold tracking-tight text-primary">
          Mudaala
        </a>
        <a
          href={`/#/listing/${listing.id}`}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Open in the app
        </a>
      </header>

      <main className="space-y-4 px-4 py-4">
        {/* Photos — scroll-snap gallery, server-rendered, no JS needed */}
        {photos.length > 0 ? (
          <div className="relative">
            <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto scrollbar-slim p-1" aria-label={`Photos of ${listing.title}`}>
              {photos.map((photo, i) => (
                <div key={photo} className="relative h-56 w-[88%] shrink-0 snap-center overflow-hidden rounded-md border sm:h-80">
                  <img
                    src={photo}
                    alt={`${listing.title} — photo ${i + 1} of ${photos.length}`}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    className="size-full object-cover"
                  />
                </div>
              ))}
            </div>
            {photos.length > 1 ? (
              <span className="absolute right-4 top-4 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                {photos.length} photos · swipe
              </span>
            ) : null}
          </div>
        ) : (
          <div className={cn('flex h-48 w-full flex-col items-center justify-center gap-2 rounded-lg border text-center', categoryTint(listing.category))}>
            <CategoryGlyph category={listing.category} className="[&_svg]:size-10" />
            <span className="px-4 text-sm font-medium">{categoryLabel(listing.category)}</span>
          </div>
        )}

        <article className="rounded-lg border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={listing.type as ListingType} />
            <StatusBadge status={listing.status as ListingStatus} />
            <span className="text-xs text-muted-foreground">{categoryLabel(listing.category)}</span>
          </div>

          <h1 className="mt-2.5 font-display text-2xl font-semibold tracking-tight">{listing.title}</h1>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-2xl font-bold text-primary">{priceLabel ?? 'Ask seller'}</p>
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

          {market ? (
            <div
              className="mt-3 flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2"
              title={`Median asking price across active Mudaala offers in ${categoryLabel(listing.category)} per ${unitLabel(market.unit)} — every number is backed by at least 5 real listings. No estimates, no guesses.`}
            >
              <Sparkline values={market.points.map((p) => p.medianPrice)} className="h-5 w-[72px] shrink-0 text-emerald-700" />
              <p className="text-[13px] leading-snug text-emerald-900">
                <span className="font-semibold">Market check:</span> median {formatPrice(market.latest.medianPrice, null, market.currency)} /{' '}
                {unitLabel(market.unit)} across {market.latest.sampleSize} live listings
              </p>
            </div>
          ) : null}

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
              <dd className="font-medium">{placeOf(listing)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">Posted:</dt>
              <dd className="font-medium">{formatDateTime(listing.publishedAt)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">Updated:</dt>
              <dd className="font-medium">{timeAgo(listing.refreshedAt)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">Availability:</dt>
              <dd className="font-medium">{expiryLabel(listing.expiresAt)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">Views:</dt>
              <dd className="font-medium">{listing.viewCount}</dd>
            </div>
          </dl>

          <Separator className="my-4" />

          <h2 className="text-sm font-semibold">Description</h2>
          <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{listing.description}</p>
        </article>

        {/* The seller — real account facts only: named shop, real code, real
            start date. No badges, no ratings, nothing Mudaala cannot prove. */}
        <section className="rounded-lg border bg-card p-4 sm:p-5" aria-label="About the seller">
          <h2 className="text-sm font-semibold">{listing.type === 'OFFER' ? 'About the seller' : 'Who is buying'}</h2>
          <div className="mt-2 flex items-center gap-3">
            {shopPhoto ? (
              <img src={shopPhoto} alt="" className="size-11 shrink-0 rounded-full border object-cover" />
            ) : (
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                {shopDisplayName.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate font-display text-lg font-semibold">
                <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {shopDisplayName}
              </p>
              <p className="text-sm text-muted-foreground">
                Active since {new Date(activeSince).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
                {owner.profile?.area || owner.profile?.county
                  ? ` · ${[owner.profile?.area, owner.profile?.county].filter(Boolean).join(', ')}`
                  : ''}
              </p>
            </div>
          </div>
          {owner.profile?.shopCode ? (
            <p className="mt-2.5 text-sm text-muted-foreground">
              Shop code{' '}
              <span className="rounded border bg-secondary px-1.5 py-0.5 font-mono text-[13px] font-semibold text-foreground">
                {owner.profile.shopCode}
              </span>{' '}
              — type it into Mudaala search to find this shop again.
            </p>
          ) : null}
          {owner.profile?.description ? <p className="mt-2 text-sm text-muted-foreground">{owner.profile.description}</p> : null}
          {owner.profile?.hours ? <p className="mt-1 text-sm text-muted-foreground">Hours: {owner.profile.hours}</p> : null}
          <Button asChild variant="outline" className="press mt-3 w-full gap-1.5">
            <a href={`/#/shop/${owner.id}`} aria-label={`Visit ${shopDisplayName} in the app`}>
              <Store className="size-4" aria-hidden /> Visit {shopDisplayName} in the app
            </a>
          </Button>
        </section>

        {/* Contact — owner-provided details only, same as everywhere in the
            app. Plus the one-line safety habit every ad repeats. */}
        <section className="rounded-lg border bg-card p-4 sm:p-5" aria-label="Contact">
          <h2 className="text-sm font-semibold">Contact {shopDisplayName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{formatPhonePretty(listing.contactPhone)}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button asChild className="press h-11 flex-1 text-[15px]">
              <a href={telLink(listing.contactPhone)} aria-label={`Call ${formatPhonePretty(listing.contactPhone)}`}>
                <Phone className="size-4" aria-hidden /> Call seller
              </a>
            </Button>
            {whatsapp ? (
              <Button
                asChild
                variant="outline"
                className="press h-11 flex-1 border-emerald-600 text-[15px] text-emerald-800 hover:bg-emerald-50"
              >
                <a href={whatsappLink(whatsapp, listing.title, listing.type as ListingType)} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="size-4" aria-hidden /> WhatsApp
                </a>
              </Button>
            ) : null}
          </div>
          <Button asChild variant="outline" className="press mt-2 h-11 w-full gap-1.5 text-[15px]">
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer" aria-label={`Get directions to ${placeOf(listing)}`}>
              <Navigation className="size-4" aria-hidden /> Get directions
              <span className="text-xs font-normal text-muted-foreground">(Google Maps — for pickup)</span>
            </a>
          </Button>
          <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-snug text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
            Meet in a public place and check the goods before you pay.
          </p>
        </section>

        <section className="rounded-lg border bg-card p-4 sm:p-5" aria-label="Share this ad">
          <ShareAdRow title={listing.title} url={canonicalUrl} priceLabel={priceLabel} />
        </section>
      </main>

      <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground">
        <p>
          Mudaala — trade locally, discover more.{' '}
          <a href="/#/browse" className="font-medium text-primary underline-offset-2 hover:underline">
            Browse the market
          </a>
        </p>
      </footer>

      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /> : null}
    </div>
  )
}
