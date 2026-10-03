'use client'

// The cart dock - the tray that follows the buyer while they shop, without
// taking the listing grid hostage. One cart, two docks:
//
//   xl AND UP - THE STRIP (resting): a 64px sliver docked to the right edge
//   under the header. The cart glyph sits beside the header's basket glyph
//   but is a different animal: the CART only collects (its own icon says
//   so), the BASKET up top is where final decisions happen. The badge
//   counts lines, the running total sits stacked. The shell only reserves
//   64px, so the listings keep their width.
//
//   BELOW xl - THE BAR: phones (and tablets) get a slim bar that
//   materialises with the first line and rides above the bottom nav, so
//   the buyer always sees what the cart is holding. Tapping it invites
//   THE SHEET: a bottom sheet with the same collector content as the xl
//   side panel - lines, steppers, estimate, done chips. The buyer invited
//   it in, so the listings never reflow; the scrim tap, the X, Esc or
//   navigating to the full basket view send it back.
//
// Same basket state, same honesty rules as the full basket view:
//
//   - Lines are re-checked against the public API; a gone or unavailable
//     line can ride in the list but never in the estimate, and the panel
//     says so.
//   - The subtotal is labelled an estimate. The seller confirms.
//
// The cart only COLLECTS - no WhatsApp, no call, and no pay buttons: while
// the buyer shops, the cart keeps its hands out of the money and out of
// the seller's phone. Final decisions (pay, send the list, call) happen in
// the basket, reached from the basket icon in the header - the door link
// in the panel says exactly that. Comms and money both live there.
//
// RailShell also owns the shell column: on the buying views it reserves the
// strip's width (xl:pr-16) so the resting dock never covers content, and on
// the seller workspace views (publish, settings, my listings) the dock is
// simply not mounted and nothing changes.

import { useEffect, useRef, useState } from 'react'
import { Check, CheckCircle2, ChevronLeft, ChevronRight, ChevronUp, ShoppingCart, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/format'
import { useAppStore, type ViewName } from '@/lib/store'
import {
  basketCount,
  basketSubtotal,
  basketUnits,
  isShopDone,
  markShopDone,
  setLineQty,
  useBasket,
  type BasketShopInfo,
  type BasketLineInfo,
  type StoredBasket,
} from '@/lib/basket'
import { useLineStatuses, useRemoveLine } from '@/components/commerce/basket-view'
import { cn } from '@/lib/utils'
import { copy } from '@/lib/copy'

// The views where a buyer is shopping: the buying loop itself plus the two
// buyer watch surfaces (saved searches, alerts). The basket view is its own
// full checkout and does not need a cart beside it; seller views need
// the width.
const RAIL_VIEWS: ViewName[] = ['home', 'browse', 'listing', 'shop', 'saved', 'notifications']

export function RailShell({ children }: { children: React.ReactNode }) {
  const { view } = useAppStore()
  const rail = RAIL_VIEWS.includes(view.name)
  return (
    <div className={cn('flex min-h-dvh flex-col lg:ml-60', rail && 'xl:pr-16')}>
      {children}
      {rail ? <CartDock /> : null}
    </div>
  )
}

// Focus that survives the visibility transition: right after a commit the
// element may still compute as visibility:hidden (the transition's
// from-value) and a plain focus() silently no-ops. Retry on the next
// frame until the focus takes, capped so a vanished target cannot loop.
function focusWhenVisible(el: HTMLElement | null, depth = 0) {
  if (!el) return
  el.focus()
  if (document.activeElement === el || depth >= 5) return
  requestAnimationFrame(() => focusWhenVisible(el, depth + 1))
}

function CartDock() {
  const { navigate } = useAppStore()
  const basket = useBasket()
  const shopIds = Object.keys(basket.lines)
  const count = basketCount(basket)
  const units = basketUnits(basket)
  const [open, setOpen] = useState(false)

  const stripRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLElement>(null)

  const atXl = () =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches

  // Esc sends the panel and the sheet back behind their docks.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Focus follows the invitation: into the panel or sheet when it opens,
  // back to the strip or bar when it closes. Skipped on first mount - a
  // page load must not steal focus. focusWhenVisible does the landing: the
  // docks transition visibility discretely, so for one frame after the
  // commit an element that just flipped to visible still computes as
  // hidden (the transition's from-value) and a plain focus() would
  // silently no-op - it retries on the next frame until the focus takes.
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (open) {
      focusWhenVisible((atXl() ? panelRef : sheetRef).current)
    } else {
      focusWhenVisible((atXl() ? stripRef : barRef).current)
    }
  }, [open])

  // The strip and the bar answer an add the same way the top-bar basket
  // does: a WAAPI one-shot pop, only when the units grow during this visit
  // (a reload with a saved basket must not look like an add), skipped under
  // reduced motion. Only one of the two docks is on screen per breakpoint;
  // animating both is harmless.
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
      for (const el of [stripRef.current, barRef.current]) {
        el?.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.07)', offset: 0.4 },
            { transform: 'scale(1)' },
          ],
          { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
        )
      }
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
        aria-label={copy.cart.iconAria(count)}
        className={cn(
          'press fixed right-0 top-14 z-30 hidden w-16 flex-col items-center gap-1.5 rounded-l-xl border bg-card py-3 shadow-sm transition-all duration-200 motion-reduce:transition-none xl:flex',
          open ? 'invisible translate-x-full' : 'visible translate-x-0',
        )}
      >
        <ShoppingCart className="size-6 text-foreground/75" aria-hidden />
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
        aria-label={copy.cart.railAria}
        className={cn(
          'fixed bottom-4 right-0 top-14 z-30 hidden w-80 flex-col overflow-hidden rounded-l-xl border bg-card shadow-xl outline-none transition-all duration-200 motion-reduce:transition-none xl:flex',
          open ? 'visible translate-x-0' : 'invisible translate-x-full',
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <CartTitle count={count} />
          <div className="flex items-center gap-1">
            {shopIds.length > 0 ? (
              <button
                type="button"
                onClick={() => navigate({ name: 'basket' })}
                className="press rounded px-1 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                {copy.cart.openBasket}
              </button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="press size-7"
              onClick={() => setOpen(false)}
              aria-label={copy.cart.hideRail}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <CartBody basket={basket} shopIds={shopIds} />
      </aside>

      {/* Below xl the bar materialises with the first line: cart glyph and
          badge, the count in words, the running total. It rides above the
          bottom nav (which carries the safe-area inset) and hides itself
          while the sheet is open. At lg the bottom nav is gone, so the bar
          drops to the viewport edge and clears the workspace sidebar. */}
      {count > 0 ? (
        <button
          ref={barRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="cart-mobile-sheet"
          aria-label={copy.cart.iconAria(count)}
          className={cn(
            'press fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+3.75rem)] z-30 flex items-center gap-2.5 rounded-xl border bg-card py-2.5 pl-3.5 pr-3 shadow-lg transition-all duration-200 motion-reduce:transition-none lg:bottom-4 lg:left-[16.75rem] xl:hidden',
            open ? 'invisible translate-y-2 opacity-0' : 'visible translate-y-0 opacity-100',
          )}
        >
          <span className="relative flex shrink-0 items-center">
            <ShoppingCart className="size-5 text-foreground/75" aria-hidden />
            <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground tabular-nums">
              {count > 9 ? '9+' : count}
            </span>
          </span>
          <span className="text-sm font-semibold">{copy.cart.title}</span>
          <span className="text-xs text-muted-foreground">{copy.cart.itemsLabel(count)}</span>
          <span className="ml-auto flex items-center gap-1.5">
            {total && totalAmount ? (
              <span className="text-sm font-semibold tabular-nums">
                {totalSymbol} {totalAmount}
              </span>
            ) : null}
            <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
          </span>
        </button>
      ) : null}

      {/* The sheet's scrim: tap it to send the sheet back. It sits above the
          bottom nav (z-50 vs z-40) so a stray thumb cannot navigate away
          mid-review; one tap returns the buyer to exactly where they were. */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none xl:hidden',
          open ? 'visible opacity-100' : 'invisible opacity-0',
        )}
      />

      {/* The sheet: same header and body as the xl panel, docked above the
          bottom nav, capped at 70dvh so the buyer keeps their bearings. At
          lg (nav gone) it floats a hand's width off the viewport bottom. */}
      <aside
        ref={sheetRef}
        id="cart-mobile-sheet"
        tabIndex={-1}
        aria-label={copy.cart.railAria}
        className={cn(
          'fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.5rem)] z-50 mx-auto flex max-h-[70dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border bg-card shadow-xl outline-none transition-all duration-200 motion-reduce:transition-none lg:bottom-4 lg:rounded-2xl xl:hidden',
          open ? 'visible translate-y-0 opacity-100' : 'invisible translate-y-6 opacity-0',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
          <CartTitle count={count} />
          <div className="flex items-center gap-1">
            {shopIds.length > 0 ? (
              <button
                type="button"
                onClick={() => navigate({ name: 'basket' })}
                className="press rounded px-1 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                {copy.cart.openBasket}
              </button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="press size-7"
              onClick={() => setOpen(false)}
              aria-label={copy.cart.closeSheet}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <CartBody basket={basket} shopIds={shopIds} />
      </aside>
    </>
  )
}

// The cart's title cluster, shared by the xl panel and the phone sheet.
function CartTitle({ count }: { count: number }) {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold">
      <ShoppingCart className="size-4 shrink-0 text-primary" aria-hidden />
      {copy.cart.title}
      {count > 0 ? (
        <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular-nums">
          {count > 9 ? '9+' : count}
        </span>
      ) : null}
    </p>
  )
}

// The collector body, shared by the xl panel and the phone sheet: the
// empty state or one section per seller with steppers, trash, the estimate
// and the done chip. Whatever renders here stays free of comms and money -
// final decisions happen in the basket, through the header's door link.
function CartBody({ basket, shopIds }: { basket: StoredBasket; shopIds: string[] }) {
  const { navigate } = useAppStore()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      {shopIds.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <ShoppingCart className="size-8 text-muted-foreground/50" aria-hidden />
          <p className="text-sm font-medium">{copy.cart.emptyTitle}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{copy.cart.emptySub}</p>
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
