'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { apiPost, storeSessionToken } from '@/lib/client'
import type { SessionUser } from '@/lib/client'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/lib/store'
import { registerSchema, loginSchema } from '@/lib/validation'
import { COUNTRIES, DEFAULT_COUNTRY, countryDef, type CountryDef } from '@/lib/constants'

export function AuthDialog() {
  const open = useAppStore((s) => s.authOpen)
  const setOpen = useAppStore((s) => s.setAuthOpen)
  const [tab, setTab] = useState<'signin' | 'register'>('signin')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Welcome to Duuka</DialogTitle>
          <DialogDescription>One account for everything — buy, sell, save searches and get alerts.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'signin' | 'register')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="register">Create account</TabsTrigger>
          </TabsList>
          <TabsContent value="signin">
            <SignInForm onDone={() => setOpen(false)} />
          </TabsContent>
          <TabsContent value="register">
            <RegisterForm onDone={() => setOpen(false)} onSwitch={() => setTab('signin')} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// Dev-only demo accounts: one tap fills real seeded credentials. They are the
// fastest way for anyone reviewing the app to get in — no typing, no typos.
const DEMO_ACCOUNTS = [
  { label: 'Uganda — Kampalamart', phone: '0772123456' },
  { label: 'Uganda — Nakato Fresh', phone: '0776123456' },
  { label: 'Tanzania — Dodoma Supplies', phone: '0712345678' },
] as const
const DEMO_PASSWORD = 'demo1234'

function DemoQuickFill({ onFill }: { onFill: (phone: string, password: string) => void }) {
  if (process.env.NODE_ENV !== 'development') return null
  return (
    <div className="mt-4 rounded-lg border border-dashed bg-secondary/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">Demo accounts (development only)</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {DEMO_ACCOUNTS.map((d) => (
          <button
            key={d.phone}
            type="button"
            onClick={() => onFill(d.phone, DEMO_PASSWORD)}
            className="flex items-center justify-between rounded-md border bg-card px-2.5 py-1.5 text-left text-xs hover:bg-accent"
          >
            <span className="font-medium">{d.label}</span>
            <span className="text-muted-foreground">{d.phone}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Password for all: {DEMO_PASSWORD}</p>
    </div>
  )
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = loginSchema.safeParse({ phone, password })
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      setError(first?.message ?? 'Check your details')
      return
    }

    setBusy(true)
    try {
      const res = await apiPost<{ user: SessionUser; sessionToken: string }>('/api/auth/login', parsed.data)
      if (res.sessionToken) storeSessionToken(res.sessionToken)
      await queryClient.invalidateQueries()
      toast({ title: `Signed in as ${res.user.name}` })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="signin-phone">Phone number</Label>
        <Input
          id="signin-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0772 345 678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">Works with Uganda, Tanzania and Kenya numbers.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signin-password">Password</Label>
        <Input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      <DemoQuickFill
        onFill={(fillPhone, fillPassword) => {
          setPhone(fillPhone)
          setPassword(fillPassword)
          setError(null)
        }}
      />
    </form>
  )
}

function RegisterForm({ onDone, onSwitch }: { onDone: () => void; onSwitch: () => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [countryKey, setCountryKey] = useState<string>(DEFAULT_COUNTRY)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const country: CountryDef = countryDef(countryKey)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = registerSchema.safeParse({ name, phone, country: countryKey, password })
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? '_'
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setBusy(true)
    try {
      const res = await apiPost<{ user: SessionUser; sessionToken: string }>('/api/auth/register', parsed.data)
      if (res.sessionToken) storeSessionToken(res.sessionToken)
      await queryClient.invalidateQueries()
      toast({ title: `Account created — welcome, ${res.user.name}` })
      onDone()
    } catch (err) {
      const withFields = err as Error & { fields?: Record<string, string> }
      if (withFields.fields) setErrors(withFields.fields)
      else setErrors({ _: err instanceof Error ? err.message : 'Registration failed' })
    } finally {
      setBusy(false)
    }
  }

  // Native <select> on purpose: it opens the phone's own picker, which is far
  // easier for low-literacy users than a custom dropdown.
  return (
    <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="reg-name">Your name or shop name</Label>
        <Input
          id="reg-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Nalongo Hardware"
          maxLength={80}
          required
        />
        <p className="text-xs text-muted-foreground">This is the name buyers will see on your listings.</p>
        {errors.name ? <p className="text-sm text-destructive">{errors.name}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-country">Country</Label>
        <select
          id="reg-country"
          value={countryKey}
          onChange={(e) => setCountryKey(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {COUNTRIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name} (+{c.dialCode})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-phone">Phone number</Label>
        <Input
          id="reg-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={country.key === 'UG' ? '0772 345 678' : country.key === 'TZ' ? '0712 345 678' : '0712 345 678'}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        {errors.phone ? <p className="text-sm text-destructive">{errors.phone}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-password">Password</Label>
        <Input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        {errors.password ? <p className="text-sm text-destructive">{errors.password}</p> : null}
      </div>
      {errors._ ? (
        <p role="alert" className="text-sm text-destructive">
          {errors._}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Already registered?{' '}
        <button type="button" onClick={onSwitch} className="underline underline-offset-2">
          Sign in
        </button>
      </p>
    </form>
  )
}
