'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bookmark, RefreshCw, Trash2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { apiGet, apiPost, apiDelete } from '@/lib/client'
import type { SavedSearchT } from '@/lib/client'
import type { ListingQuery } from '@/lib/validation'
import { useAppStore, describeQuery, type BrowseFilters } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { timeAgo } from '@/lib/format'
import { ListingListSkeleton } from './skeletons'
import { EmptyState } from './empty-state'
import { ErrorState } from './listings-browse'

// Saved searches — persisted filters with honest, recomputed match counts.
export function SavedSearches() {
  const { user, isLoading: sessionLoading } = useSession()
  const { navigate, applyQuery } = useAppStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['saved-searches'],
    enabled: Boolean(user),
    queryFn: () => apiGet<{ searches: SavedSearchT[] }>('/api/saved-searches'),
  })

  const checkMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ search: SavedSearchT }>(`/api/saved-searches/${id}/check`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-searches'] }),
    onError: (err: Error) => toast({ title: 'Could not check', description: err.message, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/api/saved-searches/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['saved-searches'] })
      toast({ title: 'Saved search removed' })
    },
  })

  if (sessionLoading) return <ListingListSkeleton count={2} />

  if (!user) {
    return (
      <EmptyState
        icon={<Bookmark />}
        title="Sign in to save searches"
        description="Save the filters you use often and get an alert when a new listing matches."
        action={<Button onClick={() => useAppStore.getState().setAuthOpen(true)}>Sign in</Button>}
      />
    )
  }

  if (isLoading) return <ListingListSkeleton count={2} />
  if (isError) return <ErrorState message={error instanceof Error ? error.message : 'Could not load saved searches'} onRetry={() => refetch()} />

  const searches = data?.searches ?? []
  if (searches.length === 0) {
    return (
      <EmptyState
        icon={<Bookmark />}
        title="No saved searches yet"
        description="Set filters on Browse and tap “Save this search” — we will alert you when new listings match."
        action={<Button onClick={() => navigate({ name: 'browse' })}>Browse listings</Button>}
      />
    )
  }

  function apply(search: SavedSearchT) {
    try {
      const q = JSON.parse(search.queryJson) as Partial<ListingQuery>
      const patch: Partial<BrowseFilters> = {
        q: q.q ?? '',
        type: (q.type ?? 'any') as BrowseFilters['type'],
        category: q.category ?? 'any',
        county: q.county ?? 'any',
        unit: q.unit ?? 'any',
        minPrice: q.minPrice !== undefined ? String(q.minPrice) : '',
        maxPrice: q.maxPrice !== undefined ? String(q.maxPrice) : '',
        sort: 'newest',
        page: 1,
      }
      applyQuery(patch)
      navigate({ name: 'browse' })
    } catch {
      toast({ title: 'This saved search is corrupted. Delete and recreate it.', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Saved searches</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">You get an alert on every new listing that matches.</p>
      </div>

      <div className="space-y-3">
        {searches.map((search) => (
          <div key={search.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-medium">{search.name}</h3>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{describeQuery(safeParse(search.queryJson))}</p>
              </div>
              <p className="shrink-0 text-right text-sm font-medium">
                {search.lastMatchCount} {search.lastMatchCount === 1 ? 'match' : 'matches'}
                <span className="block text-xs font-normal text-muted-foreground">checked {timeAgo(search.lastCheckedAt)}</span>
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button size="sm" className="h-8 gap-1.5" onClick={() => apply(search)}>
                Apply <ArrowRight className="size-3.5" aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={() => checkMutation.mutate(search.id)}
                disabled={checkMutation.isPending}
              >
                <RefreshCw className="size-3.5" aria-hidden /> Check now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => deleteMutation.mutate(search.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="size-3.5" aria-hidden /> Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function safeParse(json: string): Partial<ListingQuery> {
  try {
    return JSON.parse(json) as Partial<ListingQuery>
  } catch {
    return {}
  }
}

