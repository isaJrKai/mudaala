'use client'

// The desktop basket dock (xl+) - the always-visible summary of what the
// buyer is collecting, without taking the listing grid hostage.
//
// Two states, one truth:
//
//   - THE STRIP (resting): a 64px sliver docked to the right edge under the
//     header, its top border continuing the header's bottom line. The basket
//     glyph fills as units land, the badge counts lines, the running total
//     sits stacked. The motivation stays on screen; the shell only reserves
//     64px, so the listings keep their width.
//   - THE PANEL (invited): tapping the strip slides a w-80 sheet in from the
//     edge. It floats (a hand's width off the bottom, rounded corner,
//     shadow) and overlays the grid instead of squeezing it - the buyer
//     invited it in, so the listings never reflow. Esc, the close button or
//     navigating to the full basket view send it back.
//
// Same basket state, same honesty rules as the full basket view:
//
//   - Lines are re-checked against the public API before anything can be
//     paid (the SAME query the basket view runs, so one fetch serves both).
//   - A gone or unavailable line can ride in the list but never in the
//     estimate, and the panel says so.
//   - The subtotal is labelled an estimate. The seller confirms.
//
// Like the full basket view, the panel only COLLECTS - no WhatsApp, no
// call, and no pay buttons either: while the buyer shops, the basket keeps
// its hands out of the money. Payment happens at the basket view, reached
// from the basket icon in the header, so the one payment door stays the
// one door. Comms live on the shop and listing pages.
//
// RailShell also owns the shell column: on the buying views it reserves the
// strip's width (xl:pr-16) so the resting dock never covers content, and on
// the seller workspace views (publish, settings, my listings) the dock is
// simply not mounted and nothing changes.

import { useEffect, useRef, useState } from 'react'
import { Check, CheckCircle2, ChevronLeft, ChevronRight, ShoppingBasket, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/format'
import { useAppStore, type ViewName } from '@/lib/store'
import {
  basketCount,
  basketFillLevel,
  basketSubtotal,
  basketUnits,
  isShopDone,
  markShopDone,
  setLineQty,
  useBasket,
  type BasketShopInfo,
  type BasketLineInfo,
} from '@/lib/basket'
import { useLineStatuses, useRemoveLine } from '@/components/commerce/basket-view'
import { BasketGlyph } from './basket-icon'
import { cn } from '@/lib/utils'
import { copy } from '@/lib/copy'

// The views where a buyer is shopping: the buying loop itself plus the two
// buyer watch surfaces (saved searches, alerts). The basket view is its own
// full checkout and does not need a mini basket beside it; seller views need
// the width.
const RAIL_VIEWS: ViewName[] = ['home', 'browse', 'listing', 'shop', 'saved', 'notifications']

export function RailShell({ children }: { children: React.ReactNode }) {
  const { view } = useAppStore()
  const rail = RAIL_VIEWS.includes(view.name)
  return (
    <div className={cn('flex min-h-dvh flex-col lg:ml-60', rail && 'xl:pr-16')}>
      {children}
      {rail ? <BasketDock /> : null}
    </div>
  )
}

function BasketDock() {
  const { navigate } = useAppStore()
  const basket = useBasket()
  const shopIds = Object.keys(basket.lines)
  const count = basketCount(basket)
  const units = basketUnits(basket)
  const [open, setOpen] = useState(false)

  const stripRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  // Esc sends the panel back behind the strip.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Focus follows the invitation: into the panel when it opens, back to the
  // strip when it closes. Skipped on first mount - a page load must not
  // steal focus. visibility flips at the START of the transition for the
  // element becoming visible, so both targets are focusable in time.
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (open) {
      panelRef.current?.focus()
    } else {
      stripRef.current?.focus()
    }
  }, [open])

  // The strip answers an add the same way the top-bar basket does: a WAAPI
  // one-shot pop, only when the units grow during this visit (a reload with
  // a saved basket must not look like an add), skipped under reduced motion.
  const unitsRef = useRef<number | null>(null)
  useEffect(() => {
    if (unitsRef.current === null) {
      unitsRef.current = units
      return
    }
    const prev = unitsRef.current
    unitsRef.current = units
    if (units <= prev) return
    if (
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      stripRef.current?.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.07)', offset: 0.4 },
          { transform: 'scale(1)' },
        ],
        { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      )
    }
  }, [units])

  // Glance total across every line in the basket. Mixed currencies (rare)
  // or nothing priced simply hide the block; the per-shop estimate, the
  // staleness check and the send decision live in the panel below.
  const allLines = Object.values(basket.lines).flatMap((shopLines) => Object.values(shopLines))
  const total = basketSubtotal(allLines)
  const totalParts = total ? formatPrice(total.amount, null, total.currency).split(' ') : []
  const totalSymbol = totalParts[0]
  const totalAmount = totalParts[1]

  return (
    <>
      <button
        ref={stripRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="basket-rail-panel"
        aria-label={copy.basket.iconAria(count)}
        className={cn(
          'press fixed right-0 top-14 z-30 hidden w-16 flex-col items-center gap-1.5 rounded-l-xl border bg-card py-3 shadow-sm transition-all duration-200 motion-reduce:transition-none xl:flex',
          open ? 'invisible translate-x-full' : 'visible translate-x-0',
        )}
      >
        <BasketGlyph fill={basketFillLevel(units)} className="size-6" />
        {count > 0 ? (
          <span className="flex h-4 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
        {total && totalAmount ? (
          <span className="flex max-w-full flex-col items-center leading-tight">
            <span className="text-[9px] text-muted-foreground">{totalSymbol}</span>
            <span className="text-[10px] font-semibold leading-tight tracking-tight tabular-nums whitespace-nowrap">{totalAmount}</span>
          </span>
        ) : null}
        <ChevronLeft className="size-3.5 text-muted-foreground" aria-hidden />
      </button>

      <aside
        ref={panelRef}
        id="basket-rail-panel"
        tabIndex={-1}
        aria-label={copy.basket.railAria}
        className={cn(
          'fixed bottom-4 right-0 top-14 z-30 hidden w-80 flex-col overflow-hidden rounded-l-xl border bg-card shadow-xl outline-none transition-all duration-200 motion-reduce:transition-none xl:flex',
          open ? 'visible translate-x-0' : 'invisible translate-x-full',
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingBasket className="size-4 text-primary" aria-hidden />
            {copy.basket.title}
            {count > 0 ? (
              <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular-nums">
                {count > 9 ? '9+' : count}
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-1">
            {shopIds.length > 0 ? (
              <button
                type="button"
                onClick={() => navigate({ name: 'basket' })}
                className="press rounded px-1 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                {copy.basket.openBasket}
              </button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="press size-7"
              onClick={() => setOpen(false)}
              aria-label={copy.basket.hideRail}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
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
    </>
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
  const basket = useBasket()
  const done = isShopDone(basket, shopId)
  const removeLine = useRemoveLine()
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
        {done ? <Check className="size-3.5 shrink-0 text-emerald-700" aria-hidden /> : null}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="press size-6 text-muted-foreground hover:text-destructive"
                    onClick={() => removeLine(shopId, listingId, shop, line)}
                    aria-label={copy.basket.removeLineAria(line.title)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
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

        <button
          type="button"
          onClick={() => markShopDone(shopId, !done)}
          className={cn(
            'press flex w-full items-center justify-center gap-1.5 rounded text-[11px] font-medium',
            done ? 'text-emerald-700 hover:text-emerald-800' : 'text-muted-foreground hover:text-emerald-700',
          )}
          aria-label={done ? copy.basket.doneUndoAria(shop.name) : copy.basket.markDoneAria(shop.name)}
        >
          {done ? <CheckCircle2 className="size-3" aria-hidden /> : <Check className="size-3" aria-hidden />}
          {done ? copy.basket.doneChip : copy.basket.markDone}
        </button>
      </div>
    </section>
  )
}
