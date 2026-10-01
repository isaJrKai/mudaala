'use client'

// The shop — a seller's own space on Mudaala. Everything a buyer needs to trust
// them and browse their whole catalogue: who they are, where they are, when
// they are open, a call/WhatsApp button, and every active listing they run.
// Buyers never sign in to see any of this.
// The shop's identity code (MD-XXXX) and its printable QR poster live here
// too — the poster is the seller's tool for pulling walk-up customers onto
// their page (print it, stick it on the stall, buyers scan).

import { useMemo, useState, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, Check, Clock, Copy, Eye, MapPin, MessageCircle, Pencil, Phone, Printer, QrCode, Share2, Store, X } from 'lucide-react'
import QRCode from 'react-qr-code'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/client'
import type { ShopPage as ShopPageT, ListingShopOwner } from '@/lib/client'
import { telLink, whatsappLink } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { useAddToBasket } from './basket-view'
import { MudaalaCurve } from './mudaala-curve'
import { ListingBlock } from './listing-card'
import { ListingGridSkeleton } from './skeletons'
import { ErrorState } from './listings-browse'
import { EmptyState } from './empty-state'

export function ShopView({ id }: { id: string }) {
  const { navigate } = useAppStore()
  const { user, isLoading: sessionLoading } = useSession()
  const addToBasket = useAddToBasket()
  const [posterOpen, setPosterOpen] = useState(false)
  // Copy-the-code feedback: the button itself becomes the receipt — it swaps
  // to a check + "Copied" for a beat, the same swap pattern as Add to basket.
  const [copied, setCopied] = useState(false)
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
        <ListingGridSkeleton count={6} />
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
  // Copy the till-style code. If the clipboard refuses (permissions), nothing
  // breaks — the code sits right there in big monospace; typing it was always
  // the honest fallback.
  const copyShopCode = async () => {
    if (!shop.shopCode) return
    try {
      await navigator.clipboard.writeText(shop.shopCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // No clipboard permission — nothing to fix, the code is on screen.
    }
  }
  // Share link: opens WhatsApp with the text pre-written (wa.me with no
  // recipient → the sender picks the chat or status). The code rides along so
  // the shop stays findable even after forwarding. Owner says "our"; a buyer
  // forwarding the shop says "found" — same link, honest voice for whoever
  // is tapping share.
  const shareHref =
    shopUrl && shop.shopCode
      ? `https://wa.me/?text=${encodeURIComponent(
          isOwner
            ? `Find ${shop.name} on Mudaala — our code is ${shop.shopCode} — ${shopUrl}`
            : `Found ${shop.name} on Mudaala — shop code ${shop.shopCode} — ${shopUrl}`,
        )}`
      : null

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate({ name: 'browse' })}>
        <ArrowLeft className="size-4" aria-hidden /> Back to browse
      </Button>

      {/* The owner's mirror: only the seller ever sees this strip. It names
          the page as THEIRS — ownership is felt, not claimed — and answers
          the first question every new seller has ("what do customers actually
          get shown?") with a one-tap edit. A buyer loading this page never
          knows the strip exists. */}
      {isOwner ? (
        <section
          aria-label="Owner note"
          className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-primary/20 bg-accent/60 px-3 py-2"
        >
          <Eye className="size-3.5 shrink-0 text-primary" aria-hidden />
          <p className="min-w-0 flex-1 text-xs leading-snug">
            <span className="font-semibold text-primary">This is your shop</span>
            <span className="text-foreground/75"> — exactly what buyers see.</span>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="press h-7 gap-1 border-primary/30 px-2.5 text-xs text-primary hover:bg-accent"
            onClick={() => navigate({ name: 'account' })}
          >
            <Pencil className="size-3" aria-hidden /> Edit shop
          </Button>
        </section>
      ) : null}

      {/* Shop identity — the seller's own space, named by them. The photo is
          the cover and the name is the signboard: serif, in the brand green,
          the way a market shop paints its name, with the painter's stroke
          under it. Guests are greeted the way East Africa greets — Karibu.
          The photo meets the signboard through the Mudaala curve — the brand's
          sweeping edge. Text never overlays the photo — we do not control
          what sellers upload, so the name sits on our card where contrast is
          always ours to keep; the curve shapes the seam, it carries no text. */}
      <section className="overflow-hidden rounded-lg border bg-card" aria-label={`Shop: ${shop.name}`}>
        {shop.photoUrl ? (
          <div className="relative">
            <img
              src={shop.photoUrl}
              alt={`Photo of ${shop.name}`}
              className="h-36 w-full object-cover object-center sm:h-48"
            />
            <MudaalaCurve className="absolute inset-x-0 bottom-0 block h-5 w-full text-card sm:h-6" />
            {/* The shop's face: a square avatar riding the seam, bottom-left
                — the way a market stall's photo hangs over the counter edge.
                Same image as the cover, so it lazy-loads from cache. */}
            <img
              src={shop.photoUrl}
              alt=""
              loading="lazy"
              className="absolute -bottom-4 left-4 z-10 size-14 rounded-lg border border-border bg-card object-cover sm:-bottom-5 sm:left-5 sm:size-16"
            />
          </div>
        ) : (
          // No photo yet: a flat green signboard with the shop's initial —
          // a designed, honest placeholder, not a broken-looking gap. Same
          // curve at the seam, so the doorway keeps its shape either way.
          <div className="relative flex h-36 w-full items-center justify-center bg-primary sm:h-44" aria-hidden>
            <span className="font-display text-6xl font-semibold text-primary-foreground sm:text-7xl">
              {shop.name.charAt(0).toUpperCase()}
            </span>
            <MudaalaCurve className="absolute inset-x-0 bottom-0 block h-5 w-full text-card sm:h-6" />
          </div>
        )}
        <div className="p-4 sm:p-5">
          {/* With an avatar overlapping the seam, the signboard block is
              indented to clear it — the name starts where the photo ends. */}
          <div className={shop.photoUrl ? 'pl-[4.5rem] sm:pl-[5.5rem]' : undefined}>
            {/* A buyer entering someone's shop is a guest, and the greeting is
                in the word East Africa actually uses. The owner doesn't greet
                themselves — they get the mirror strip above instead. */}
            {!isOwner ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/75">
                Karibu · welcome
              </p>
            ) : null}
            <h1 className="mt-0.5 font-display text-[1.65rem] font-semibold leading-tight tracking-tight text-primary sm:text-3xl">
              {shop.name}
            </h1>
            {/* The painter's stroke under a market signboard — drawn once on
                open, then it just sits there, the way a good sign does. */}
            <svg viewBox="0 0 150 8" className="mt-1.5 h-2 w-32 text-primary/60 sm:w-48" aria-hidden="true">
              <path
                d="M2 6 C 30 2.2, 58 1.4, 82 3.4 S 130 6.4, 148 3"
                pathLength={1}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="sign-draw"
              />
            </svg>
          </div>

          <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
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
            <span>
              On Mudaala since {new Date(shop.memberSince).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
            </span>
            {shop.shopCode ? (
              <span className="font-mono text-[13px] font-semibold tracking-widest text-foreground/70">{shop.shopCode}</span>
            ) : null}
          </p>

          {/* Trust, not decoration: the one chip we can actually back — the
              number on screen IS the seller's login line, the API guarantees
              it. No "verified" claims we cannot prove. The profile-completeness
              chip is the seller's to-do, so only the seller ever sees it. */}
          {shop.phoneConfirmed || isOwner ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {shop.phoneConfirmed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground ring-1 ring-inset ring-primary/15">
                  <BadgeCheck className="size-3.5" aria-hidden /> Phone confirmed
                </span>
              ) : null}
              {isOwner ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {shop.complete ? 'Complete shop profile' : `Profile ${doneCount}/5 complete`}
                </span>
              ) : null}
            </div>
          ) : null}

          {shop.description ? (
            <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-foreground/90">{shop.description}</p>
          ) : isOwner ? (
            // The empty slot works FOR the seller: it names what belongs here
            // and hands them the pen. Not a blank gap, not a lorem ipsum.
            <p className="mt-3 max-w-prose rounded-md border border-dashed border-primary/30 bg-accent/40 px-3 py-2 text-sm leading-relaxed text-foreground/80">
              Add a few words about your shop — buyers read them right here.{' '}
              <button
                type="button"
                className="press inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline"
                onClick={() => navigate({ name: 'account' })}
              >
                <Pencil className="size-3" aria-hidden /> Write it
              </button>
            </p>
          ) : (
            // And no invented copy for buyers either — the honest line beats
            // a template's polished filler.
            <p className="mt-3 max-w-prose text-sm italic leading-relaxed text-muted-foreground/85">
              The shop hasn't written its story yet — the listings and the phone line speak for it.
            </p>
          )}
        </div>

        {/* Shop contact — the same direct links buyers get everywhere. The
            line above the buttons says WHY they exist: no middleman, no fees,
            the shop's own phone rings. The owner reads the mirror version —
            these are their incoming lines. */}
        <div className="border-t bg-secondary/40 p-4 sm:p-5">
          <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
            {isOwner
              ? 'Buyers tap these — the call or message lands straight on your phone.'
              : 'Straight to the shop, no middleman — your call or message rings their phone.'}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="press h-11 flex-1 text-[15px]">
              <a href={telLink(shop.phone)} aria-label={`Call ${shop.name}`}>
                <Phone className="size-4" aria-hidden /> Call shop
              </a>
            </Button>
            {whatsappNumber ? (
              <Button
                asChild
                variant="outline"
                className="press h-11 flex-1 border-emerald-600 text-[15px] text-emerald-800 hover:bg-emerald-50"
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

      {/* The bridge for buyers: the code IS the address. Someone who landed
          here from a shared link can carry the shop away — copy the till-style
          code, or forward the page on WhatsApp. The owner gets the poster tool
          below instead; two QRs on one page is one too many. */}
      {!isOwner && shop.shopCode ? (
        <section aria-label="Find this shop again" className="rounded-lg border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-md border bg-white p-1.5">
              {shopUrl ? <QRCode value={shopUrl} size={48} role="img" aria-label={`QR code for ${shop.name}'s shop`} /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Find this shop again</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Scan the code, or type it into Mudaala search like a till number.
              </p>
              <p className="mt-1 font-mono text-lg font-bold tracking-widest text-primary">{shop.shopCode}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <Button variant="outline" size="sm" className="press h-8 gap-1 px-2.5 text-xs" onClick={copyShopCode}>
                {copied ? (
                  <>
                    <Check className="size-3.5 text-emerald-700" aria-hidden /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" aria-hidden /> Copy
                  </>
                )}
              </Button>
              {shareHref ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="press h-8 gap-1 border-emerald-600 px-2.5 text-xs text-emerald-800 hover:bg-emerald-50"
                >
                  <a
                    href={shareHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Share ${shop.name} on WhatsApp`}
                  >
                    <Share2 className="size-3.5" aria-hidden /> Share
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

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
                Your code is <span className="font-mono font-semibold text-foreground">{shop.shopCode}</span> — it never changes, so old posters keep working. Customers can type it into the Mudaala search, too.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Button variant="outline" className="gap-1.5" onClick={() => setPosterOpen(true)}>
                <QrCode className="size-4" aria-hidden /> Show poster &amp; print
              </Button>
              {shareHref ? (
                <Button asChild variant="outline" className="gap-1.5 border-emerald-600 text-emerald-800 hover:bg-emerald-50">
                  <a
                    href={shareHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Share ${shop.name} on WhatsApp`}
                  >
                    <Share2 className="size-4" aria-hidden /> Share on WhatsApp
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* The catalogue — every active listing this shop runs */}
      <section aria-label="Shop catalogue" className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">
            In this shop <span className="font-normal text-muted-foreground">({shop.activeCount})</span>
          </h2>
          {/* The platform's position, in one line: we host, we never set the
              price. It reads as trust in the seller, which is what makes a
              buyer trust the seller. */}
          <p className="mt-0.5 text-xs text-muted-foreground">Posted by the shop — prices are theirs, not ours.</p>
        </div>

        {listings.length === 0 ? (
          <EmptyState
            icon={<Store />}
            title="Nothing on the shelf right now"
            description={
              isOwner
                ? 'Buyers are landing on this page — post a listing and the shelf fills up.'
                : "The shop hasn't posted anything yet — the stall may still have stock. Call or WhatsApp above, or browse other shops."
            }
            action={
              isOwner ? (
                <Button className="press" onClick={() => navigate({ name: 'publish' })}>
                  Post a listing
                </Button>
              ) : (
                <Button variant="outline" className="press" onClick={() => navigate({ name: 'browse' })}>
                  Browse all listings
                </Button>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {/* Same blocks as the browse feed — a shop's catalogue should feel
                like a market table: every item's face visible at once. */}
            {listings.map((listing) => (
              <ListingBlock
                key={listing.id}
                listing={{ ...listing, user: shopOwnerFrom(shop) }}
                onOpen={(lid) => navigate({ name: 'listing', id: lid })}
                onAdd={addToBasket}
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
          <div className="mx-auto max-w-md overflow-hidden rounded-lg border-2 border-neutral-900 bg-white text-center">
            {/* The paper carries the Mudaala curve too — this poster is the
                brand's PHYSICAL surface. A shopper in the market should
                recognize a Mudaala poster from across the row, the same way
                they recognize the app. The code itself stays black-on-white
                above the band: the one number that must survive any printer
                gets the most reliable ink. */}
            <div className="p-8 pb-6">
              {shop.photoUrl ? (
                <img src={shop.photoUrl} alt="" className="mx-auto size-24 rounded-lg border border-neutral-300 object-cover" />
              ) : (
                <span className="mx-auto flex size-24 items-center justify-center rounded-lg border border-neutral-300 text-3xl font-bold text-neutral-800">
                  {shop.name.charAt(0).toUpperCase()}
                </span>
              )}
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-neutral-900">{shop.name}</h2>
              {shop.area || shop.county ? (
                <p className="mt-1 text-sm text-neutral-600">{[shop.area, shop.county].filter(Boolean).join(', ')}</p>
              ) : null}
              <div className="mx-auto mt-6 w-fit bg-white p-3">
                {shopUrl ? <QRCode value={shopUrl} size={200} role="img" aria-label={`QR code for ${shop.name}'s shop`} /> : null}
              </div>
              <p className="mt-3 font-mono text-3xl font-bold tracking-widest text-neutral-900">{shop.shopCode}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-neutral-500">Shop code</p>
              <p className="mt-2 text-sm text-neutral-600">Can't scan? Type the code in Mudaala search.</p>
            </div>
            <MudaalaCurve className="block h-6 w-full text-primary" />
            <div className="bg-primary px-8 pb-7 pt-2.5 text-primary-foreground">
              <p className="text-base font-semibold">Scan to see our shop on Mudaala</p>
              <p className="mt-1.5 text-sm text-primary-foreground/85">Or call us: {shop.phone}</p>
            </div>
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
