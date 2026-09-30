'use client'

import { Skeleton } from '@/components/ui/skeleton'

// Restrained skeletons mirroring the listing card layout.
export function ListingCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="mt-3 h-5 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <div className="mt-3 flex items-center gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-20" />
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

// Block skeleton mirrors the grid card: photo area on top, three text lines
// under it — same proportions so loading never shifts the layout.
export function ListingBlockSkeleton() {
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

// Same columns as the real grid (2 / 3 / 4) so the skeleton occupies exactly
// the space the loaded blocks will.
export function ListingGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <ListingBlockSkeleton key={i} />
      ))}
    </div>
  )
}
