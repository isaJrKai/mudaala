'use client'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}

// Empty states are plain text: say what is missing, offer the one action
// that helps. No icon boxes, no illustrations, nothing decorative - an
// empty screen should read as words on a surface, not a themed graphic.
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
