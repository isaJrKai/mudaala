'use client'

// The desktop basket rail (xl+) - the always-visible summary of what the
// buyer is collecting. The basket view is the full checkout with per-line
// availability checks; the rail is the glance: lines, steppers, the
// estimated total and the one send action, on screen while the buyer
// scrolls listings. Same basket state, same honesty rules:
//
//   - Lines are re-checked against the public API before anything can be
//     sent (the SAME query the basket view runs, so one fetch serves both).
//   - A gone or unavailable line can ride in the list but never in the
//     message, and the rail says so.
//   - The subtotal is labelled an estimate. The seller confirms.
//
// RailShell also owns the shell column: on the buying views it reserves the
// rail's width (xl:pr-80) so the centred content never slides under it, and
// on the seller workspace views (publish, settings, my listings) the rail is
// simply not mounted and nothing changes.

import { Phone, ShoppingBasket } from 'lucide-react'
import { WhatsAppIcon } from '@/components/commerce/brand-icons'
import { Button } from '@/components/ui/button'
import { formatPrice, telLink } from '@/lib/format'
import { useAppStore, type ViewName } from '@/lib/store'
import {
  basketCount,
  basketSubtotal,
  orderWhatsAppHref,
  setLineQty,
  useBasket,
  type BasketShopInfo,
  type BasketLineInfo,
} from '@/lib/basket'
import { useLineStatuses } from '@/components/commerce/basket-view'
import { cn } from '@/lib/utils'
import { copy } from '@/lib/copy'

// The views where a buyer is shopping and the rail earns its place. The
// basket view is its own full checkout and does not need a mini basket
// beside it; seller views need the width.
const RAIL_VIEWS: ViewName[] = ['home', 'browse', 'listing', 'shop']

export function RailShell({ children }: { children: React.ReactNode }) {
  const { view } = useAppStore()
  const rail = RAIL_VIEWS.includes(view.name)
  return (
    <div className={cn('flex min-h-dvh flex-col lg:ml-60', rail && 'xl:pr-80')}>
      {children}
      {rail ? <BasketRail /> : null}
    </div>
  )
}

function BasketRail() {
  const { navigate } = useAppStore()
  const basket = useBasket()
  const shopIds = Object.keys(basket.lines)
  const count = basketCount(basket)

  return (
    <aside
      aria-label={copy.basket.railAria}
      className="fixed bottom-0 right-0 top-14 z-30 hidden w-80 flex-col border-l bg-card xl:flex"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingBasket className="size-4 text-primary" aria-hidden />
          {copy.basket.title}
          {count > 0 ? (
            <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular-nums">
              {count > 9 ? '9+' : count}
            </span>
          ) : null}
        </p>
        {shopIds.length > 0 ? (
          <button
            type="button"
            onClick={() => navigate({ name: 'basket' })}
            className="press text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            {copy.basket.openBasket}
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {shopIds.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <ShoppingBasket className="size-8 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium">{copy.basket.emptyTitle}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{copy.basket.emptySub}</p>
            <Button size="sm" variant="outline" className="press mt-1" onClick={() => navigate({ name: 'browse' })}>
              {copy.basket.browse}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {shopIds.map((shopId) => (
              <RailShop key={shopId} shopId={shopId} shop={basket.shops[shopId]} lines={basket.lines[shopId]} />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function RailShop({
  shopId,
  shop,
  lines,
}: {
  shopId: string
  shop: BasketShopInfo
  lines: Record<string, BasketLineInfo>
}) {
  const { navigate } = useAppStore()
  const entries = Object.entries(lines)
  const ids = entries.map(([id]) => id)
  const statuses = useLineStatuses(shopId, ids)

  const fresh = entries.filter(([id]) => !statuses.data || statuses.data[id] === 'ACTIVE')
  const stale = entries.filter(([id]) => statuses.data && statuses.data[id] !== 'ACTIVE')
  const sendable = statuses.isLoading ? entries : fresh
  const sendableLines = sendable.map(([, line]) => line)
  const subtotal = basketSubtotal(sendableLines)

  return (
    <section
      className="animate-in fade-in overflow-hidden rounded-lg border bg-background motion-reduce:animate-none"
      aria-label={copy.basket.shopListAria(shop.name)}
    >
      <button
        type="button"
        onClick={() => navigate({ name: 'shop', id: shopId })}
        className="press flex w-full items-center gap-2 border-b px-3 py-2 text-left hover:bg-secondary/50"
        aria-label={copy.basket.openShopAria(shop.name)}
      >
        {shop.photoUrl ? (
          <img src={shop.photoUrl} alt="" className="size-7 shrink-0 rounded-full border object-cover" />
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
            {shop.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{shop.name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{entries.length}</span>
      </button>

      <ul className="divide-y">
        {entries.map(([listingId, line]) => {
          const status = statuses.data?.[listingId]
          const gone = status !== undefined && status !== 'ACTIVE'
          return (
            <li key={listingId} className={cn('px-3 py-2', gone && 'bg-amber-50/60')}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate({ name: 'listing', id: listingId })}
                  className="min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:underline"
                  aria-label={copy.basket.openLineAria(line.title)}
                >
                  {line.title}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="press size-6"
                    disabled={line.qty <= 1}
                    onClick={() => setLineQty(shopId, listingId, line.qty - 1)}
                    aria-label={copy.basket.oneLessAria(line.title)}
                  >
                    <span className="text-sm leading-none">&minus;</span>
                  </Button>
                  <span
                    className="inline-block min-w-5 text-center text-xs font-semibold tabular-nums"
                    aria-label={`${line.title}: ${line.qty}`}
                  >
                    {line.qty}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="press size-6"
                    onClick={() => setLineQty(shopId, listingId, line.qty + 1)}
                    aria-label={copy.basket.oneMoreAria(line.title)}
                  >
                    <span className="text-sm leading-none">+</span>
                  </Button>
                </div>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[11px] text-muted-foreground tabular-nums">
                  {line.price !== null
                    ? `${formatPrice(line.price, null, line.currency)}${line.unit ? ` / ${line.unit}` : ''}`
                    : copy.basket.priceOnAsking}
                </p>
                {gone ? (
                  <p className="shrink-0 text-[11px] font-medium text-amber-800">
                    {status === 'GONE' ? copy.basket.goneRemoved : copy.basket.goneUnavailable}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="space-y-1.5 border-t bg-secondary/40 px-3 py-2">
        {stale.length > 0 ? (
          <p className="text-[11px] text-amber-800">
            {sendable.length === 0
              ? copy.basket.staleNoneNote
              : copy.basket.staleSomeNote(stale.length, entries.length)}
          </p>
        ) : null}

        {subtotal ? (
          <p className="text-xs tabular-nums">
            <span className="font-semibold">{formatPrice(subtotal.amount, null, subtotal.currency)}</span>{' '}
            <span className="text-[11px] text-muted-foreground">{copy.basket.estimateNote}</span>
          </p>
        ) : null}

        {shop.whatsapp && sendable.length > 0 ? (
          <Button asChild size="sm" className="press h-8 w-full bg-emerald-700 text-[13px] text-white hover:bg-emerald-800">
            <a
              href={orderWhatsAppHref(shop, sendableLines)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={copy.basket.sendListAria(sendable.length, shop.name)}
            >
              <WhatsAppIcon className="size-3.5" aria-hidden /> {copy.basket.sendList}
            </a>
          </Button>
        ) : null}
        {sendable.length === 0 && !statuses.isLoading ? (
          <Button size="sm" className="h-8 w-full text-[13px]" disabled>
            <WhatsAppIcon className="size-3.5" aria-hidden /> {copy.basket.nothingToSend}
          </Button>
        ) : null}
        {!shop.whatsapp && sendable.length > 0 ? (
          <Button asChild size="sm" className="press h-8 w-full text-[13px]">
            <a href={telLink(shop.phone)} aria-label={copy.basket.callWithListAria(shop.name)}>
              <Phone className="size-3.5" aria-hidden /> {copy.basket.callWithList}
            </a>
          </Button>
        ) : null}
      </div>
    </section>
  )
}
