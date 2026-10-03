'use client'

// Desktop app sidebar (>=1024px) - the signed-in workspace navigation.
// Mobile keeps the bottom nav; this rail exists only on lg+ and carries the
// same eight destinations plus the two actions that deserve permanent
// placement: posting, and reaching a human on WhatsApp.
//
// Style discipline: rectangles, cream surfaces, forest-green active states.
// No curves here - the sidebar is a functional surface, not a doorway.

import {
  Home,
  Search,
  PlusCircle,
  Tag,
  Bookmark,
  Bell,
  Store,
  Settings,
  Leaf,
} from 'lucide-react'
import { WhatsAppIcon } from '@/components/commerce/brand-icons'
import { useAppStore, type ViewName } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { useBellShake } from '@/hooks/use-bell-shake'
import { apiGet } from '@/lib/client'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { copy } from '@/lib/copy'

// The WhatsApp support number is deployment configuration (SUPPORT_WHATSAPP,
// international digits without "+"). It arrives through NEXT_PUBLIC_ inlining;
// when it is not configured the help card is simply not rendered - an absent
// number must never render as a broken or fake link.
const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? ''

function supportLink(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const text = copy.nav.helpPrompt
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export function AppSidebar() {
  const { view, navigate } = useAppStore()
  const { user } = useSession()

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'badge'],
    enabled: Boolean(user),
    queryFn: () => apiGet<{ notifications: unknown[]; unreadCount: number }>('/api/notifications'),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
  const unread = user ? (notificationsQuery.data?.unreadCount ?? 0) : 0
  const bellRef = useBellShake(unread)

  const items: Array<{ name: ViewName; label: string; icon: React.ReactNode; badge?: number }> = [
    { name: 'home', label: copy.nav.home, icon: <Home aria-hidden /> },
    { name: 'browse', label: copy.nav.browse, icon: <Search aria-hidden /> },
    { name: 'publish', label: copy.nav.post, icon: <PlusCircle aria-hidden /> },
    { name: 'my-listings', label: copy.nav.myListings, icon: <Tag aria-hidden /> },
    { name: 'saved', label: copy.nav.savedSearches, icon: <Bookmark aria-hidden /> },
    {
      name: 'notifications',
      label: copy.nav.notifications,
      icon: (
        <span ref={bellRef} className="inline-flex" style={{ transformOrigin: '50% 18%' }}>
          <Bell aria-hidden />
        </span>
      ),
      badge: unread,
    },
    { name: 'account', label: copy.nav.account, icon: <Store aria-hidden /> },
    { name: 'settings', label: copy.nav.settings, icon: <Settings aria-hidden /> },
  ]

  return (
    <aside
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-card lg:flex"
    >
      {/* Brand - the same leaf + lowercase serif wordmark as the header, so
          the rail reads as part of the same shop, not a different app. */}
      <button
        type="button"
        onClick={() => navigate({ name: 'home' })}
        className="flex items-center gap-1.5 px-5 pb-2 pt-5 text-left"
        aria-label="Mudaala home"
      >
        <Leaf className="size-[18px] fill-primary/15 text-primary" aria-hidden />
        <span className="font-display text-[19px] font-bold lowercase leading-none tracking-tight text-primary">
          mudaala
        </span>
      </button>

      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Sections">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = view.name === item.name
            return (
              <li key={item.name}>
                <button
                  type="button"
                  onClick={() => navigate({ name: item.name })}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/80 hover:bg-accent hover:text-foreground',
                  )}
                >
                  <span className="[&_svg]:size-4">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="ml-auto flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-white">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="space-y-3 border-t p-3">
        {/* The one big action - posting is what this app exists for. */}
        <Button
          size="lg"
          className="w-full text-sm"
          onClick={() => navigate({ name: 'publish' })}
        >
          <PlusCircle className="size-4" aria-hidden />
          {copy.nav.postAd}
        </Button>

        {SUPPORT_WHATSAPP ? (
          // Plain wa.me link - leaves the app, opens WhatsApp. No in-app
          // messaging is offered, by design.
          <a
            href={supportLink(SUPPORT_WHATSAPP)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-md border bg-background px-3 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
          >
            <WhatsAppIcon className="size-4 shrink-0 text-primary" aria-hidden />
            <span>
              {copy.nav.helpNeed}{' '}
              <span className="font-medium text-foreground">{copy.nav.helpWhatsApp}</span>
            </span>
          </a>
        ) : null}
      </div>
    </aside>
  )
}
