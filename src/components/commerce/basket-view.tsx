'use client'

// The basket view - the upper surface where final decisions happen: paying
// each seller through the mobile-money pay sheet, and talking to them about
// this exact list (WhatsApp or call). The quiet collecting while the buyer
// shops lives in the cart dock; this page is where the list turns into a
// decision.
//
// Honesty rules enforced here:
//   • Every line is re-checked against the public listing API; gone/expired/
//     fulfilled items are flagged before the buyer pays or sends anything.
//   • The subtotal is labelled an estimate - the seller confirms.
//   • The basket lives on this phone (localStorage), and the UI says so.

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, CheckCircle2, Minus, Phone, Plus, Smartphone, Store, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToastAction } from '@/components/ui/toast'
import { PaySheet } from '@/components/commerce/pay-sheet'
import { WhatsAppIcon } from '@/components/commerce/brand-icons'
import { apiGet } from '@/lib/client'
import type { ListingDetail, ShopPage } from '@/lib/client'
import { formatPrice, telLink } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import {
  addToBasket,
  basketCount,
  basketSubtotal,
  isShopDone,
  markShopDone,
  orderWhatsAppHref,
  removeShop,
  restoreLine,
  setLineQty,
  useBasket,
  type BasketAddListing,
  type BasketShopInfo,
  type BasketLineInfo,
} from '@/lib/basket'
import { useToast } from '@/hooks/use-toast'
import { EmptyState } from './empty-state'
import { cn } from '@/lib/utils'
import { copy } from '@/lib/copy'

// Shared add handler for every surface that sells (blocks, detail page):
// one honest toast either way - never a silent no-op, never a fake success.
// Returns whether the add actually happened, so the button can show its
// "added" flash ONLY when the basket really changed.
export function useAddToBasket() {
  const { toast } = useToast()
  return (listing: BasketAddListing): boolean => {
    if (addToBasket(listing)) {
      toast({
        title: 'Added to cart',
        description: copy.basket.topBarHint,
      })
      return true
    }
    toast({
      title: 'Could not add that',
      description: copy.basket.listCapHint,
      variant: 'destructive',
    })
    return false
  }
}

// The brief "added" flash on an add button: true for ~1.2s after a REAL
// success, then back. Callers render a check (or "Added") while it is up -
// feedback the interface heard you, without stealing the toast's job.
export function useAddedFlash(): [boolean, (ok: boolean) => void] {
  const [added, setAdded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const flash = (ok: boolean) => {
    if (!ok) return
    setAdded(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setAdded(false), 1_200)
  }
  return [added, flash]
}

// Live status per line - the public detail endpoint, one call per line.
// A basket holds at most 20 lines per shop, so this stays light. 'GONE'
// covers 404 (deleted); anything not ACTIVE is flagged as unavailable.
// Exported because the desktop basket rail runs the SAME query (same key,
// so React Query serves both surfaces from one fetch) and the honesty rule
// travels with it: nothing ships to WhatsApp without this check.
export function useLineStatuses(shopId: string, ids: string[]) {
  return useQuery({
    queryKey: ['basket-check', shopId, ids.join(',')],
    enabled: ids.length > 0,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await apiGet<{ listing: Pick<ListingDetail, 'status'> }>(`/api/listings/${id}`)
            return [id, res.listing.status] as const
          } catch {
            return [id, 'GONE'] as const
          }
        }),
      )
      return Object.fromEntries(entries) as Record<string, string>
    },
  })
}

// The exit for ONE item. The minus stepper changes quantity (it stops at 1
// so a mashed button never empties a list); the trash removes exactly this
// line. And because the basket exists only on this phone - there is no
// server copy to fall back on - a mis-tap on a small target must not be
// permanent: the toast hands the exact line back for a few seconds, same
// quantity, same snapshot, shop card revived if it was the last line.
// Exported because the rail panel removes lines through the same door.
export function useRemoveLine() {
  const { toast } = useToast()
  return (shopId: string, listingId: string, shop: BasketShopInfo, line: BasketLineInfo) => {
    setLineQty(shopId, listingId, 0)
    toast({
      title: copy.basket.removed(line.title),
      duration: 6_000,
      action: (
        <ToastAction
          altText={copy.basket.undoAria(line.title)}
          onClick={() => restoreLine(shopId, shop, listingId, line)}
        >
          {copy.basket.undo}
        </ToastAction>
      ),
    })
  }
}

export function BasketView() {
  const { navigate } = useAppStore()
  const basket = useBasket()
  const shopIds = Object.keys(basket.lines)

  if (shopIds.length === 0) {
    return (
      <EmptyState
        title={copy.basket.emptyTitle}
        description={copy.basket.emptySub}
        action={<Button onClick={() => navigate({ name: 'browse' })}>{copy.basket.browse}</Button>}
      />
    )
  }

  // The queue at a glance: how many sellers, how many things, and (when the
  // whole basket speaks one currency) one combined estimate. The waiting
  // line is the gentle pull: sellers who have not been handled yet.
  const allLines = shopIds.flatMap((shopId) => Object.values(basket.lines[shopId]))
  const combined = basketSubtotal(allLines)
  const doneCount = shopIds.filter((shopId) => isShopDone(basket, shopId)).length
  const waiting = shopIds.length - doneCount

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{copy.basket.title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {shopIds.length > 1 ? copy.basket.viewSubMany : copy.basket.viewSubOne}
        </p>
      </div>

      <div className="rounded-lg border bg-secondary/40 px-4 py-3">
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <p className="text-sm font-semibold tabular-nums">{shopIds.length}</p>
            <p className="text-xs text-muted-foreground">{copy.basket.statSellers}</p>
          </div>
          <div>
            <p className="text-sm font-semibold tabular-nums">{basketCount(basket)}</p>
            <p className="text-xs text-muted-foreground">{copy.basket.statItems}</p>
          </div>
          {combined ? (
            <div>
              <p className="text-sm font-semibold tabular-nums">{formatPrice(combined.amount, null, combined.currency)}</p>
              <p className="text-xs text-muted-foreground">{copy.basket.statTotal}</p>
            </div>
          ) : (
            <div className="max-w-48">
              <p className="text-xs font-medium leading-snug">{copy.basket.totalMixed}</p>
            </div>
          )}
        </div>
        <p
          className={cn(
            'mt-2.5 flex items-center gap-1.5 text-xs',
            waiting === 0 ? 'font-medium text-emerald-700' : 'text-muted-foreground',
          )}
        >
          {waiting === 0 ? <CheckCircle2 className="size-3.5 shrink-0" aria-hidden /> : null}
          {waiting === 0 ? copy.basket.waitingNone : waiting === 1 ? copy.basket.waitingOne : copy.basket.waitingMany(waiting)}
        </p>
      </div>

      {shopIds.map((shopId, i) => (
        <div
          key={shopId}
          className="animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none motion-reduce:slide-in-from-bottom-0"
          style={{ animationDuration: '300ms', animationDelay: `${Math.min(i, 3) * 40}ms`, animationFillMode: 'both' }}
        >
          <BasketShopSection shopId={shopId} shop={basket.shops[shopId]} lines={basket.lines[shopId]} />
        </div>
      ))}
    </div>
  )
}

// The qty number answers the stepper itself: a small scale pulse on every
// change, so the eye finds the number that just moved. WAAPI one-shot on a
// ref - external-system mutation, no React state, no cascading render.
function QtyNumber({ qty, title }: { qty: number; title: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prevRef = useRef<number | null>(null)
  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = qty
    if (prev === null || prev === qty) return
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    ref.current?.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.25)', offset: 0.5 },
        { transform: 'scale(1)' },
      ],
      { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    )
  }, [qty])
  return (
    <span
      ref={ref}
      className="inline-block min-w-6 text-center text-sm font-semibold"
      aria-label={`Quantity of ${title}: ${qty}`}
    >
      {qty}
    </span>
  )
}

function BasketShopSection({
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
  const [payOpen, setPayOpen] = useState(false)
  const entries = Object.entries(lines)
  const ids = entries.map(([id]) => id)
  const statuses = useLineStatuses(shopId, ids)

  // The pay sheet runs on FRESH shop data, never on the basket's snapshot:
  // a merchant code is exactly the thing a buyer should see as it is NOW.
  // Same query key the shop page uses, so one fetch warms both surfaces. If
  // the fetch fails the sheet still opens on the P2P path with the phone
  // the basket already holds - the number cannot go stale, it is the shop's
  // own line.
  const payQuery = useQuery({
    queryKey: ['shop', shopId],
    queryFn: () => apiGet<ShopPage>(`/api/shops/${shopId}`),
    enabled: payOpen,
    staleTime: 60_000,
  })

  const fresh = entries.filter(([id]) => !statuses.data || statuses.data[id] === 'ACTIVE')
  const stale = entries.filter(([id]) => statuses.data && statuses.data[id] !== 'ACTIVE')
  const sendable = statuses.isLoading ? entries : fresh
  const sendableLines = sendable.map(([, line]) => line)
  const subtotal = basketSubtotal(sendableLines)

  // The subtotal flash - Mudaala's answer to the ticker-tape cue: when the
  // number moves because the buyer edited a quantity, it flashes green for
  // "went up" and the warm red for "went down", then settles. Direction,
  // read at a glance without parsing digits. WAAPI on a ref (no re-render,
  // no state), guarded for reduced motion like every other mover here.
  const subtotalRef = useRef<HTMLSpanElement>(null)
  const prevAmountRef = useRef<number | null>(null)
  const subtotalAmount = subtotal?.amount ?? null
  useEffect(() => {
    const prev = prevAmountRef.current
    prevAmountRef.current = subtotalAmount
    if (subtotalAmount === null || prev === null || prev === subtotalAmount) return
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = subtotalRef.current
    if (!el) return
    const settle = getComputedStyle(el).color
    const flash = subtotalAmount > prev ? '#047857' : 'var(--destructive)'
    el.animate(
      [
        { color: flash, offset: 0 },
        { color: flash, offset: 0.55 },
        { color: settle, offset: 1 },
      ],
      { duration: 900, easing: 'ease-out' },
    )
  }, [subtotalAmount])

  return (
    <section className="overflow-hidden rounded-lg border bg-card" aria-label={copy.basket.shopListAria(shop.name)}>
      {/* Shop header - taps through, because buyers often want the full
          catalogue next to their list. */}
      <button
        type="button"
        onClick={() => navigate({ name: 'shop', id: shopId })}
        className="press flex w-full items-center gap-2.5 border-b px-4 py-3 text-left hover:bg-secondary/50"
        aria-label={copy.basket.openShopAria(shop.name)}
      >
        {shop.photoUrl ? (
          <img src={shop.photoUrl} alt="" className="size-9 shrink-0 rounded-full border object-cover" />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
            {shop.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
            <Store className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> {shop.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground tabular-nums">
            {copy.basket.itemsOnList(entries.length)}
          </span>
        </span>
        {done ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            <Check className="size-3" aria-hidden /> {copy.basket.doneChip}
          </span>
        ) : null}
      </button>

      <ul className="divide-y">
        {entries.map(([listingId, line]) => {
          const status = statuses.data?.[listingId]
          const gone = status !== undefined && status !== 'ACTIVE'
          return (
            <li key={listingId} className={cn('flex items-start gap-2 px-4 py-2.5', gone && 'bg-amber-50/60')}>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => navigate({ name: 'listing', id: listingId })}
                  className="block max-w-full truncate text-left text-sm font-medium hover:underline"
                  aria-label={copy.basket.openLineAria(line.title)}
                >
                  {line.title}
                </button>
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {line.price !== null ? formatPrice(line.price, null, line.currency) : copy.basket.priceOnAsking}
                  {line.unit ? ` · per ${line.unit}` : ''}
                </p>
                {gone ? (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-800">
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                    {status === 'GONE' ? copy.basket.goneRemoved : copy.basket.goneUnavailable}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="press size-7"
                  disabled={line.qty <= 1}
                  onClick={() => setLineQty(shopId, listingId, line.qty - 1)}
                  aria-label={copy.basket.oneLessAria(line.title)}
                >
                  <Minus className="size-3.5" aria-hidden />
                </Button>
                <QtyNumber qty={line.qty} title={line.title} />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="press size-7"
                  onClick={() => setLineQty(shopId, listingId, line.qty + 1)}
                  aria-label={copy.basket.oneMoreAria(line.title)}
                >
                  <Plus className="size-3.5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="press size-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeLine(shopId, listingId, shop, line)}
                  aria-label={copy.basket.removeLineAria(line.title)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {/* Footer - the final decisions. Pay is the hero action; talking to
          the seller about this exact list is the other decision, so the
          fresh list goes to their WhatsApp and their line. Stale lines
          stay visible but never ride in the estimate or the message. */}
      <div className="space-y-2 border-t bg-secondary/40 px-4 py-3">
        {stale.length > 0 ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-800">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {sendable.length === 0
              ? copy.basket.staleNoneNote
              : copy.basket.staleSomeNote(stale.length, entries.length)}
          </p>
        ) : null}

        {subtotal ? (
          <p className="text-sm tabular-nums">
            <span ref={subtotalRef} className="inline-block font-semibold">{formatPrice(subtotal.amount, null, subtotal.currency)}</span>{' '}
            <span className="text-xs text-muted-foreground">{copy.basket.estimateNote}</span>
          </p>
        ) : null}

        {sendable.length > 0 ? (
          <Button
            type="button"
            className="press h-10 w-full"
            onClick={() => setPayOpen(true)}
            aria-label={copy.pay.openAria(shop.name)}
          >
            <Smartphone className="size-4" aria-hidden /> {copy.pay.open}
          </Button>
        ) : (
          <Button className="h-10 w-full" disabled>
            <Smartphone className="size-4" aria-hidden /> {copy.basket.nothingReadyToPay}
          </Button>
        )}

        {sendable.length > 0 && shop.whatsapp ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              asChild
              variant="outline"
              className="press h-10 flex-1 border-emerald-600 text-[13px] text-emerald-800 hover:bg-emerald-50"
            >
              <a
                href={orderWhatsAppHref(shop, sendableLines)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={copy.basket.sendListAria(sendable.length, shop.name)}
              >
                <WhatsAppIcon className="size-4" aria-hidden /> {copy.basket.sendList}
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="press h-10 flex-1 text-[13px]"
            >
              <a href={telLink(shop.phone)} aria-label={copy.basket.callWithListAria(shop.name)}>
                <Phone className="size-4" aria-hidden /> {copy.basket.callWithList}
              </a>
            </Button>
          </div>
        ) : null}
        {sendable.length > 0 && !shop.whatsapp ? (
          <p className="text-center text-xs text-muted-foreground">{copy.basket.noWhatsappNote}</p>
        ) : null}
        {sendable.length === 0 ? (
          <Button variant="outline" className="h-10 w-full" disabled>
            <WhatsAppIcon className="size-4" aria-hidden /> {copy.basket.nothingToSend}
          </Button>
        ) : null}

        {/* The pay sheet opens on FRESH shop data, never the basket's
            snapshot - a merchant code is exactly the thing a buyer should
            see as it is NOW. Same query key the shop page uses, so one
            fetch warms both surfaces. If the fetch fails the sheet still
            opens on the P2P path with the phone the basket already holds:
            the number cannot go stale, it is the shop's own line. */}
        {payOpen && !payQuery.isLoading ? (
          <PaySheet
            open={payOpen}
            onOpenChange={setPayOpen}
            shopName={shop.name}
            phone={payQuery.data?.shop.phone ?? shop.phone}
            merchantCode={payQuery.data?.shop.momoMerchantCode ?? null}
            network={payQuery.data?.shop.momoNetwork ?? null}
            merchantName={payQuery.data?.shop.momoMerchantName ?? null}
            estimate={subtotal}
          />
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'press h-8 gap-1.5',
              done ? 'text-emerald-700 hover:text-emerald-800' : 'text-muted-foreground hover:text-emerald-700',
            )}
            onClick={() => markShopDone(shopId, !done)}
            aria-label={done ? copy.basket.doneUndoAria(shop.name) : copy.basket.markDoneAria(shop.name)}
          >
            {done ? <CheckCircle2 className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
            {done ? copy.basket.doneChip : copy.basket.markDone}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="press h-8 gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={() => removeShop(shopId)}
          >
            <Trash2 className="size-3.5" aria-hidden /> {copy.basket.clearList}
          </Button>
        </div>
      </div>
    </section>
  )
}
