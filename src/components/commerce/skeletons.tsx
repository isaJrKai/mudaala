'use client'

import { Skeleton } from '@/components/ui/skeleton'

// Grey skeletons mirroring the real cards, so loading never shifts layout.
// No illustrations, no spinners - flat grey blocks.
function ListingCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className="flex gap-3">
        <Skeleton className="size-24 rounded-lg sm:size-28" />
        <div className="min-w-0 flex-1 py-0.5">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="mt-2 h-5 w-24" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
      </div>
    </div>
  )
}

export function ListingListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  )
}

// Block skeleton mirrors the desktop grid card: photo area on top, three
// text lines under it - same proportions as the loaded blocks.
function ListingBlockSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2 p-2.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  )
}

// Same columns as the real grid (2 / 3) so the skeleton occupies exactly
// the space the loaded blocks will.
export function ListingGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <ListingBlockSkeleton key={i} />
      ))}
    </div>
  )
}
