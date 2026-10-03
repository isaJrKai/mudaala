'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, ArrowLeft, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { apiGet, apiPost, apiDelete } from '@/lib/client'
import type { NotificationT } from '@/lib/client'
import { timeAgo } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { ListingListSkeleton } from './skeletons'
import { EmptyState } from './empty-state'
import { ErrorState } from './listings-browse'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { copy } from '@/lib/copy'

// Notifications - real events only: new matches for saved searches,
// expiry warnings and expiry confirmations for the user's own listings.
export function NotificationsView() {
  const { user, isLoading: sessionLoading } = useSession()
  const { navigate } = useAppStore()
  const queryClient = useQueryClient()
  const [confirmClear, setConfirmClear] = useState(false)

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

  // Clear = delete, not read. The server removes the rows; the confirm
  // dialog is what makes that honest - the button alone could be a mis-tap
  // that silently deletes a seller's expiry history.
  const clearAll = useMutation({
    mutationFn: () => apiDelete<{ ok: boolean }>('/api/notifications?ids=all'),
    onSuccess: () => {
      setConfirmClear(false)
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  if (sessionLoading) return <ListingListSkeleton count={3} />

  if (!user) {
    return (
      <EmptyState
        title={copy.alerts.signInTitle}
        description={copy.alerts.signInSub}
        action={<Button onClick={() => useAppStore.getState().setAuthOpen(true)}>{copy.nav.signIn}</Button>}
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
          <Button variant="ghost" size="sm" className="-ml-2 gap-1 press lg:hidden" onClick={() => navigate({ name: 'browse' })}>
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">{copy.nav.notifications}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {unreadCount > 0 ? (
            <Button size="sm" variant="outline" className="gap-1.5 press" onClick={() => markRead.mutate('all')} disabled={markRead.isPending}>
              <CheckCheck className="size-4" aria-hidden /> Mark all read
            </Button>
          ) : null}
          {notifications.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 px-2 text-muted-foreground hover:text-destructive press"
              aria-label="Clear all alerts"
              title="Clear all alerts"
              onClick={() => setConfirmClear(true)}
              disabled={clearAll.isPending}
            >
              <Trash2 className="size-4" aria-hidden />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          ) : null}
        </div>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          title={copy.alerts.emptyTitle}
          description={copy.alerts.emptySub}
          action={<Button onClick={() => navigate({ name: 'saved' })}>{copy.alerts.goSaved}</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n, i) => (
            <li
              key={n.id}
              className="animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDuration: '300ms', animationDelay: `${Math.min(i, 8) * 40}ms`, animationFillMode: 'both' }}
            >
              <button
                type="button"
                onClick={() => openNotification(n)}
                className={cn(
                  'press w-full rounded-lg border bg-card p-3.5 text-left transition-colors hover:border-input/80',
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

      {/* Clear is the destructive sibling of mark-read: confirm first, say
          plainly what is lost, keep the wording honest. */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.alerts.clearTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.alerts.clearBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                clearAll.mutate()
              }}
            >
              {clearAll.isPending ? copy.alerts.clearing : copy.alerts.clearGo}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
