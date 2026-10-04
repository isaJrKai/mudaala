'use client'

import { Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { categoryLabel } from '@/lib/constants'
import { copy } from '@/lib/copy'

/**
 * PLACEHOLDER RULE - the one neutral photo placeholder.
 *
 * Every real photo in the app is temporary until real shops upload real
 * photos. Wherever a photo is missing (no upload yet, or seed data removed
 * before launch), this tile stands in: flat grey, the category name, and a
 * small camera icon. No stock photos, no AI images, no illustrations -
 * the tile makes no claim a real photo would need to live up to.
 */
export function PlaceholderTile({
  category,
  title,
  note,
  className,
  iconClassName,
  label = copy.common.photoPending,
}: {
  category?: string
  /** Non-category tiles (shop covers, hero): a plain name line instead. */
  title?: string
  note?: string
  className?: string
  iconClassName?: string
  label?: string
}) {
  return (
    <div
      // aria-hidden false + explicit label: screen readers hear what the
      // sighted user sees - an honest placeholder, not a broken image.
      role="img"
      aria-label={label}
      className={cn(
        'flex size-full flex-col items-center justify-center gap-1.5 bg-muted text-center',
        className,
      )}
    >
      <Camera aria-hidden className={cn('size-5 text-muted-foreground/70', iconClassName)} />
      {title ? (
        <span className="px-3 text-xs font-medium text-muted-foreground">{title}</span>
      ) : null}
      {category && !title ? (
        <span className="px-3 text-xs font-medium text-muted-foreground">{categoryLabel(category)}</span>
      ) : null}
      {note ? <span className="px-3 text-[11px] text-muted-foreground/80">{note}</span> : null}
    </div>
  )
}
