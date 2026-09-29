'use client'

import { Store } from 'lucide-react'
import { Providers, CurrentView, HashSync } from '@/components/commerce/providers'
import { AppHeader } from '@/components/commerce/app-header'
import { BottomNav } from '@/components/commerce/bottom-nav'
import { AuthDialog } from '@/components/commerce/auth-dialog'

export default function Home() {
  return (
    <Providers>
      <HashSync />
      <div className="flex min-h-dvh flex-col">
        <AppHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-4 lg:pb-10">
          <CurrentView />
        </main>

        <footer className="mt-auto border-t bg-card pb-16 lg:pb-0">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-4 text-center text-xs text-muted-foreground sm:flex-row sm:text-left">
            <p className="flex items-center gap-1.5">
              <Store className="size-3.5" aria-hidden />
              Duuka — discover offers and requests near you
            </p>
            <p>Every contact action connects you directly with the other party.</p>
          </div>
        </footer>
      </div>

      <BottomNav />
      <AuthDialog />
    </Providers>
  )
}
