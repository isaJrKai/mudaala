'use client'

import { Providers, CurrentView, HashSync } from '@/components/commerce/providers'
import { AppHeader } from '@/components/commerce/app-header'
import { AppSidebar } from '@/components/commerce/app-sidebar'
import { BottomNav } from '@/components/commerce/bottom-nav'
import { AuthDialog } from '@/components/commerce/auth-dialog'
import { ShopSetupDialog } from '@/components/commerce/shop-setup-dialog'
import { SiteFooter } from '@/components/commerce/site-footer'
import { RailShell } from '@/components/commerce/cart-dock'

export default function Home() {
  return (
    <Providers>
      <HashSync />
      {/* Desktop (lg+) gets the workspace rail; the content column shifts
          right of it. On xl+ the buying views also get the basket dock on
          the right (RailShell reserves the resting strip's width; the open
          panel overlays). Seller views stay full-width. Mobile is untouched:
          full-width column + bottom nav. */}
      <AppSidebar />
      <RailShell>
        <AppHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-4 lg:pb-10">
          <CurrentView />
        </main>
        <SiteFooter padded />
      </RailShell>

      <BottomNav />
      <AuthDialog />
      <ShopSetupDialog />
    </Providers>
  )
}
