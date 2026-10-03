// The 404 for /l/* — no dead ends. When the URL still points at a real
// listing (expired, fulfilled or archived), the page says so honestly and
// offers similar live ads from the same category. The contact phone is
// never rendered here: a gone ad's seller did not stop existing, but their
// number is not ours to hand out on a 404.

import Link from 'next/link'
import { headers } from 'next/headers'
import { MapPin } from 'lucide-react'
import { CategoryGlyph, categoryTint } from '@/components/commerce/category-icons'
import { loadAdRow, similarListings, photosOf, priceLabelOf, placeOf } from '@/lib/ad-page'
import { categoryLabel } from '@/lib/constants'
import { cn } from '@/lib/utils'

export default async function ListingNotFound() {
  let param = ''
  try {
    const path = (await headers()).get('x-mudaala-path') ?? ''
    param = decodeURIComponent(path.split('/').pop() ?? '')
  } catch {
    param = ''
  }

  const listing = param ? await loadAdRow(param) : null
  const similar = listing ? await similarListings(listing.category, listing.id) : []

  return (
    <div className="mx-auto min-h-dvh max-w-2xl bg-background">
      <header className="flex items-center justify-between border-b bg-card px-4 py-3">
        <a href="/" className="font-display text-xl font-semibold tracking-tight text-primary">
          Mudaala
        </a>
      </header>

      <main className="space-y-4 px-4 py-8">
        <p className="text-6xl font-semibold text-primary tabular-nums">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {listing ? `"${listing.title}" is no longer available` : 'This ad is no longer available'}
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          The ad has expired, been fulfilled, or was removed by its owner. The market itself is still open.
        </p>

        {similar.length > 0 && listing ? (
          <section aria-label="Similar ads" className="space-y-2 pt-2">
            <h2 className="text-sm font-semibold">Live ads in {categoryLabel(listing.category)}</h2>
            <div className="grid grid-cols-2 gap-2">
              {similar.map((ad) => {
                const photo = photosOf(ad.photos)[0]
                return (
                  <Link
                    key={ad.id}
                    href={`/l/${ad.id}`}
                    className="group overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/40"
                  >
                    {photo ? (
                      <img src={photo} alt="" className="h-28 w-full object-cover" loading="lazy" />
                    ) : (
                      <div className={cn('flex h-28 items-center justify-center', categoryTint(ad.category))}>
                        <CategoryGlyph category={ad.category} className="[&_svg]:size-8" />
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
          </section>
        ) : null}

        <Link
          href="/#/browse"
          className="press mt-2 inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-[15px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          Browse the market
        </Link>
      </main>
    </div>
  )
}
