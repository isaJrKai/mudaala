'use client'

// The Report button + dialog. Guests may report — no sign-in required.
// One open report per person per target; ten reports a day; the friendly
// errors say which. Nothing about the reporter is collected in the form:
// the server attaches identity (account or coarse IP) itself.

import { useState } from 'react'
import { Check, Flag, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { apiPost } from '@/lib/client'
import { REPORT_REASONS, REPORT_REASONS_UI } from '@/lib/constants'
import { cn } from '@/lib/utils'

type Phase = 'form' | 'sending' | 'done'

export function ReportButton({
  targetType,
  targetId,
  label = 'Report',
  className,
}: {
  targetType: 'LISTING' | 'SHOP'
  targetId: string
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setReason(null)
    setDetails('')
    setPhase('form')
    setError(null)
  }

  const submit = async () => {
    if (!reason) {
      setError('Choose a reason so the team knows where to look.')
      return
    }
    setPhase('sending')
    setError(null)
    try {
      await apiPost('/api/reports', {
        targetType,
        targetId,
        reason,
        details: details.trim() ? details.trim() : null,
      })
      setPhase('done')
    } catch (err) {
      setPhase('form')
      setError(err instanceof Error ? err.message : 'Could not send the report. Please try again.')
    }
  }

  // The dialog stays mounted after success so the thank-you note reads as the
  // same conversation; reopening resets the form.
  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) reset()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('gap-1.5 text-muted-foreground hover:text-foreground', className)}
          aria-label={targetType === 'LISTING' ? 'Report this listing' : 'Report this shop'}
        >
          <Flag className="size-3.5" aria-hidden /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        {phase === 'done' ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-emerald-100">
              <Check className="size-5 text-emerald-700" aria-hidden />
            </span>
            <DialogHeader className="items-center gap-1.5">
              <DialogTitle>Thank you</DialogTitle>
              <DialogDescription>
                Our team will take a look. If anything else feels wrong, you can always report it again.
              </DialogDescription>
            </DialogHeader>
            <Button className="mt-2" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {targetType === 'LISTING' ? 'Report this listing' : 'Report this shop'}
              </DialogTitle>
              <DialogDescription>
                Tell us what is wrong. Reports are reviewed by the Mudaala team.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5" role="radiogroup" aria-label="Reason for reporting">
              {REPORT_REASONS.map((key) => {
                const ui = REPORT_REASONS_UI[key]
                const selected = reason === key
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setReason(key)}
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors',
                      selected ? 'border-primary bg-accent/60' : 'hover:bg-accent/40',
                    )}
                  >
                    <span className="block text-sm font-medium">{ui.label}</span>
                    <span className="block text-xs text-muted-foreground">{ui.hint}</span>
                  </button>
                )
              })}
            </div>

            <div className="space-y-1.5">
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, 500))}
                placeholder="Anything else the team should know? (optional)"
                rows={3}
                maxLength={500}
                aria-label="Extra details (optional)"
              />
              <p className="text-right text-xs text-muted-foreground">{details.length}/500</p>
            </div>

            {error ? (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={phase === 'sending'}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={phase === 'sending'} className="gap-1.5">
                {phase === 'sending' ? (
                  <>
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Sending
                  </>
                ) : (
                  'Send report'
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
