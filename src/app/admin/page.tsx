// /admin — the moderation desk. Server-gated by ADMIN_PHONES: anyone else
// (signed in or not) gets a friendly "admins only" screen, NOT an error page.
// A Next.js App Router page cannot emit a 403 status, so the page-level gate
// is the friendly screen; every /api/admin/* endpoint behind it returns a
// real 403 and is the enforced boundary (tested).

import type { Metadata } from 'next'
import { ShieldAlert } from 'lucide-react'
import { AdminReportsView } from '@/components/commerce/admin-reports-view'
import { getSessionUser } from '@/lib/auth'
import { isAdminUser } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Moderation · Mudaala',
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  const user = await getSessionUser()

  if (!isAdminUser(user)) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
          <ShieldAlert className="size-6 text-muted-foreground" aria-hidden />
        </span>
        <h1 className="font-display text-xl font-semibold">Admins only</h1>
        <p className="text-sm text-muted-foreground">
          This page is reserved for the Mudaala moderation team. If you believe you should have
          access, sign in with the admin phone number and try again.
        </p>
        <a href="/" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
          Back to the market
        </a>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Moderation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open reports from the Mudaala community. Hide takes a listing down, Restore brings it
          back, Dismiss closes a report without action — every action is logged.
        </p>
      </header>
      <AdminReportsView />
    </div>
  )
}
