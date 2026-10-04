// Shop pages - every shop code gets a real web page: /s/MD-4821. The code
// is printed on posters and typed like a mobile-money till number, so the
// URL forgives case, spaces and dashes (normalizeShopCode) while the
// canonical tag always states the stored form. The page shows identity and
// live stock; contact happens per listing, so no phone number is rendered
// here at all - not in the body, not in the metadata.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { Clock, MapPin } from 'lucide-react'
import { ShareAdRow } from '@/components/commerce/share-row'
import { ReportButton } from '@/components/commerce/report-button'
import { db } from '@/lib/db'
import { expireOverdueListings } from '@/lib/listings'
import { normalizeShopCode } from '@/lib/format'
import { siteUrl } from '@/lib/site'
import { copy } from '@/lib/copy'
import { SiteFooter } from '@/components/commerce/site-footer'
import { photosOf, absolutePhoto, placeOf, priceLabelOf } from '@/lib/ad-page'
import { categoryLabel } from '@/lib/constants'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ code: string }> }

// Request-scoped loader (React.cache dedupes the generateMetadata + page
// pair). Null for malformed or unknown codes; the page turns that into a
// friendly 404.
const loadShop = cache(async (raw: string) => {
  await expireOverdueListings()

  const code = normalizeShopCode(raw)
  if (!code) return null

  return db.businessProfile.findUnique({
    where: { shopCode: code },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          listings: { where: { status: 'ACTIVE' }, orderBy: { refreshedAt: 'desc' }, take: 200 },
        },
      },
    },
  })
})

type ShopRow = NonNullable<Awaited<ReturnType<typeof loadShop>>>

function shopName(shop: ShopRow): string {
  return shop.businessName?.trim() || shop.user.name
}

function shopPlace(shop: ShopRow): string {
  return [shop.area, shop.county].filter(Boolean).join(', ')
}

// The preview image: the newest live ad's first photo - a shop IS its stock
// - falling back to the shop photo the seller uploaded.
// PLACEHOLDER RULE - seed photos (/uploads/seed/) are development fixtures:
// they never ship as the shop's OG/Twitter preview.
function shopImage(shop: ShopRow): string | undefined {
  const photo =
    photosOf(shop.user.listings[0]?.photos ?? '[]').find((p) => !p.includes('/uploads/seed/')) ??
    (shop.photoUrl && !shop.photoUrl.includes('/uploads/seed/') ? shop.photoUrl : undefined)
  return photo ? absolutePhoto(photo) : undefined
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params
  const shop = await loadShop(code)
  if (!shop) {
    return { title: 'Shop not found · Mudaala', robots: { index: false, follow: false } }
  }

  const name = shopName(shop)
  const place = shopPlace(shop)
  const count = shop.user.listings.length
  const blurb = shop.description?.replace(/\s+/g, ' ').trim().slice(0, 120) ?? ''
  const description = `${count} live ad${count === 1 ? '' : 's'}${place ? ` in ${place}` : ''} on Mudaala.${blurb ? ` ${blurb}` : ''}`
  const image = shopImage(shop)

  return {
    title: `${name} · Mudaala`,
    description,
    alternates: { canonical: `/s/${shop.shopCode}` },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${name} · Mudaala`,
      description,
      url: `/s/${shop.shopCode}`,
      siteName: 'Mudaala',
      type: 'website',
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: `${name} · Mudaala`,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}

export default async function ShopPage({ params }: Params) {
  const { code } = await params
  const shop = await loadShop(code)
  if (!shop) notFound()

  const name = shopName(shop)
  const place = shopPlace(shop)
  const listings = shop.user.listings
  const shareUrl = `${siteUrl}/s/${shop.shopCode}`

  return (
    <div className="mx-auto min-h-dvh max-w-2xl bg-background">
      <header className="flex items-center justify-between border-b bg-card px-4 py-3">
        <a href="/" className="font-display text-xl font-semibold tracking-tight text-primary">
          Mudaala
        </a>
        <a
          href={`/#/shop/${shop.user.id}`}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Open in the app
        </a>
      </header>

      <main className="space-y-4 px-4 py-4">
        {/* Identity - real account facts only, same honesty rules as the
            ad pages: name, real code, real start date, what the seller
            actually filled in. No badges, no ratings. */}
        <section className="rounded-lg border bg-card p-4 sm:p-5" aria-label="About this shop">
          <div className="flex items-center gap-3">
            {shop.photoUrl ? (
              <img src={shop.photoUrl} alt="" className="size-14 shrink-0 rounded-lg border object-cover" />
            ) : (
              <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-accent text-xl font-semibold text-accent-foreground">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-semibold tracking-tight">{name}</h1>
              <p className="text-sm text-muted-foreground">
                Active since {new Date(shop.user.createdAt).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
                {place ? ` · ${place}` : ''}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Shop code{' '}
            <span className="rounded border bg-secondary px-1.5 py-0.5 text-[13px] font-semibold tracking-widest text-foreground tabular-nums">
              {shop.shopCode}
            </span>{' '}
            Type it into Mudaala search to find this shop again.
          </p>
          {shop.description ? <p className="mt-2 text-sm leading-relaxed text-foreground/90">{shop.description}</p> : null}
          {shop.hours ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-4" aria-hidden /> {shop.hours}
            </p>
          ) : null}
        </section>

        {/* Live stock - the catalogue a buyer came for, each card opening
            the ad's own web page. */}
        <section aria-label="Live ads" className="space-y-2">
          <h2 className="text-sm font-semibold">Live ads ({listings.length})</h2>
          {listings.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {listings.map((ad) => {
                const photo = photosOf(ad.photos).find((p) => !p.includes('/uploads/seed/'))
                return (
                  <Link
                    key={ad.id}
                    href={`/l/${ad.id}`}
                    className="group overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/40"
                  >
                    {photo ? (
                      <img src={photo} alt="" className="h-28 w-full object-cover" loading="lazy" />
                    ) : (
                      // PLACEHOLDER RULE - neutral tile, not a stand-in image.
                      <div
                        role="img"
                        aria-label="Photo coming from the seller"
                        className="flex h-28 flex-col items-center justify-center gap-1 bg-muted"
                      >
                        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-6 text-muted-foreground/70">
                          <path d="M14.5 4h-5L7.5 6.5H5a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-2.5L14.5 4z" />
                          <circle cx="12" cy="13" r="3.5" />
                        </svg>
                        <span className="px-2 text-[11px] text-muted-foreground">{categoryLabel(ad.category)}</span>
                      </div>
                    )}
                    <div className="space-y-1 p-2.5">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">{ad.title}</p>
                      <p className="text-sm font-semibold text-primary">{priceLabelOf(ad) ?? 'Ask seller'}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" aria-hidden /> {placeOf(ad)}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No live ads right now. Check back soon, or browse the market.
            </p>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4 sm:p-5" aria-label="Share this shop">
          <ShareAdRow title={name} url={shareUrl} priceLabel={null} noun="shop" label="Share this shop" />
          <div className="mt-3 border-t pt-3">
            <ReportButton targetType="SHOP" targetId={shop.id} noun="shop" />
          </div>
        </section>
      </main>

      <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground">
        <p>
          {copy.app.name}: {copy.app.footerLine}.{' '}
          <a href="/#/browse" className="font-medium text-primary underline-offset-2 hover:underline">
            Browse the market
          </a>
        </p>
      </footer>

      <SiteFooter />
    </div>
  )
}
