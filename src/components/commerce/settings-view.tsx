'use client'

import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { EmptyState } from './empty-state'

// User-facing settings page. Deployment/database configuration is intentionally
// not exposed here: production infrastructure is managed through Supabase,
// Cloudflare Hyperdrive, and protected deployment environment variables.
export function SettingsView() {
  const { navigate } = useAppStore()
  const { user, isLoading } = useSession()

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-lg border bg-muted/30" aria-label="Loading settings" />
  }

  if (!user) {
    return (
      <EmptyState
        title="Sign in to manage settings"
        description="Sign in to access your account settings."
        action={<Button onClick={() => useAppStore.getState().setAuthOpen(true)}>Sign in</Button>}
      />
    )
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate({ name: 'account' })}>
        <ArrowLeft className="size-4" aria-hidden /> Back to account
      </Button>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Account and application preferences.</p>
      </div>

      <Separator />

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">Application settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your marketplace is connected to its managed production services. Database and infrastructure credentials are kept out of the app and are not editable from this screen.
        </p>
      </section>
    </div>
  )
}
