'use client'

// The mobile-money pay sheet: the honest version of a checkout button.
//
// Mudaala never touches money and never learns the result. What the sheet
// does:
//   - hands the buyer the shop's own merchant code (or, when the shop has
//     none, their personal number) so nothing has to be memorized,
//   - opens the dialer with the full dial string typed in on Android; on
//     iPhone, where the system strips * and # from tel: links (a stripped
//     string can CALL a wrong number), it copies the string for a manual
//     paste instead - the guard is deliberate, not a missed feature,
//   - tells the buyer to match the registered name on the telco's own
//     confirmation screen, and says plainly that the code is self-reported
//     and the payment cannot be reversed.
//
// The cautions are the product, not decoration: this sheet's whole job is
// structuring a payment that would otherwise happen over screenshots.

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ShieldAlert, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatPhonePretty, formatPrice } from '@/lib/format'
import { copy } from '@/lib/copy'

export interface PaySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shopName: string
  /** The shop's contact number - the P2P fallback when no merchant code. */
  phone: string
  merchantCode: string | null
  network: string | null
  /** The basket's estimate, when one exists. Never invented here. */
  estimate: { amount: number; currency: string } | null
}

// MTN's MoMo Pay dial string: *165*3*CODE*AMOUNT#. Only built when the
// shop is on MTN AND we have an estimate to prefill - without an amount the
// sheet falls back to the menu path, because a half-typed string is a
// wrong-send waiting to happen. Airtel's deep chain differs by country and
// changes without notice, so the sheet teaches the menu, not a guess.
function mtnDialString(code: string, amount: number): string {
  return `*165*3*${code}*${amount}#`
}

function isAppleDialer(): boolean {
  // The sheet only renders its actions after the buyer opens it, so this
  // runs client-side in practice; the guard keeps SSR honest anyway.
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function PaySheet({ open, onOpenChange, shopName, phone, merchantCode, network, estimate }: PaySheetProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const amount = estimate ? Math.round(estimate.amount) : null
  const dialString = merchantCode && network === 'MTN' && amount ? mtnDialString(merchantCode, amount) : null
  // tel: links can carry a full USSD string on Android. iOS strips the * and
  // # - which turns the string into a WRONG NUMBER - so Apple devices get
  // the copy path instead. That is the safe direction to be wrong in.
  const canAutoDial = dialString !== null && !isAppleDialer()

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), 1600)
    } catch {
      // Clipboard denied - the code sits in big type right above, and the
      // manual path was always open.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Smartphone className="size-5 shrink-0 text-primary" aria-hidden />
            {merchantCode ? copy.pay.titleMerchant(shopName) : copy.pay.titlePersonal(shopName)}
          </DialogTitle>
          <DialogDescription className="text-left">
            {merchantCode && network
              ? copy.pay.nameCheck(shopName, network)
              : copy.pay.nameCheckPersonal(shopName)}
          </DialogDescription>
        </DialogHeader>

        {estimate ? (
          <p className="rounded-md bg-secondary/50 px-3 py-2 text-sm tabular-nums">
            {copy.pay.estimate(formatPrice(estimate.amount, null, estimate.currency))}
          </p>
        ) : (
          <p className="rounded-md bg-secondary/50 px-3 py-2 text-sm">{copy.pay.noEstimate}</p>
        )}

        {merchantCode && network ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.pay.codeLabel}</p>
              <p className="mt-1 text-2xl font-bold tracking-[0.15em] text-primary tabular-nums">{merchantCode}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{copy.pay.codeNote}</p>
            </div>

            {dialString ? (
              <div className="rounded-md border px-3 py-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.pay.dialLabel}</p>
                <p className="mt-1 text-lg font-semibold text-foreground tabular-nums">{dialString}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {canAutoDial ? copy.pay.dialHint : copy.pay.dialFallbackHint}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {canAutoDial ? (
                    <Button asChild size="sm" className="press h-9 gap-1.5">
                      <a href={`tel:${encodeURIComponent(dialString)}`} aria-label={copy.pay.dialLabel}>
                        <Smartphone className="size-4" aria-hidden /> {copy.pay.dialLabel}
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="press h-9 gap-1.5"
                    onClick={() => copyText('dial', dialString)}
                    aria-label={copy.pay.copyDialAria}
                  >
                    {copied === 'dial' ? (
                      <>
                        <Check className="size-4 text-emerald-700" aria-hidden /> {copy.pay.copied}
                      </>
                    ) : (
                      <>
                        <Copy className="size-4" aria-hidden /> {copy.pay.copyDial}
                      </>
                    )}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{copy.pay.mtnMenu}</p>
              </div>
            ) : (
              <div className="rounded-md border px-3 py-2.5">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {network === 'AIRTEL' ? copy.pay.airtelMenu : copy.pay.mtnMenu}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="press mt-2 h-9 gap-1.5"
                  onClick={() => copyText('code', merchantCode)}
                  aria-label={copy.pay.copyCodeAria}
                >
                  {copied === 'code' ? (
                    <>
                      <Check className="size-4 text-emerald-700" aria-hidden /> {copy.pay.copied}
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" aria-hidden /> {copy.pay.copyCode}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.pay.personalLabel}</p>
            <p className="mt-1 text-2xl font-bold text-primary tabular-nums">{formatPhonePretty(phone)}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{copy.pay.personalHint(phone)}</p>
          </div>
        )}

        <div className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <ShieldAlert className="size-4 shrink-0" aria-hidden /> {copy.pay.cautionTitle}
          </p>
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-amber-900/90">
            <li>{copy.pay.cautionAgree}</li>
            <li>{copy.pay.cautionDirect}</li>
            <li>{copy.pay.cautionName}</li>
          </ul>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {copy.pay.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
