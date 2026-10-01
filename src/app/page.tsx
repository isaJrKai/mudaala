'use client'

import { Store } from 'lucide-react'
import { Providers, CurrentView, HashSync } from '@/components/commerce/providers'
import { AppHeader } from '@/components/commerce/app-header'
import { AppSidebar } from '@/components/commerce/app-sidebar'
import { BottomNav } from '@/components/commerce/bottom-nav'
import { AuthDialog } from '@/components/commerce/auth-dialog'
import { ShopSetupDialog } from '@/components/commerce/shop-setup-dialog'

export default function Home() {
  return (
    <Providers>
      <HashSync />
      {/* Desktop (lg+) gets the workspace rail; the content column shifts
          right of it. Mobile is untouched: full-width column + bottom nav. */}
      <AppSidebar />
      <div className="flex min-h-dvh flex-col lg:ml-60">
        <AppHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-4 lg:pb-10">
          <CurrentView />
        </main>

        <footer className="mt-auto border-t bg-card pb-16 lg:pb-0">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-4 text-center text-xs text-muted-foreground sm:flex-row sm:text-left">
            <p className="flex items-center gap-1.5">
              <Store className="size-3.5" aria-hidden />
              Mudaala — discover offers and requests near you
            </p>
            <p>Local shops. Bigger opportunities. Every contact connects you directly.</p>
          </div>
        </footer>
      </div>

      <BottomNav />
      <AuthDialog />
      <ShopSetupDialog />
    </Providers>
  )
}
