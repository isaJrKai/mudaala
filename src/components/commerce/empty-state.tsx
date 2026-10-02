'use client'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}

// Honest empty states: explain what is missing and what to do next. The icon
// sits in a tilted, dashed "stamped label" — the hand-made mark a market
// seller puts on a crate — so an empty screen reads as a place waiting to
// be filled, not a broken page.
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon ? (
        <div
          className="mb-4 flex size-16 -rotate-3 items-center justify-center rounded-2xl border-2 border-dashed border-primary/30 bg-accent/50 text-primary animate-in fade-in zoom-in-95 motion-reduce:animate-none [&_svg]:size-7"
          style={{ animationDuration: '250ms', animationFillMode: 'both' }}
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
