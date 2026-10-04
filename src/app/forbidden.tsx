// Friendly 403 - shown when forbidden() fires (e.g. non-admins visiting
// /admin). Same tone as the gone-ad page: honest, calm, a way forward.

import Link from 'next/link'
import { ShieldX } from 'lucide-react'
import { SiteFooter } from '@/components/commerce/site-footer'

export default function Forbidden() {
  return (
    <>
      <main className="flex min-h-svh flex-col items-center justify-center px-4 text-center">
      <ShieldX className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-lg font-semibold">This area is for the Mudaala team</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        You do not have access to this page. If you believe you should (for example you moderate ads for Mudaala), sign in with the team account and try again.
      </p>
      <div className="mt-5 flex gap-2">
        <Link
          href="/"
          className="press inline-flex h-10 items-center rounded-md border bg-card px-4 text-sm font-medium hover:bg-accent/50"
        >
          Back to Mudaala
        </Link>
        <Link
          href="/#/browse"
          className="press inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Browse the market
        </Link>
      </div>
      </main>

      <SiteFooter />
    </>
  )
}
