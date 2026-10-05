'use client'

import { useState } from 'react'
import { Heart, Check, UserRound } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { apiDelete, apiGet, apiPost } from '@/lib/client'
import { useAppStore } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { useToast } from '@/hooks/use-toast'

type FollowState = { followerCount: number; following: boolean; signedIn: boolean; ownShop: boolean }

export function ShopFollowBar({ shopId }: { shopId: string }) {
  const { user } = useSession()
  const { setAuthOpen, navigate } = useAppStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)

  const stateQuery = useQuery({
    queryKey: ['shop-follow', shopId],
    queryFn: () => apiGet<FollowState>(`/api/shops/${shopId}/follow`),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      setBusy(true)
      if (stateQuery.data?.following) {
        return apiDelete<{ followerCount: number; following: false }>(`/api/shops/${shopId}/follow`)
      }
      return apiPost<{ followerCount: number; following: true }>(`/api/shops/${shopId}/follow`)
    },
    onSuccess: (next) => {
      queryClient.setQueryData(['shop-follow', shopId], (old: FollowState | undefined) => ({
        ...(old ?? { signedIn: true, ownShop: false }),
        followerCount: next.followerCount,
        following: next.following,
      }))
      queryClient.invalidateQueries({ queryKey: ['following'] })
    },
    onError: (error) => {
      if ((error as Error & { status?: number }).status === 401) {
        setAuthOpen(true)
      } else {
        toast({ title: error instanceof Error ? error.message : 'Could not update follow', variant: 'destructive' })
      }
    },
    onSettled: () => setBusy(false),
  })

  const state = stateQuery.data
  const count = state?.followerCount ?? 0
  return (
    <section aria-label="Follow shop" className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold">Keep this shop close</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {count === 0 ? 'Be the first to follow this shop.' : `${count.toLocaleString('en')} ${count === 1 ? 'person follows' : 'people follow'} this shop.`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {user && state?.ownShop ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-sm font-medium text-muted-foreground">
            <UserRound className="size-4" aria-hidden /> Your shop
          </span>
        ) : (
          <Button
            type="button"
            variant={state?.following ? 'outline' : 'default'}
            disabled={busy || stateQuery.isLoading || Boolean(state?.ownShop)}
            onClick={() => {
              if (!user) {
                setAuthOpen(true)
                return
              }
              mutation.mutate()
            }}
            className="press gap-1.5"
          >
            {state?.following ? <Check className="size-4" aria-hidden /> : <Heart className="size-4" aria-hidden />}
            {state?.following ? 'Following' : 'Follow shop'}
          </Button>
        )}
        {user ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate({ name: 'following' })}>
            My following
          </Button>
        ) : null}
      </div>
    </section>
  )
}

export function FollowingView() {
  const { navigate, setAuthOpen } = useAppStore()
  const { user } = useSession()
  const query = useQuery({
    queryKey: ['following'],
    enabled: Boolean(user),
    queryFn: () => apiGet<{ shops: Array<{
      id: string
      name: string
      photoUrl: string | null
      area: string | null
      county: string | null
      description: string | null
      activeListings: number
      followedAt: string
    }> }>('/api/following'),
  })

  if (!user) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <Heart className="mx-auto size-7 text-primary" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold">Follow shops you want to find again</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Sign in to keep a personal list of shops.</p>
        <Button className="mt-4" onClick={() => setAuthOpen(true)}>Sign in</Button>
      </div>
    )
  }

  if (query.isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading your shops…</div>
  if (query.isError) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-destructive">{query.error instanceof Error ? query.error.message : 'Could not load your following list'}</div>

  const shops = query.data?.shops ?? []
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-primary">Following</h1>
        <p className="mt-1 text-sm text-muted-foreground">Shops you chose to keep close.</p>
      </div>
      {shops.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Heart className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium">No followed shops yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Open a shop you like and follow it.</p>
          <Button variant="outline" className="mt-3" onClick={() => navigate({ name: 'browse' })}>Browse shops</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shops.map((shop) => (
            <button key={shop.id} type="button" onClick={() => navigate({ name: 'shop', id: shop.id })} className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent">
              {shop.photoUrl ? <img src={shop.photoUrl} alt="" className="size-16 shrink-0 rounded-md object-cover" /> : <span className="flex size-16 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"><Heart className="size-5" aria-hidden /></span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{shop.name}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{[shop.area, shop.county].filter(Boolean).join(', ') || 'Location not added'}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{shop.activeListings} active {shop.activeListings === 1 ? 'listing' : 'listings'}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
