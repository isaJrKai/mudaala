'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Pencil, CheckCircle2, RotateCcw, Archive, Trash2, Camera } from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/client'
import type { Listing } from '@/lib/client'
import { REFRESH_COOLDOWN_HOURS, LISTING_ACTIVE_DAYS } from '@/lib/constants'
import { expiryLabel, timeAgo } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { cn } from '@/lib/utils'
import { copy } from '@/lib/copy'
import { ListingCard } from './listing-card'
import { ListingListSkeleton } from './skeletons'
import { EmptyState } from './empty-state'
import { ErrorState } from './listings-browse'
import { useState } from 'react'

// The owner's control panel for each listing: refresh, edit, fulfil, repost, delete.
export function MyListings() {
  const { user, isLoading: sessionLoading } = useSession()
  const { navigate } = useAppStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null)
  // Which row is running which action, so one seller's Refresh never greys
  // out the buttons on every OTHER listing (the old shared isPending did
  // exactly that). Same-row buttons pause together - one listing shouldn't
  // race two status changes against itself.
  const [activeAction, setActiveAction] = useState<{ id: string; key: string } | null>(null)
  // The expiry label of the just-refreshed listing flashes green (remounted
  // via key so the CSS animation replays on every refresh).
  const [expiryFlash, setExpiryFlash] = useState<{ id: string; tick: number } | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-listings'],
    enabled: Boolean(user),
    queryFn: () => apiGet<{ listings: Listing[] }>('/api/my/listings'),
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['my-listings'] })
    await queryClient.invalidateQueries({ queryKey: ['listings'] })
  }

  const refreshMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ listing: Listing }>(`/api/listings/${id}/refresh`),
    onMutate: (id: string) => setActiveAction({ id, key: 'refresh' }),
    onSuccess: (_data, id: string) => {
      void invalidate()
      setExpiryFlash({ id, tick: Date.now() })
      toast({ title: copy.mySales.refreshedToast, description: copy.mySales.refreshedToastSub(LISTING_ACTIVE_DAYS) })
    },
    onError: (err: Error) => toast({ title: copy.mySales.couldNotRefresh, description: err.message, variant: 'destructive' }),
    onSettled: () => setActiveAction(null),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch<{ listing: Listing }>(`/api/listings/${id}`, { status }),
    onMutate: ({ id, status }) => setActiveAction({ id, key: `status:${status}` }),
    onSuccess: (_data, vars) => {
      void invalidate()
      toast({ title: vars.status === 'FULFILLED' ? copy.mySales.statusFulfilled : vars.status === 'ACTIVE' ? copy.mySales.statusActive : copy.mySales.statusArchived })
    },
    onError: (err: Error) => toast({ title: copy.mySales.couldNotUpdate, description: err.message, variant: 'destructive' }),
    onSettled: () => setActiveAction(null),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/api/listings/${id}`),
    onMutate: (id: string) => setActiveAction({ id, key: 'delete' }),
    onSuccess: () => {
      void invalidate()
      setDeleteTarget(null)
      toast({ title: copy.mySales.deletedToast })
    },
    onError: (err: Error) => toast({ title: copy.mySales.couldNotDelete, description: err.message, variant: 'destructive' }),
    onSettled: () => setActiveAction(null),
  })

  if (sessionLoading) return <ListingListSkeleton count={3} />

  if (!user) {
    return (
      <EmptyState
        title={copy.mySales.signInTitle}
        description={copy.mySales.signInSub}
        action={<Button onClick={() => useAppStore.getState().setAuthOpen(true)}>{copy.nav.signIn}</Button>}
      />
    )
  }

  if (isLoading) return <ListingListSkeleton count={3} />
  if (isError) return <ErrorState message={error instanceof Error ? error.message : 'Could not load your listings'} onRetry={() => refetch()} />

  const listings = data?.listings ?? []
  if (listings.length === 0) {
    return (
      <EmptyState
        title={copy.mySales.emptyTitle}
        description={copy.mySales.emptySub}
        action={<Button onClick={() => navigate({ name: 'publish' })}>{copy.mySales.postFirst}</Button>}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{copy.mySales.title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {copy.mySales.count(listings.length)} · {copy.mySales.sub}
        </p>
      </div>

      <div className="space-y-3">
        {listings.map((listing) => {
          const cooldownEnds = new Date(new Date(listing.refreshedAt).getTime() + REFRESH_COOLDOWN_HOURS * 3_600_000)
          const canRefresh = listing.status === 'ACTIVE' && cooldownEnds.getTime() <= Date.now()
          const nextRefreshIn = cooldownEnds.getTime() - Date.now()
          const hours = Math.ceil(nextRefreshIn / 3_600_000)
          const rowBusy = activeAction?.id === listing.id
          const refreshing = rowBusy && activeAction?.key === 'refresh'

          return (
            <ListingCard
              key={listing.id}
              listing={listing}
              onOpen={(id) => navigate({ name: 'listing', id })}
              showStatus
              actions={
                <div className="space-y-2">
                  {/* The seller's own photo-less ad: the honest nudge, with
                      the upload one tap away. Photos get more calls. */}
                  {listing.photos.length === 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-primary/30 bg-accent/40 px-2.5 py-2">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground/85">
                        <Camera className="size-3.5 shrink-0 text-primary" aria-hidden />
                        {copy.listing.addPhotoTitle}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="press h-7 gap-1 px-2.5 text-xs"
                        onClick={() => navigate({ name: 'edit', id: listing.id })}
                      >
                        {copy.listing.addPhotoCta}
                      </Button>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    key={expiryFlash?.id === listing.id ? `flash-${expiryFlash.tick}` : 'static'}
                    className={cn('mr-auto text-xs text-muted-foreground', expiryFlash?.id === listing.id && 'flash-good')}
                  >
                    {listing.status === 'ACTIVE' ? expiryLabel(listing.expiresAt) : copy.mySales.notActive}
                  </span>

                  {listing.status === 'ACTIVE' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 press"
                      disabled={rowBusy || !canRefresh}
                      onClick={() => refreshMutation.mutate(listing.id)}
                      title={canRefresh ? copy.mySales.refresh : copy.mySales.refreshCooldown(hours)}
                    >
                      <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} aria-hidden />
                      {canRefresh ? copy.mySales.refresh : copy.mySales.refreshIn(hours)}
                    </Button>
                  ) : null}

                  {listing.status === 'ACTIVE' ? (
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 press" disabled={rowBusy} onClick={() => navigate({ name: 'edit', id: listing.id })}>
                      <Pencil className="size-3.5" aria-hidden /> {copy.mySales.edit}
                    </Button>
                  ) : null}

                  {listing.status === 'ACTIVE' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 press"
                      onClick={() => statusMutation.mutate({ id: listing.id, status: 'FULFILLED' })}
                      disabled={rowBusy}
                    >
                      <CheckCircle2 className="size-3.5" aria-hidden /> {copy.mySales.markFulfilled}
                    </Button>
                  ) : null}

                  {(listing.status === 'FULFILLED' || listing.status === 'EXPIRED' || listing.status === 'ARCHIVED') ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 press"
                      onClick={() => statusMutation.mutate({ id: listing.id, status: 'ACTIVE' })}
                      disabled={rowBusy}
                      title={copy.mySales.repostHint}
                    >
                      <RotateCcw className="size-3.5" aria-hidden /> {copy.mySales.repost}
                    </Button>
                  ) : null}

                  {(listing.status === 'ACTIVE' || listing.status === 'FULFILLED') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 text-muted-foreground press"
                      onClick={() => statusMutation.mutate({ id: listing.id, status: 'ARCHIVED' })}
                      disabled={rowBusy}
                    >
                      <Archive className="size-3.5" aria-hidden /> {copy.mySales.archive}
                    </Button>
                  ) : null}

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1.5 text-destructive hover:text-destructive press"
                    onClick={() => setDeleteTarget(listing)}
                    disabled={rowBusy}
                  >
                    <Trash2 className="size-3.5" aria-hidden /> {copy.mySales.delete}
                  </Button>
                  </div>
                </div>
              }
            />
          )
        })}
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.mySales.deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy.mySales.deleteConfirmBody(deleteTarget?.title ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.mySales.deleteKeep}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
              }}
            >
              {deleteMutation.isPending ? copy.mySales.deleting : copy.mySales.deleteGo}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export { timeAgo }
