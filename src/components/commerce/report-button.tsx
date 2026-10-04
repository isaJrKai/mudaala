'use client'

// Report an ad or a shop. One small form, no sign-in required: a buyer who
// spots a scam should not need an account to say so. The reason pills use
// the buyer's own words; the note is optional. Everything goes to
// POST /api/reports, which handles dedupe ("you already reported this")
// and the daily cap with friendly, specific messages.

import { useState } from 'react'
import { Check, ChevronDown, Flag, Loader2 } from 'lucide-react'
import { REPORT_REASON_LABELS, REPORT_REASONS, type ReportReason } from '@/lib/constants'

interface ReportButtonProps {
  targetType: 'LISTING' | 'SHOP'
  targetId: string
  noun?: 'ad' | 'shop'
}

type Phase = 'idle' | 'open' | 'sending' | 'sent'

export function ReportButton({ targetType, targetId, noun = 'ad' }: ReportButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!reason) {
      setError('Choose a reason so the team knows what to look at.')
      return
    }
    setPhase('sending')
    setError(null)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, reason, details: details.trim() || null }),
      })
      const json = await res.json().catch(() => null)
      if (res.status === 201) {
        setPhase('sent')
        return
      }
      // The API's messages are written for buyers - show them as they are.
      setError(json?.error ?? 'Something went wrong. Please try again in a moment.')
      setPhase('open')
    } catch {
      setError('No connection. Please try again in a moment.')
      setPhase('open')
    }
  }

  if (phase === 'sent') {
    return (
      <div className="flex items-start gap-1.5 text-[13px] leading-snug text-emerald-800" role="status">
        <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
        <span>Thank you. Our team will review this {noun}. Reports like yours keep Mudaala safe.</span>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setPhase(phase === 'open' ? 'idle' : 'open')}
        aria-expanded={phase === 'open'}
        aria-label={`Report this ${noun}`}
        className="press flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        <Flag className="size-3.5" aria-hidden /> Report this {noun}
        <ChevronDown className={`size-3.5 transition-transform ${phase === 'open' ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {phase !== 'idle' ? (
        <div className="mt-2.5 rounded-md border bg-secondary/40 p-3">
          <p className="text-[13px] font-medium">Why are you reporting this {noun}?</p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Report reason">
            {REPORT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={reason === r}
                onClick={() => setReason(r)}
                className={`press rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${
                  reason === r
                    ? 'border-foreground bg-foreground text-background'
                    : 'bg-card text-foreground hover:bg-accent/50'
                }`}
              >
                {REPORT_REASON_LABELS[r]}
              </button>
            ))}
          </div>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Anything the team should know? (optional)"
            aria-label="Extra details (optional)"
            className="mt-2.5 w-full rounded-md border bg-card p-2 text-[13px] outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{details.length}/500</span>
            <button
              type="button"
              onClick={send}
              disabled={phase === 'sending'}
              className="press inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3.5 text-[13px] font-medium hover:bg-accent/50 disabled:opacity-60"
            >
              {phase === 'sending' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden /> Sending…
                </>
              ) : (
                'Send report'
              )}
            </button>
          </div>
          {error ? (
            <p className="mt-2 text-[13px] leading-snug text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
