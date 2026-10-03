// Mudaala - the buyer's basket: per-shop lists that collect what the buyer
// picks while shopping, and end as ONE mobile-money payment per seller.
// Not a supermarket cart: there is no order tracking, no delivery - the
// basket holds the list and the running estimate, the pay sheet hands over
// the seller's own code or number, and the telco moves the money.
//
//   • Baskets are keyed BY SHOP (one seller fulfills one list; mixing shops
//     in one "order" would promise things no single seller can honor).
//   • Everything lives in localStorage on the buyer's phone. Buyers never
//     sign in (rule 1), so there is no server-side basket and no sync -
//     the UI says so honestly.
//   • Lines snapshot what the buyer saw (title, unit price). The basket view
//     re-checks each listing against the public API and flags what is gone,
//     expired or fulfilled before the buyer pays anything.
//
// Store shape is hand-rolled localStorage + useSyncExternalStore with an
// empty server snapshot - hydration-safe by construction (SSR renders the
// empty basket, React re-renders with the real one right after hydration,
// no mismatch warning, no hydration flash logic needed).

import { useSyncExternalStore } from 'react'
import { formatPrice } from './format'

const STORAGE_KEY = 'mudaala.basket.v1'
const MAX_LINES_PER_SHOP = 20
const MAX_QTY = 99

export interface BasketShopInfo {
  name: string
  photoUrl: string | null
  phone: string
  whatsapp: string | null
}

export interface BasketLineInfo {
  title: string
  price: number | null
  currency: string
  unit: string | null
  qty: number
}

interface StoredBasket {
  shops: Record<string, BasketShopInfo>
  lines: Record<string, Record<string, BasketLineInfo>>
  // Buyer bookkeeping, NOT basket content: shops whose list the buyer says
  // is handled (paid, called, or walked in). It resets the moment
  // that shop's lines change - the seller has not seen the new version, so
  // the queue must not claim it is done.
  doneShops?: Record<string, true>
}

const EMPTY: StoredBasket = { shops: {}, lines: {} }

// Parse-once: used ONLY at module init. The live snapshot is the cached
// `state` below - getSnapshot must return a stable reference or React will
// loop ("The result of getSnapshot should be cached").
function parseStored(): StoredBasket {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as StoredBasket
    if (!parsed || typeof parsed !== 'object' || !parsed.shops || !parsed.lines) return EMPTY
    const out: StoredBasket = { shops: parsed.shops, lines: parsed.lines }
    if (parsed.doneShops && typeof parsed.doneShops === 'object' && !Array.isArray(parsed.doneShops)) {
      out.doneShops = parsed.doneShops
    }
    return out
  } catch {
    return EMPTY
  }
}

let state: StoredBasket = typeof window === 'undefined' ? EMPTY : parseStored()
const listeners = new Set<() => void>()

function commit(next: StoredBasket) {
  state = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked - the in-memory basket still works for this
    // visit; persistence resumes when the browser allows it again.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Non-React read of the current basket - the same cached reference the hook
// hands out, for callers outside React (the test suite) and for one-off
// checks that must not subscribe. Stable across calls, like the hook.
export function readBasket(): StoredBasket {
  return state
}

// React binding. The server snapshot is the EMPTY basket, so SSR and the
// hydration pass always agree; the real basket appears immediately after.
// readBasket returns the cached module state - stable across calls.
export function useBasket(): StoredBasket {
  return useSyncExternalStore(subscribe, readBasket, () => EMPTY)
}

// Total item count across all shops - the header badge. Hydration-gated the
// same way through useBasket, so callers need no extra guard.
export function basketCount(basket: StoredBasket): number {
  return Object.values(basket.lines).reduce((total, shop) => total + Object.keys(shop).length, 0)
}

// Total UNITS (quantities summed) - what the header basket's liquid fill
// responds to. Deliberately different from the badge: the badge says how
// many DIFFERENT things are waiting; the fill says how much stuff there is,
// so tapping add twice visibly fills the basket twice.
export function basketUnits(basket: StoredBasket): number {
  return Object.values(basket.lines).reduce(
    (total, shop) => total + Object.values(shop).reduce((sum, line) => sum + line.qty, 0),
    0,
  )
}

// How full the basket glyph looks, as a fraction of the basket body. A sqrt
// curve so the FIRST item is already clearly visible (~27% of the body) and
// each later add still nudges it; capped at 0.85 - the basket never quite
// reaches the brim, per the brief. 14 units = "as full as it gets".
export function basketFillLevel(units: number): number {
  if (units <= 0) return 0
  return Math.min(0.85, Math.sqrt(units / 14))
}

// The minimum the caller must hand over. Feed blocks carry Listing & { user },
// detail pages carry ListingDetail - both satisfy this shape.
export interface BasketAddListing {
  id: string
  title: string
  price: number | null
  currency: string
  unit: string | null
  contactPhone: string
  contactWhatsapp: string | null
  type: 'OFFER' | 'REQUEST'
  user?: { id: string; name: string; profile: { businessName: string; photoUrl?: string | null } | null } | null
}

// Drop the done mark for shops whose list just changed - a sent list that
// was edited is no longer sent, as far as anyone honest can know.
function withoutDone(next: StoredBasket, shopIds: string[]): StoredBasket {
  if (!next.doneShops) return next
  const doneShops = { ...next.doneShops }
  let touched = false
  for (const shopId of shopIds) {
    if (doneShops[shopId]) {
      delete doneShops[shopId]
      touched = true
    }
  }
  return touched ? { ...next, doneShops } : next
}

/** Add one unit. REQUESTs are not buyable - the caller hides the button, the
 *  store refuses them anyway. Returns false when nothing was added. */
export function addToBasket(listing: BasketAddListing): boolean {
  if (listing.type !== 'OFFER' || !listing.user) return false
  const shopId = listing.user.id
  const shopLines = state.lines[shopId] ?? {}
  if (!shopLines[listing.id] && Object.keys(shopLines).length >= MAX_LINES_PER_SHOP) return false

  const existing = shopLines[listing.id]
  const next: StoredBasket = {
    shops: {
      ...state.shops,
      [shopId]: state.shops[shopId] ?? {
        name: listing.user.profile?.businessName?.trim() || listing.user.name,
        photoUrl: listing.user.profile?.photoUrl ?? null,
        phone: listing.contactPhone,
        whatsapp: listing.contactWhatsapp ?? listing.contactPhone,
      },
    },
    lines: {
      ...state.lines,
      [shopId]: {
        ...shopLines,
        [listing.id]: existing
          ? { ...existing, qty: Math.min(MAX_QTY, existing.qty + 1) }
          : { title: listing.title, price: listing.price, currency: listing.currency, unit: listing.unit, qty: 1 },
      },
    },
  }
  commit(withoutDone(next, [shopId]))
  return true
}

export function setLineQty(shopId: string, listingId: string, qty: number): void {
  const shopLines = { ...(state.lines[shopId] ?? {}) }
  if (qty <= 0) {
    delete shopLines[listingId]
  } else {
    const line = shopLines[listingId]
    if (!line) return
    shopLines[listingId] = { ...line, qty: Math.min(MAX_QTY, qty) }
  }
  const lines = { ...state.lines }
  if (Object.keys(shopLines).length === 0) {
    delete lines[shopId]
    const shops = { ...state.shops }
    delete shops[shopId]
    commit(withoutDone({ shops, lines }, [shopId]))
    return
  }
  commit(withoutDone({ ...state, lines: { ...lines, [shopId]: shopLines } }, [shopId]))
}

export function removeShop(shopId: string): void {
  const shops = { ...state.shops }
  const lines = { ...state.lines }
  delete shops[shopId]
  delete lines[shopId]
  commit(withoutDone({ shops, lines }, [shopId]))
}

// The undo side of a line removal: put the line back EXACTLY as it was
// (same listing key, same snapshot, same quantity), reviving the shop
// record too if the removal emptied it. Merges into an existing shop
// without touching its other lines.
//
// Deliberately does NOT re-mark the shop done: removing a line cleared the
// done mark because the seller had not seen the edited list, and the app
// never marks a list done on the buyer's behalf. If the restored line
// changes nothing for the seller, the buyer re-marks it in one tap.
export function restoreLine(shopId: string, shop: BasketShopInfo, listingId: string, line: BasketLineInfo): void {
  commit({
    ...state,
    shops: state.shops[shopId] ? state.shops : { ...state.shops, [shopId]: shop },
    lines: {
      ...state.lines,
      [shopId]: { ...(state.lines[shopId] ?? {}), [listingId]: line },
    },
  })
}

// The buyer's own bookkeeping: "this seller has my list". One tap on, one
// tap off - the app never marks a list done by itself, because only the
// buyer knows whether the payment actually went.
export function isShopDone(basket: StoredBasket, shopId: string): boolean {
  return basket.doneShops?.[shopId] === true
}

export function markShopDone(shopId: string, done: boolean): void {
  const doneShops = { ...(state.doneShops ?? {}) }
  if (done) {
    doneShops[shopId] = true
  } else {
    delete doneShops[shopId]
  }
  commit({ ...state, doneShops })
}

// Estimated subtotal - only when every priced line shares one currency (the
// normal case inside one shop). Unpriced lines just don't count toward it;
// the UI labels the number an estimate the seller confirms.
export function basketSubtotal(lines: BasketLineInfo[]): { amount: number; currency: string } | null {
  const priced = lines.filter((l) => l.price !== null)
  if (priced.length === 0) return null
  const currency = priced[0].currency
  if (priced.some((l) => l.currency !== currency)) return null
  return { amount: priced.reduce((sum, l) => sum + (l.price ?? 0) * l.qty, 0), currency }
}
