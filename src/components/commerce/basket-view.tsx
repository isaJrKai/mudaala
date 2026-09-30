'use client'

// The basket view — the Duuka-native "checkout": one list per shop, and
// sending it means opening WhatsApp with the whole list pre-written. No
// payment, no order tracking, no login — the seller's WhatsApp inbox is the
// order inbox, which is exactly where they already answer customers.
//
// Honesty rules enforced here:
//   • Every line is re-checked against the public listing API; gone/expired/
//     fulfilled items are flagged before the buyer sends anything.
//   • The subtotal is labelled an estimate — the seller confirms.
//   • The basket lives on this phone (localStorage), and the UI says so.

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Minus, Phone, Plus, ShoppingBasket, Store, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/client'
import type { ListingDetail } from '@/lib/client'
import { formatPrice, telLink } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import {
  addToBasket,
  basketSubtotal,
  orderWhatsAppHref,
  removeShop,
  setLineQty,
  useBasket,
  type BasketAddListing,
  type BasketShopInfo,
  type BasketLineInfo,
} from '@/lib/basket'
import { useToast } from '@/hooks/use-toast'
import { EmptyState } from './empty-state'
import { cn } from '@/lib/utils'

// Shared add handler for every surface that sells (blocks, detail page):
// one honest toast either way — never a silent no-op, never a fake success.
// Returns whether the add actually happened, so the button can show its
// "added" flash ONLY when the basket really changed.
export function useAddToBasket() {
  const { toast } = useToast()
  return (listing: BasketAddListing): boolean => {
    if (addToBasket(listing)) {
      toast({
        title: 'Added to basket',
        description: 'Basket is in the top bar — send the whole list to the shop when you are ready.',
      })
      return true
    }
    toast({
      title: 'Could not add that',
      description: 'A shop list holds at most 20 items — open the basket and remove something first.',
      variant: 'destructive',
    })
    return false
  }
}

// The brief "added" flash on an add button: true for ~1.2s after a REAL
// success, then back. Callers render a check (or "Added") while it is up —
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

// Live status per line — the public detail endpoint, one call per line.
// A basket holds at most 20 lines per shop, so this stays light. 'GONE'
// covers 404 (deleted); anything not ACTIVE is flagged as unavailable.
function useLineStatuses(shopId: string, ids: string[]) {
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

export function BasketView() {
  const { navigate } = useAppStore()
  const basket = useBasket()
  const shopIds = Object.keys(basket.lines)

  if (shopIds.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBasket />}
        title="Your basket is empty"
        description="Collect what you want as you browse — then send the whole list to the shop as one WhatsApp message. No account needed: the basket lives on this phone."
        action={<Button onClick={() => navigate({ name: 'browse' })}>Browse listings</Button>}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Basket</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your list lives on this phone. {shopIds.length > 1 ? 'One message per shop — sellers only see their own list.' : 'Send it and the seller confirms what is available.'}
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
  const entries = Object.entries(lines)
  const ids = entries.map(([id]) => id)
  const statuses = useLineStatuses(shopId, ids)

  const fresh = entries.filter(([id]) => !statuses.data || statuses.data[id] === 'ACTIVE')
  const stale = entries.filter(([id]) => statuses.data && statuses.data[id] !== 'ACTIVE')
  const sendable = statuses.isLoading ? entries : fresh
  const sendableLines = sendable.map(([, line]) => line)
  const subtotal = basketSubtotal(sendableLines)

  return (
    <section className="overflow-hidden rounded-lg border bg-card" aria-label={`Basket for ${shop.name}`}>
      {/* Shop header — taps through, because buyers often want the full
          catalogue next to their list. */}
      <button
        type="button"
        onClick={() => navigate({ name: 'shop', id: shopId })}
        className="press flex w-full items-center gap-2.5 border-b px-4 py-3 text-left hover:bg-secondary/50"
        aria-label={`Open shop: ${shop.name}`}
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
          <span className="block truncate text-xs text-muted-foreground">
            {entries.length} {entries.length === 1 ? 'item' : 'items'} on your list
          </span>
        </span>
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
                  aria-label={`Open listing: ${line.title}`}
                >
                  {line.title}
                </button>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {line.price !== null ? formatPrice(line.price, null, line.currency) : 'Price on asking'}
                  {line.unit ? ` · per ${line.unit}` : ''}
                </p>
                {gone ? (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-800">
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                    {status === 'GONE' ? 'Removed from Duuka — take it off your list.' : 'No longer available — the seller may have sold out.'}
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
                  aria-label={`One less ${line.title}`}
                >
                  <Minus className="size-3.5" aria-hidden />
                </Button>
                <span className="min-w-6 text-center text-sm font-semibold" aria-label={`Quantity of ${line.title}: ${line.qty}`}>
                  {line.qty}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="press size-7"
                  onClick={() => setLineQty(shopId, listingId, line.qty + 1)}
                  aria-label={`One more ${line.title}`}
                >
                  <Plus className="size-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {/* Footer — the send. Stale lines stay visible but never ride along in
          the message: the buyer sees exactly what will be asked for. */}
      <div className="space-y-2 border-t bg-secondary/40 px-4 py-3">
        {stale.length > 0 ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-800">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {sendable.length === 0
              ? 'Nothing on this list is available right now — remove the items or check the shop later.'
              : `${stale.length} of ${entries.length} items will NOT be included — they are no longer available.`}
          </p>
        ) : null}

        {subtotal ? (
          <p className="text-sm">
            <span className="font-semibold">{formatPrice(subtotal.amount, null, subtotal.currency)}</span>{' '}
            <span className="text-xs text-muted-foreground">estimate — the seller confirms the final total</span>
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          {shop.whatsapp && sendable.length > 0 ? (
            <Button asChild className="press h-10 flex-1 bg-emerald-700 text-white hover:bg-emerald-800">
              <a
                href={orderWhatsAppHref(shop, sendableLines)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Send your list of ${sendable.length} items to ${shop.name} on WhatsApp`}
              >
                <MessageCircle className="size-4" aria-hidden /> Send list on WhatsApp
              </a>
            </Button>
          ) : null}
          {sendable.length === 0 ? (
            <Button className="h-10 flex-1" disabled>
              <MessageCircle className="size-4" aria-hidden /> Nothing to send
            </Button>
          ) : null}
          {!shop.whatsapp && sendable.length > 0 ? (
            <p className="flex-1 self-center text-xs text-muted-foreground">
              This shop has no WhatsApp on the listing — call with your list instead.
            </p>
          ) : null}
          <Button asChild variant="outline" className="press h-10 flex-1" disabled={sendable.length === 0}>
            <a href={telLink(shop.phone)} aria-label={`Call ${shop.name} about your list`}>
              <Phone className="size-4" aria-hidden /> Call with list
            </a>
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="press h-8 gap-1.5 text-muted-foreground hover:text-destructive"
          onClick={() => removeShop(shopId)}
        >
          <Trash2 className="size-3.5" aria-hidden /> Clear this list
        </Button>
      </div>
    </section>
  )
}
