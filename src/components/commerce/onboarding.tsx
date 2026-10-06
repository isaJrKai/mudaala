'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Package, Share2, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAppStore } from '@/lib/store'
import { useSession } from '@/hooks/use-session'

export const ONBOARDING_KEY_PREFIX = 'mudaala_onboarding_v1'

const STEPS = [
  {
    title: 'Set up your shop',
    body: 'Add your business name, photo, location and contact details so customers know who you are.',
    action: 'Set up my shop',
    icon: Store,
    view: { name: 'account' } as const,
  },
  {
    title: 'Add your first product',
    body: 'Tap Add Product, upload a photo, add the name and price, then publish it to your shop.',
    action: 'Add a product',
    icon: Package,
    view: { name: 'publish' } as const,
  },
  {
    title: 'Share your shop',
    body: 'Once your shop is ready, share your Mudaala shop link with customers on WhatsApp, Facebook or anywhere else.',
    action: 'View my shop',
    icon: Share2,
    view: { name: 'account' } as const,
  },
  {
    title: 'You are ready',
    body: 'Browse the market, manage your products and keep your shop up to date. Mudaala is your online shop and local marketplace.',
    action: 'Start using Mudaala',
    icon: Check,
    view: { name: 'home' } as const,
  },
] as const

function storageKey(userId: string) {
  return `${ONBOARDING_KEY_PREFIX}:${userId}`
}

export function hasCompletedOnboarding(userId: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId)) === 'done'
  } catch {
    return false
  }
}

export function MudaalaOnboarding() {
  const { user, isLoading } = useSession()
  const navigate = useAppStore((s) => s.navigate)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!user || isLoading) return
    setOpen(!hasCompletedOnboarding(user.id))
  }, [user, isLoading])

  if (!user || isLoading) return null

  const current = STEPS[step]
  const Icon = current.icon

  function finish() {
    try {
      localStorage.setItem(storageKey(user!.id), 'done')
    } catch {
      // Continue even if local storage is unavailable.
    }
    setOpen(false)
  }

  function goToAction() {
    const isLast = step === STEPS.length - 1
    if (isLast) {
      finish()
      navigate(current.view)
      return
    }

    if (step === 2) {
      // The shop link is available from the account/shop area after setup.
      finish()
      navigate(current.view)
      return
    }

    finish()
    navigate(current.view)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) finish() }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader className="text-left">
          <div className="mb-1 flex items-center gap-2 text-primary">
            <Icon className="size-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.14em]">Getting started</span>
          </div>
          <DialogTitle className="text-xl">{current.title}</DialogTitle>
          <DialogDescription className="text-left text-sm leading-relaxed">
            {current.body}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>

        <div className="rounded-lg border bg-secondary/30 p-4">
          <p className="text-sm font-semibold">Step {step + 1} of {STEPS.length}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            You can always find these actions again in your Mudaala account.
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={() => setStep((value) => value - 1)}>
                <ArrowLeft className="mr-1.5 size-4" aria-hidden />
                Back
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={finish}>
              Skip
            </Button>
          </div>

          <Button type="button" onClick={() => step === STEPS.length - 1 ? goToAction() : setStep((value) => value + 1)}>
            {step === STEPS.length - 1 ? current.action : 'Next'}
            {step < STEPS.length - 1 ? <ArrowRight className="ml-1.5 size-4" aria-hidden /> : null}
          </Button>
        </DialogFooter>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="mx-auto -mt-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={goToAction}
          >
            {current.action}
          </button>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
