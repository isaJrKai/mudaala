'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Tag, RefreshCw, Pencil, CheckCircle2, RotateCcw, Archive, Trash2 } from 'lucide-react'
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
    onSuccess: () => {
      void invalidate()
      toast({ title: 'Listing refreshed', description: `It now appears as fresh and expires in ${LISTING_ACTIVE_DAYS} days.` })
    },
    onError: (err: Error) => toast({ title: 'Could not refresh', description: err.message, variant: 'destructive' }),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch<{ listing: Listing }>(`/api/listings/${id}`, { status }),
    onSuccess: (_data, vars) => {
      void invalidate()
      toast({ title: vars.status === 'FULFILLED' ? 'Marked as fulfilled' : vars.status === 'ACTIVE' ? 'Listing is active again' : 'Listing archived' })
    },
    onError: (err: Error) => toast({ title: 'Could not update listing', description: err.message, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/api/listings/${id}`),
    onSuccess: () => {
      void invalidate()
      setDeleteTarget(null)
      toast({ title: 'Listing deleted' })
    },
    onError: (err: Error) => toast({ title: 'Could not delete', description: err.message, variant: 'destructive' }),
  })

  if (sessionLoading) return <ListingListSkeleton count={3} />

  if (!user) {
    return (
      <EmptyState
        icon={<Tag />}
        title="Sign in to manage your listings"
        description="Your listings, their status and expiry all live here once you sign in."
        action={<Button onClick={() => useAppStore.getState().setAuthOpen(true)}>Sign in</Button>}
      />
    )
  }

  if (isLoading) return <ListingListSkeleton count={3} />
  if (isError) return <ErrorState message={error instanceof Error ? error.message : 'Could not load your listings'} onRetry={() => refetch()} />

  const listings = data?.listings ?? []
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={<Tag />}
        title="You have no listings yet"
        description="Post what you sell or what you need — it takes about a minute and buyers can find you right away."
        action={<Button onClick={() => navigate({ name: 'publish' })}>Post your first listing</Button>}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">My Listings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {listings.length} {listings.length === 1 ? 'listing' : 'listings'} · refresh to stay visible, mark fulfilled when done.
        </p>
      </div>

      <div className="space-y-3">
        {listings.map((listing) => {
          const cooldownEnds = new Date(new Date(listing.refreshedAt).getTime() + REFRESH_COOLDOWN_HOURS * 3_600_000)
          const canRefresh = listing.status === 'ACTIVE' && cooldownEnds.getTime() <= Date.now()
          const nextRefreshIn = cooldownEnds.getTime() - Date.now()
          const hours = Math.ceil(nextRefreshIn / 3_600_000)

          return (
            <ListingCard
              key={listing.id}
              listing={listing}
              onOpen={(id) => navigate({ name: 'listing', id })}
              showStatus
              actions={
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-auto text-xs text-muted-foreground">
                    {listing.status === 'ACTIVE' ? expiryLabel(listing.expiresAt) : '—'}
                  </span>

                  {listing.status === 'ACTIVE' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5"
                      disabled={!canRefresh || refreshMutation.isPending}
                      onClick={() => refreshMutation.mutate(listing.id)}
                      title={canRefresh ? 'Refresh now' : `Available in ${hours}h (24h cooldown)`}
                    >
                      <RefreshCw className="size-3.5" aria-hidden />
                      {canRefresh ? 'Refresh' : `Refresh in ${hours}h`}
                    </Button>
                  ) : null}

                  {listing.status === 'ACTIVE' ? (
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => navigate({ name: 'edit', id: listing.id })}>
                      <Pencil className="size-3.5" aria-hidden /> Edit
                    </Button>
                  ) : null}

                  {listing.status === 'ACTIVE' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5"
                      onClick={() => statusMutation.mutate({ id: listing.id, status: 'FULFILLED' })}
                      disabled={statusMutation.isPending}
                    >
                      <CheckCircle2 className="size-3.5" aria-hidden /> Mark fulfilled
                    </Button>
                  ) : null}

                  {(listing.status === 'FULFILLED' || listing.status === 'EXPIRED' || listing.status === 'ARCHIVED') ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5"
                      onClick={() => statusMutation.mutate({ id: listing.id, status: 'ACTIVE' })}
                      disabled={statusMutation.isPending}
                      title="Repost: restarts freshness and expiry"
                    >
                      <RotateCcw className="size-3.5" aria-hidden /> Repost
                    </Button>
                  ) : null}

                  {(listing.status === 'ACTIVE' || listing.status === 'FULFILLED') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 text-muted-foreground"
                      onClick={() => statusMutation.mutate({ id: listing.id, status: 'ARCHIVED' })}
                      disabled={statusMutation.isPending}
                    >
                      <Archive className="size-3.5" aria-hidden /> Archive
                    </Button>
                  ) : null}

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(listing)}
                  >
                    <Trash2 className="size-3.5" aria-hidden /> Delete
                  </Button>
                </div>
              }
            />
          )
        })}
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this listing?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.title}&quot; will be removed permanently. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
              }}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete listing'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export { timeAgo }
