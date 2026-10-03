'use client'

import { useEffect, useRef } from 'react'
import { Settings, LogOut, User, Leaf } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { useSession, useSignOut } from '@/hooks/use-session'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { basketCount, basketUnits, basketFillLevel, useBasket } from '@/lib/basket'
import { copy } from '@/lib/copy'
import { BasketGlyph } from './basket-icon'

export function AppHeader() {
  const { view, navigate, setAuthOpen } = useAppStore()
  const { user, isLoading: sessionLoading } = useSession()
  const signOut = useSignOut()
  const { toast } = useToast()

  // Desktop navigation moved to the AppSidebar rail (lg+); the header keeps
  // the brand, basket and account - the pieces that follow every scroll.

  const basket = useBasket()
  const basketItems = basketCount(basket)
  const units = basketUnits(basket)

  // Pop + badge bump fire only when the count GROWS during this visit -
  // never on first render (a page reload with a saved basket must not look
  // like an add). Both are WAAPI one-shots on DOM refs: external-system
  // mutations from an effect, no React state, no cascading render. Reduced
  // motion skips the pop and leaves the badge to simply appear.
  const iconRef = useRef<HTMLSpanElement>(null)
  const badgeRef = useRef<HTMLSpanElement>(null)
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
      iconRef.current?.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.14)', offset: 0.4 },
          { transform: 'scale(1)' },
        ],
        { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      )
      badgeRef.current?.animate(
        [
          { transform: 'scale(0.9)', opacity: 0.4 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      )
    }
  }, [units])

  return (
    <header className="sticky top-0 z-40 border-b bg-card pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <button type="button" onClick={() => navigate({ name: 'home' })} className="flex items-center gap-1.5" aria-label="Mudaala home">
          {/* The wordmark is the signboard: lowercase serif in the brand
              green, the way the market paints a good shop name - with one
              leaf for the goods that come out of the ground. No icon chip. */}
          <Leaf className="size-[18px] fill-primary/15 text-primary" aria-hidden />
          <span className="font-display text-[19px] font-bold lowercase leading-none tracking-tight text-primary">
            mudaala
          </span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          {/* The basket - buyer-side, always visible, signed in or not, and
              the way in to paying: the basket icon opens the basket, and the
              basket is where a seller gets paid. Green badge: items waiting,
              not an alarm like unread alerts. */}
          <button
            type="button"
            onClick={() => navigate({ name: 'basket' })}
            aria-label={copy.basket.iconAria(basketItems)}
            aria-current={view.name === 'basket' ? 'page' : undefined}
            className={cn(
              'press relative inline-flex size-9 items-center justify-center rounded-md',
              view.name === 'basket' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <span ref={iconRef} className="inline-flex">
              <BasketGlyph fill={basketFillLevel(units)} />
            </span>
            {basketItems > 0 ? (
              <span
                ref={badgeRef}
                className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
              >
                {basketItems > 9 ? '9+' : basketItems}
              </span>
            ) : null}
          </button>
          {sessionLoading ? (
            // Skeleton - never flash "Sign in" while the session is still
            // being checked; that fake-logged-out blink is what made refresh
            // feel like a logout.
            <span className="inline-flex h-8 w-24 items-center rounded-md bg-muted animate-pulse" aria-hidden />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="max-w-28 truncate">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs text-muted-foreground">{user.phone}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ name: 'account' })}>
                  <User className="size-4" aria-hidden /> Account & profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ name: 'settings' })}>
                  <Settings className="size-4" aria-hidden /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    signOut.mutate(undefined, {
                      onSuccess: () => toast({ title: 'Signed out' }),
                    })
                  }
                >
                  <LogOut className="size-4" aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" onClick={() => setAuthOpen(true)}>
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
