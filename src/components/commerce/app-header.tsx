'use client'

import { Store, Search, PlusCircle, Tag, Bell, Bookmark, Settings, LogOut, User } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { useSession, useSignOut } from '@/hooks/use-session'
import { apiGet } from '@/lib/client'
import { useQuery } from '@tanstack/react-query'
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

export function AppHeader() {
  const { view, navigate, setAuthOpen } = useAppStore()
  const { user } = useSession()
  const signOut = useSignOut()
  const { toast } = useToast()

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'badge'],
    enabled: Boolean(user),
    queryFn: () => apiGet<{ notifications: unknown[]; unreadCount: number }>('/api/notifications'),
    refetchInterval: 60_000,
  })
  const unread = user ? (notificationsQuery.data?.unreadCount ?? 0) : 0

  const links: Array<{ name: 'browse' | 'publish' | 'my-listings' | 'saved' | 'notifications'; label: string; icon: React.ReactNode; badge?: number }> = [
    { name: 'browse', label: 'Browse', icon: <Search className="size-4" aria-hidden /> },
    { name: 'publish', label: 'Post listing', icon: <PlusCircle className="size-4" aria-hidden /> },
    { name: 'my-listings', label: 'My listings', icon: <Tag className="size-4" aria-hidden /> },
    { name: 'saved', label: 'Saved searches', icon: <Bookmark className="size-4" aria-hidden /> },
    { name: 'notifications', label: 'Alerts', icon: <Bell className="size-4" aria-hidden />, badge: unread },
  ]

  return (
    <header className="sticky top-0 z-40 border-b bg-card">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <button type="button" onClick={() => navigate({ name: 'browse' })} className="flex items-center gap-2" aria-label="Commerce OS home">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Store className="size-4" aria-hidden />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Commerce OS</span>
        </button>

        <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <button
              key={link.name}
              type="button"
              onClick={() => navigate({ name: link.name })}
              aria-current={view.name === link.name ? 'page' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                view.name === link.name ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {link.icon}
              {link.label}
              {link.badge ? (
                <span className="ml-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                  {link.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
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
