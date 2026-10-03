// /admin - the moderation desk. Server-checks the ADMIN_PHONES allowlist
// before anything renders: non-admins get a real HTTP 403 (forbidden()),
// admins get the live queue. The page itself holds no data - the dashboard
// client fetches /api/admin/reports, which re-checks every request.

import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { isAdminUser } from '@/lib/admin'
import { ReportsDashboard } from './reports-dashboard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Moderation · Mudaala',
  robots: { index: false, follow: false }, // an admin desk is nobody's search result
}

export default async function AdminPage() {
  const user = await getSessionUser()
  if (!user || !isAdminUser(user)) {
    forbidden()
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-lg font-semibold">Moderation</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Reports from buyers across Mudaala. Hide what breaks the rules, restore what was flagged by mistake, dismiss the rest.
      </p>
      <ReportsDashboard />
    </main>
  )
}
