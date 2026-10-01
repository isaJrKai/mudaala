import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { MapPin, Package, Phone, ShieldCheck, Store } from 'lucide-react'
import { WhatsAppIcon } from '@/components/commerce/brand-icons'
import { ViewPing, ShareRow } from '@/components/commerce/share-buttons'
import { TypeBadge } from '@/components/commerce/badges'
import { db } from '@/lib/db'
import { expireOverdueListings } from '@/lib/listings'
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
  listingSlug,
} from '@/lib/format'
import { categoryLabel, unitLabel, countryDef } from '@/lib/constants'

// Public ad page — the URL a buyer shares on WhatsApp and Google indexes.
// Deliberately OUTSIDE the app shell: a shared link lands on a clean page
// that loads fast on a data bundle, not inside someone else's session.

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string }> }

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

// The slug is "<title words>-<id>"; the id after the LAST hyphen is the only
// identity that resolves. A bare id (no hyphen) also works, then redirects.
function idFromSlug(slug: string): string {
  const last = slug.lastIndexOf('-')
  return last === -1 ? slug : slug.slice(last + 1)
}

function parsePhotos(photos: string): string[] {
  try {
    const parsed: unknown = JSON.parse(photos)
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

async function loadListing(id: string) {
  await expireOverdueListings()
  return db.listing.findUnique({
    where: { id },
    include: { user: { include: { profile: true } } },
  })
}

function metaTitle(type: string, title: string, county: string): string {
  const intent = type === 'REQUEST' ? 'wanted' : 'for sale'
  return `${title} ${intent} in ${county} | Mudaala`
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const listing = await loadListing(idFromSlug(slug)).catch(() => null)
  if (!listing) return { title: 'Listing not found | Mudaala' }

  const url = `${siteUrl()}/listing/${listingSlug(listing.title, listing.id)}`
  const photos = parsePhotos(listing.photos)
  const priceLine =
    listing.price !== null
      ? formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)
      : 'Ask seller'
  const shopName = listing.user.profile?.businessName?.trim() || listing.user.name
  const description = [
    priceLine,
    formatQuantity(listing.quantity, listing.unit),
    [listing.area, listing.county].filter(Boolean).join(', '),
    `Contact ${shopName} directly on WhatsApp or by phone.`,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    title: metaTitle(listing.type, listing.title, listing.county),
    description,
    alternates: { canonical: url },
    // A fulfilled or expired ad still renders for people who already hold the
    // link, but it should stop competing in search results.
    robots: listing.status === 'ACTIVE' ? undefined : { index: false, follow: true },
    openGraph: {
      title: metaTitle(listing.type, listing.title, listing.county),
      description,
      url,
      siteName: 'Mudaala',
      type: 'website',
      images: photos.length > 0 ? [{ url: new URL(photos[0]!, siteUrl()).toString() }] : [],
    },
    twitter: {
      card: photos.length > 0 ? 'summary_large_image' : 'summary',
      title: metaTitle(listing.type, listing.title, listing.county),
      description,
    },
  }
}

export default async function PublicListingPage({ params }: Params) {
  const { slug } = await params
  const id = idFromSlug(slug)
  const listing = await loadListing(id)
  if (!listing || listing.status === 'ARCHIVED') notFound()

  const canonical = listingSlug(listing.title, listing.id)
  if (slug !== canonical) redirect(`/listing/${canonical}`)

  // Narrow the DB's plain string into the UI's literal union, once.
  const type: 'OFFER' | 'REQUEST' = listing.type === 'REQUEST' ? 'REQUEST' : 'OFFER'

  const photos = parsePhotos(listing.photos)
  const quantity = formatQuantity(listing.quantity, listing.unit)
  const whatsapp = listing.contactWhatsapp ?? (listing.type === 'OFFER' ? listing.contactPhone : listing.contactWhatsapp)
  const profile = listing.user.profile
  const shopName = profile?.businessName?.trim() || listing.user.name
  const location = [listing.area, listing.county].filter(Boolean).join(', ')
  const priceLabel =
    listing.price !== null
      ? formatPrice(listing.price, listing.unit ? unitLabel(listing.unit) : null, listing.currency)
      : 'Ask seller'
  const url = `${siteUrl()}/listing/${canonical}`
  const shareText = `${listing.title} · ${priceLabel}${quantity ? ` · ${quantity}` : ''} · ${location} — on Mudaala: ${url}`
  const directionsUrl = mapsSearchUrl({ area: listing.area, county: listing.county, country: countryDef(listing.country ?? 'UG').name })

  // The Mudaala difference: an honest price context, computed from real
  // listings, only when there is enough data. No snapshot (fewer than 5
  // active listings in that category+unit) renders nothing at all — silence
  // is more honest than a made-up benchmark.
  const snapshot =
    listing.price !== null && listing.unit
      ? await db.priceSnapshot.findFirst({
          where: { category: listing.category, unit: listing.unit, currency: listing.currency },
          orderBy: { date: 'desc' },
        })
      : null
  const showBelowMedian =
    snapshot && listing.price !== null && listing.price < snapshot.medianPrice ? snapshot : null

  // Structured data for search engines — OFFERs only. A REQUEST is someone
  // looking to buy; dressing it up as a Product offer would fabricate facts.
  const jsonLd =
    listing.type === 'OFFER'
      ? JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: listing.title,
          description: listing.description,
          ...(photos.length > 0 ? { image: photos.map((p) => new URL(p, siteUrl()).toString()) } : {}),
          ...(listing.price !== null
            ? {
                offers: {
                  '@type': 'Offer',
                  price: listing.price,
                  priceCurrency: listing.currency,
                  url,
                  availability:
                    listing.status === 'ACTIVE'
                      ? 'https://schema.org/InStock'
                      : 'https://schema.org/SoldOut',
                  seller: { '@type': 'Organization', name: shopName },
                },
              }
            : {}),
        })
      : null

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {listing.status === 'ACTIVE' ? <ViewPing id={listing.id} /> : null}

      {/* Slim public header — a way back to the app, nothing else. */}
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <a href="/" className="font-display text-[19px] font-bold lowercase leading-none tracking-tight text-primary">
            mudaala
          </a>
          <span className="text-xs text-muted-foreground">Uganda · trade directly</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <a href="/" className="hover:underline">
            Mudaala
          </a>
          <span aria-hidden> / </span>
          <span>
            {categoryLabel(listing.category)} · {listing.county}
          </span>
        </nav>

        <article className="mt-3 overflow-hidden rounded-lg border bg-card">
          {/* Photos — pure CSS scroll snap, no client JS needed to swipe. */}
          {photos.length > 0 ? (
            <div
              className="flex snap-x snap-mandatory gap-2 overflow-x-auto scrollbar-slim p-2"
              aria-label={`Photos of ${listing.title}`}
            >
              {photos.map((photo, i) => (
                <div key={photo} className="relative h-60 w-[88%] shrink-0 snap-center overflow-hidden rounded-md border sm:h-96">
                  <img
                    src={photo}
                    alt={`${listing.title} — photo ${i + 1} of ${photos.length}`}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    className="size-full object-cover"
                  />
                </div>
              ))}
              {photos.length > 1 ? (
                <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                  {photos.length} photos · swipe
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <TypeBadge type={type} />
              <span>{categoryLabel(listing.category)}</span>
              <span aria-hidden>·</span>
              <span>
                <MapPin className="mr-0.5 inline size-3 align-[-1px]" aria-hidden />
                {location}
              </span>
            </div>

            {/* The signboard moment: the ad title set like a shop name. */}
            <h1 className="mt-2.5 font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              {listing.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="text-2xl font-bold text-primary sm:text-3xl">{priceLabel}</p>
              {listing.price !== null && listing.compareAtPrice !== null && listing.compareAtPrice > listing.price ? (
                <span className="text-sm text-muted-foreground line-through">
                  was {formatPrice(listing.compareAtPrice, null, listing.currency)}
                </span>
              ) : null}
              {listing.priceNegotiable ? <span className="text-sm text-muted-foreground">Negotiable</span> : null}
              {quantity ? (
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                  <Package className="mr-1 inline size-3 align-[-1px]" aria-hidden />
                  {quantity} available
                </span>
              ) : null}
            </div>

            {/* Honest market context — the thing no classifieds site shows.
                Snapshot rows only exist from days with 5+ active listings, so
                this line is real data or it is nothing. */}
            {snapshot ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
                <ShieldCheck className="size-4 shrink-0 text-emerald-700" aria-hidden />
                <span>
                  Median asking price across {snapshot.sampleSize} active listings was{' '}
                  <strong>
                    {formatPrice(snapshot.medianPrice, unitLabel(snapshot.unit), snapshot.currency)}
                  </strong>{' '}
                  (snapshot {snapshot.date})
                </span>
                {showBelowMedian ? (
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
                    Priced below the median
                  </span>
                ) : null}
              </div>
            ) : null}

            {listing.status !== 'ACTIVE' ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {listing.status === 'FULFILLED'
                  ? 'This listing has been marked as fulfilled by the owner.'
                  : 'This listing has expired and may no longer be available.'}
              </p>
            ) : null}

            <h2 className="mt-5 text-sm font-semibold">Description</h2>
            <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{listing.description}</p>

            <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <dt className="text-muted-foreground">Updated:</dt>
                <dd className="font-medium">{timeAgo(listing.refreshedAt)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-muted-foreground">Views:</dt>
                <dd className="font-medium">{listing.viewCount}</dd>
              </div>
              <div className="text-muted-foreground sm:col-span-2">
                Posted {formatDateTime(listing.publishedAt)} · {expiryLabel(listing.expiresAt)}
              </div>
            </dl>

            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
            >
              Get directions ({location}) →
            </a>

            {/* The growth loop: sharing costs one tap and needs no account. */}
            <div className="mt-5">
              <h2 className="text-sm font-semibold">Know someone who needs this?</h2>
              <div className="mt-2">
                <ShareRow url={url} shareText={shareText} />
              </div>
            </div>

            {/* Honest safety line — no corporate trust theatre, just the advice
                every Ugandan market buyer already knows, said plainly. */}
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Meet in a public place and check the goods before you pay. Mudaala never asks for payment and never sits
              in the middle of your deal.
            </p>
          </div>

          {/* Contact — only real, owner-provided numbers, exactly as in-app. */}
          <div className="border-t bg-secondary/40 p-4 sm:p-6">
            <h2 className="text-sm font-semibold">Contact {shopName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{formatPhonePretty(listing.contactPhone)}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <a
                href={telLink(listing.contactPhone)}
                aria-label={`Call ${formatPhonePretty(listing.contactPhone)}`}
                className="press flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary text-[15px] font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Phone className="size-4" aria-hidden /> Call seller
              </a>
              {whatsapp ? (
                <a
                  href={whatsappLink(whatsapp, listing.title, type)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-emerald-600 bg-card text-[15px] font-medium text-emerald-800 hover:bg-emerald-50"
                >
                  <WhatsAppIcon className="size-4" aria-hidden /> WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        </article>

        {/* About the seller — real account facts only: the shop as they named
            it, its permanent code, and an honest tenure date. No badges: there
            is no verification process behind one yet. */}
        <section className="mt-4 rounded-lg border bg-card p-4 sm:p-6" aria-label="About the seller">
          <h2 className="text-sm font-semibold">About the seller</h2>
          <div className="mt-2 flex items-center gap-3">
            {profile?.photoUrl ? (
              <img src={profile.photoUrl} alt="" className="size-11 shrink-0 rounded-full border object-cover" />
            ) : (
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                {shopName.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
                <Store className="size-3.5 text-muted-foreground" aria-hidden />
                {shopName}
                {profile?.shopCode ? (
                  <span className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {profile.shopCode}
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-muted-foreground">
                {profile?.area || profile?.county ? [profile?.area, profile?.county].filter(Boolean).join(', ') + ' · ' : ''}
                Active since{' '}
                {new Date(listing.user.createdAt).toLocaleDateString('en', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          {profile?.description ? <p className="mt-2.5 text-sm text-muted-foreground">{profile.description}</p> : null}
          {profile?.hours ? <p className="mt-1 text-sm text-muted-foreground">Hours: {profile.hours}</p> : null}
        </section>
      </main>

      <footer className="mt-auto border-t bg-card">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-2 px-4 py-4 text-center text-xs text-muted-foreground sm:flex-row sm:text-left">
          <p>Mudaala — local shops, bigger opportunities. Every contact connects you directly.</p>
          <a href="/" className="font-medium text-primary hover:underline">
            Open Mudaala →
          </a>
        </div>
      </footer>

      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} /> : null}
    </div>
  )
}
