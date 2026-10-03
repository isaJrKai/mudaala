'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Database, PlugZap, Trash2, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { apiGet, apiPut, apiDelete, apiPost } from '@/lib/client'
import { useAppStore } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { EmptyState } from './empty-state'

interface PostgresConfigView {
  connectionString: string | null
  host: string | null
  port: number | null
  database: string | null
  user: string | null
  sslMode: 'disable' | 'prefer' | 'require'
  configuredAt?: string
  hasPassword: boolean
}

interface TestResult {
  ok: boolean
  message: string
  latencyMs: number | null
}

// Settings → Advanced Settings.
// Holds the PostgreSQL deployment connection: everything that needs a Postgres
// link lives here — stored server-side, never returned unmasked.
export function SettingsView() {
  const { navigate } = useAppStore()
  const { user, isLoading } = useSession()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!user) {
    return (
      <EmptyState
        title="Sign in to manage settings"
        description="Advanced settings contain deployment configuration and are only available to signed-in users."
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
        <p className="mt-0.5 text-sm text-muted-foreground">Application configuration and deployment settings.</p>
      </div>

      <Separator />

      <PostgresSection />
    </div>
  )
}

function PostgresSection() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['postgres-config'],
    queryFn: () => apiGet<{ config: PostgresConfigView | null }>('/api/settings/postgres'),
  })

  const [connectionString, setConnectionString] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [database, setDatabase] = useState('')
  const [dbUser, setDbUser] = useState('')
  const [password, setPassword] = useState('')
  const [sslMode, setSslMode] = useState<'disable' | 'prefer' | 'require'>('prefer')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (data && !hydrated) {
      const c = data.config
      setConnectionString(c?.connectionString ?? '')
      setHost(c?.host ?? '')
      setPort(c?.port !== null && c?.port !== undefined ? String(c.port) : '')
      setDatabase(c?.database ?? '')
      setDbUser(c?.user ?? '')
      setSslMode(c?.sslMode ?? 'prefer')
      setHydrated(true)
    }
  }, [data, hydrated])

  const configured = data?.config !== null && data?.config !== undefined

  function buildPayload() {
    return {
      connectionString: connectionString.trim() === '' ? null : connectionString.trim(),
      host: host.trim() === '' ? null : host.trim(),
      port: port.trim() === '' ? null : Number(port.trim()),
      database: database.trim() === '' ? null : database.trim(),
      user: dbUser.trim() === '' ? null : dbUser.trim(),
      password: password === '' ? null : password, // empty = keep stored password
      sslMode,
    }
  }

  async function save() {
    setBusy(true)
    try {
      await apiPut('/api/settings/postgres', buildPayload())
      await queryClient.invalidateQueries({ queryKey: ['postgres-config'] })
      setPassword('')
      setTestResult(null)
      toast({ title: 'PostgreSQL configuration saved' })
    } catch (err) {
      toast({ title: 'Could not save configuration', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await apiPost<TestResultShape>('/api/settings/postgres/test')
      setTestResult({ ok: res.ok, message: res.message, latencyMs: res.latencyMs })
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Test failed', latencyMs: null })
    } finally {
      setTesting(false)
    }
  }

  async function clearConfig() {
    setBusy(true)
    try {
      await apiDelete('/api/settings/postgres')
      await queryClient.invalidateQueries({ queryKey: ['postgres-config'] })
      setConnectionString('')
      setHost('')
      setPort('')
      setDatabase('')
      setDbUser('')
      setPassword('')
      setSslMode('prefer')
      setTestResult(null)
      setHydrated(false)
      setConfirmClear(false)
      toast({ title: 'PostgreSQL configuration removed' })
    } catch (err) {
      toast({ title: 'Could not remove configuration', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="pg-heading">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Database className="size-4.5" aria-hidden />
        </span>
        <div>
          <h2 id="pg-heading" className="text-base font-semibold">
            Advanced settings: PostgreSQL connection
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Everything that needs a Postgres link is configured here. Saved server-side; passwords are never sent back to the browser.
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-secondary/40 px-3 py-2.5 text-sm">
        <p className="flex items-start gap-2 text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <span>
            This preview environment runs on its bundled local database. The connection below is used when the application is deployed
            against PostgreSQL (set it as the <code className="rounded bg-secondary px-1 font-mono text-xs">DATABASE_URL</code> and run{' '}
            <code className="rounded bg-secondary px-1 font-mono text-xs">prisma migrate deploy</code>). Test results here verify host
            reachability only.
          </span>
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : isError ? (
        <ErrorStateInline message={error instanceof Error ? error.message : 'Could not load configuration'} onRetry={() => refetch()} />
      ) : (
        <>
          {configured && data?.config ? (
            <p className="text-sm text-muted-foreground" role="status">
              Configured{data.config.configuredAt ? ` · last saved ${new Date(data.config.configuredAt).toLocaleString('en-KE')}` : ''}
              {data.config.hasPassword ? ' · password stored' : ''}
            </p>
          ) : null}

          <div className="space-y-4 rounded-lg border bg-card p-4">
            <div className="space-y-1.5">
              <Label htmlFor="pg-url">Connection string (optional)</Label>
              <Input
                id="pg-url"
                type="password"
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                placeholder="postgresql://user:password@host:5432/database"
                autoComplete="off"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                If set, host/port for the test are taken from here. It is stored masked on the client.
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or individual fields <span className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pg-host">Host</Label>
                <Input id="pg-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="db.example.com" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pg-port">Port</Label>
                <Input id="pg-port" type="number" inputMode="numeric" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} placeholder="5432" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pg-db">Database</Label>
                <Input id="pg-db" value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="commerce_os" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pg-user">User</Label>
                <Input id="pg-user" value={dbUser} onChange={(e) => setDbUser(e.target.value)} placeholder="commerce_os_app" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pg-pass">Password</Label>
                <Input
                  id="pg-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={data?.config?.hasPassword ? '•••••••• (saved)' : 'Password'}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pg-ssl">SSL mode</Label>
                <Select value={sslMode} onValueChange={(v) => setSslMode(v as 'disable' | 'prefer' | 'require')}>
                  <SelectTrigger id="pg-ssl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disable">disable</SelectItem>
                    <SelectItem value="prefer">prefer</SelectItem>
                    <SelectItem value="require">require</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Save configuration'}
              </Button>
              <Button variant="outline" onClick={test} disabled={testing || busy} className="gap-1.5">
                <PlugZap className="size-4" aria-hidden /> {testing ? 'Testing…' : 'Test connection'}
              </Button>
              {configured ? (
                <Button variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => setConfirmClear(true)} disabled={busy}>
                  <Trash2 className="size-4" aria-hidden /> Remove
                </Button>
              ) : null}
            </div>

            {testResult ? (
              <div
                role="status"
                className={
                  testResult.ok
                    ? 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900'
                    : 'rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive'
                }
              >
                {testResult.message}
              </div>
            ) : null}
          </div>
        </>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the PostgreSQL configuration?</AlertDialogTitle>
            <AlertDialogDescription>The stored connection details will be deleted from the server. Deployment will fall back to environment variables.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); clearConfig() }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

interface TestResultShape {
  ok: boolean
  message: string
  latencyMs: number | null
}

function ErrorStateInline({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm">
      {message}
      {onRetry ? (
        <Button variant="outline" size="sm" className="ml-3" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}
