'use client'

import { Home, Search, PlusCircle, Tag, Bell } from 'lucide-react'
import { useAppStore, type ViewName } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { useBellShake } from '@/hooks/use-bell-shake'
import { apiGet } from '@/lib/client'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { copy } from '@/lib/copy'

// Mobile bottom navigation - the primary nav on affordable Android phones.
export function BottomNav() {
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
  // Mobile bell swings exactly like the desktop one - the bottom nav is the
  // primary nav on the phones this app is built for.
  const bellRef = useBellShake(unread)

  const items: Array<{ name: ViewName; label: string; icon: React.ReactNode; badge?: number }> = [
    { name: 'home', label: copy.nav.home, icon: <Home aria-hidden /> },
    { name: 'browse', label: copy.nav.browse, icon: <Search aria-hidden /> },
    { name: 'publish', label: copy.nav.post, icon: <PlusCircle aria-hidden /> },
    { name: 'my-listings', label: copy.nav.myListings, icon: <Tag aria-hidden /> },
    { name: 'notifications', label: copy.nav.notifications, icon: <Bell aria-hidden />, badge: unread },
  ]

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active = view.name === item.name
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => navigate({ name: item.name })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span className="[&_svg]:size-5">
                {item.name === 'notifications' ? (
                  <span ref={bellRef} className="inline-flex" style={{ transformOrigin: '50% 18%' }}>
                    {item.icon}
                  </span>
                ) : (
                  item.icon
                )}
              </span>
              {item.label}
              {item.badge ? (
                <span className="absolute right-[22%] top-2 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold text-white">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
