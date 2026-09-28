'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiGet, apiPost } from '@/lib/client'
import type { NotificationT } from '@/lib/client'
import { timeAgo } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { ListingListSkeleton } from './skeletons'
import { EmptyState } from './empty-state'
import { ErrorState } from './listings-browse'
import { cn } from '@/lib/utils'

// Notifications — real events only: new matches for saved searches,
// expiry warnings and expiry confirmations for the user's own listings.
export function NotificationsView() {
  const { user, isLoading: sessionLoading } = useSession()
  const { navigate } = useAppStore()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['notifications', 'list'],
    enabled: Boolean(user),
    queryFn: () => apiGet<{ notifications: NotificationT[]; unreadCount: number }>('/api/notifications'),
  })

  const markRead = useMutation({
    mutationFn: (ids: string) => apiPost<{ ok: boolean }>(`/api/notifications/mark-read?ids=${ids}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  if (sessionLoading) return <ListingListSkeleton count={3} />

  if (!user) {
    return (
      <EmptyState
        icon={<Bell />}
        title="Sign in to see alerts"
        description="Alerts appear here when new listings match your saved searches, and when your own listings are expiring or expired."
        action={<Button onClick={() => useAppStore.getState().setAuthOpen(true)}>Sign in</Button>}
      />
    )
  }

  if (isLoading) return <ListingListSkeleton count={3} />
  if (isError) return <ErrorState message={error instanceof Error ? error.message : 'Could not load notifications'} onRetry={() => refetch()} />

  const notifications = data?.notifications ?? []
  const unreadCount = data?.unreadCount ?? 0

  function openNotification(n: NotificationT) {
    if (!n.read) markRead.mutate(n.id)
    if (n.listingId) navigate({ name: 'listing', id: n.listingId })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1 lg:hidden" onClick={() => navigate({ name: 'browse' })}>
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">Alerts</h1>
        </div>
        {unreadCount > 0 ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => markRead.mutate('all')} disabled={markRead.isPending}>
            <CheckCheck className="size-4" aria-hidden /> Mark all read
          </Button>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title="No alerts yet"
          description="Save a search on Browse and you will be alerted here when a matching listing is posted."
          action={<Button onClick={() => navigate({ name: 'saved' })}>Go to saved searches</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => openNotification(n)}
                className={cn(
                  'w-full rounded-lg border bg-card p-3.5 text-left transition-colors hover:border-input/80',
                  !n.read && 'border-l-4 border-l-primary',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={cn('text-sm', n.read ? 'font-medium' : 'font-semibold')}>
                    {!n.read ? <span className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle" aria-label="Unread" /> : null}
                    {n.title}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
