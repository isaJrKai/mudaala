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
import { cn } from '@/lib/utils'
import { ListingListSkeleton } from './skeletons'
import { EmptyState } from './empty-state'
import { ErrorState } from './listings-browse'
import { useState } from 'react'
import { copy } from '@/lib/copy'

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

  // The row whose check is running — checking is read-only, so other rows
  // stay live; only the tapped one pauses and spins.
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const checkMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ search: SavedSearchT }>(`/api/saved-searches/${id}/check`),
    onMutate: (id: string) => setCheckingId(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-searches'] }),
    onError: (err: Error) => toast({ title: 'Could not check', description: err.message, variant: 'destructive' }),
    onSettled: () => setCheckingId(null),
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
        title={copy.saved.signInTitle}
        description={copy.saved.signInSub}
        action={<Button onClick={() => useAppStore.getState().setAuthOpen(true)}>{copy.nav.signIn}</Button>}
      />
    )
  }

  if (isLoading) return <ListingListSkeleton count={2} />
  if (isError) return <ErrorState message={error instanceof Error ? error.message : 'Could not load saved searches'} onRetry={() => refetch()} />

  const searches = data?.searches ?? []
  if (searches.length === 0) {
    return (
      <EmptyState
        title={copy.saved.emptyTitle}
        description={copy.saved.emptySub}
        action={<Button onClick={() => navigate({ name: 'browse' })}>{copy.common.browseListings}</Button>}
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
      toast({ title: copy.home.savedCorrupt, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{copy.nav.savedSearches}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{copy.saved.sub}</p>
      </div>

      <div className="space-y-3">
        {searches.map((search) => (
          <div key={search.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-medium">{search.name}</h3>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{describeQuery(safeParse(search.queryJson))}</p>
              </div>
              <p className="shrink-0 text-right text-sm font-medium tabular-nums">
                {copy.home.matches(search.lastMatchCount)}
                <span className="block text-xs font-normal text-muted-foreground">{copy.saved.checked(timeAgo(search.lastCheckedAt))}</span>
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button size="sm" className="h-8 gap-1.5 press" onClick={() => apply(search)}>
                {copy.saved.apply} <ArrowRight className="size-3.5" aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 press"
                onClick={() => checkMutation.mutate(search.id)}
                disabled={checkingId === search.id}
              >
                <RefreshCw className={cn('size-3.5', checkingId === search.id && 'animate-spin')} aria-hidden /> {copy.saved.checkNow}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-muted-foreground hover:text-destructive press"
                onClick={() => deleteMutation.mutate(search.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="size-3.5" aria-hidden /> {copy.saved.remove}
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

