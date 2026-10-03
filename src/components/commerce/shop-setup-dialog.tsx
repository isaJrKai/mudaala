'use client'

// First-run seller onboarding. When someone signs in and their shop is still
// missing details, we show ONE warm, dismissible welcome: what a shop space
// is, what to fill in, and a one-tap path there. "Later" remembers the
// choice on this device - the dialog never nags twice.
//
// The open state is fully DERIVED (no effect-driven setState): the profile
// query resolves after hydration, so the SSR markup and the first client
// render always agree (closed).

import { useState, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Camera, Clock, FileText, MapPin, Store } from 'lucide-react'
import { WhatsAppIcon } from '@/components/commerce/brand-icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiGet } from '@/lib/client'
import type { ShopChecklistT } from '@/lib/client'
import { useAppStore } from '@/lib/store'
import { useSession } from '@/hooks/use-session'

const DISMISS_KEY = 'mudaala_shop_setup_dismissed'

// localStorage as an external store - server snapshot says "not dismissed",
// which matches the post-hydration render (queries have not resolved yet).
const dismissStore = {
  subscribe(onChange: () => void): () => void {
    window.addEventListener('storage', onChange)
    return () => window.removeEventListener('storage', onChange)
  },
  getSnapshot(): boolean {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  },
  getServerSnapshot(): boolean {
    return false
  },
}

// Friendly one-line asks for each missing shop detail.
const TODO_COPY: Record<keyof ShopChecklistT, { label: string; hint: string; icon: React.ReactNode }> = {
  photo: { label: 'Add a shop photo', hint: 'a real front photo builds trust', icon: <Camera className="size-4" aria-hidden /> },
  description: { label: 'Say what you sell', hint: 'one or two honest lines are enough', icon: <FileText className="size-4" aria-hidden /> },
  area: { label: 'Say where you are', hint: 'area and town', icon: <MapPin className="size-4" aria-hidden /> },
  hours: { label: 'Add opening hours', hint: 'buyers want to know when to come', icon: <Clock className="size-4" aria-hidden /> },
  whatsapp: { label: 'Add a WhatsApp number', hint: 'more buyers reach you there', icon: <WhatsAppIcon className="size-4" aria-hidden /> },
}

export function ShopSetupDialog() {
  const { user } = useSession()
  const navigate = useAppStore((s) => s.navigate)
  // `closed` only ever changes from a user action (Later / Set up / close) -
  // never from an effect.
  const [closed, setClosed] = useState(false)
  const dismissed = useSyncExternalStore(dismissStore.subscribe, dismissStore.getSnapshot, dismissStore.getServerSnapshot)

  const { data } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiGet<{ profile: unknown; checklist: ShopChecklistT; complete: boolean }>('/api/profile'),
    enabled: Boolean(user),
    staleTime: 60_000,
  })

  const open = Boolean(user) && data?.complete === false && !dismissed && !closed

  const missing = data
    ? (Object.keys(TODO_COPY) as (keyof ShopChecklistT)[]).filter((k) => !data.checklist[k]).slice(0, 3)
    : []

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore
    }
    setClosed(true)
  }

  if (!user) return null

  const firstName = user.name.split(' ')[0]

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setClosed(false) : dismiss())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Store className="size-5 shrink-0 text-primary" aria-hidden />
            Welcome to Mudaala, {firstName}
          </DialogTitle>
          <DialogDescription className="text-left">
            Your shop space is ready. Buyers see everything you sell here. Three quick things make buyers trust it:
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2" aria-label="What to add to your shop">
          {missing.map((key) => (
            <li key={key} className="flex items-start gap-2.5 rounded-md border bg-secondary/30 px-3 py-2.5">
              <span className="mt-0.5 text-primary">{TODO_COPY[key].icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{TODO_COPY[key].label}</p>
                <p className="text-xs text-muted-foreground">{TODO_COPY[key].hint}</p>
              </div>
            </li>
          ))}
        </ul>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={dismiss} className="sm:order-1">
            Later
          </Button>
          <Button
            type="button"
            className="sm:order-2"
            onClick={() => {
              dismiss()
              navigate({ name: 'account' })
            }}
          >
            Set up my shop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
