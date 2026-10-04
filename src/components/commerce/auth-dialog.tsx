'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { apiPost, storeSessionToken } from '@/lib/client'
import type { SessionUser } from '@/lib/client'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/lib/store'
import { registerSchema, loginSchema } from '@/lib/validation'
import { DEFAULT_COUNTRY, countryDef, type CountryDef } from '@/lib/constants'

export function AuthDialog() {
  const open = useAppStore((s) => s.authOpen)
  const setOpen = useAppStore((s) => s.setAuthOpen)
  const [tab, setTab] = useState<'signin' | 'register' | 'forgot'>('signin')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight text-primary">Welcome to Mudaala</DialogTitle>
          <DialogDescription>One account for everything. Buy, sell, save searches and get alerts.</DialogDescription>
        </DialogHeader>
        {/* 'forgot' is a reachable tab value with no trigger - the Sign in form's
            "Forgot password?" link switches to it, so the TabsList stays two
            clearly-named doors. */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'signin' | 'register' | 'forgot')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="register">Create account</TabsTrigger>
          </TabsList>
          <TabsContent value="signin">
            <SignInForm onDone={() => setOpen(false)} onForgot={() => setTab('forgot')} />
          </TabsContent>
          <TabsContent value="register">
            <RegisterForm onDone={() => setOpen(false)} onSwitch={() => setTab('signin')} />
          </TabsContent>
          <TabsContent value="forgot">
            <ForgotPasswordForm onDone={() => setOpen(false)} onBack={() => setTab('signin')} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// Dev-only demo accounts: one tap fills real seeded credentials. They are the
// fastest way for anyone reviewing the app to get in - no typing, no typos.
const DEMO_ACCOUNTS = [
  { label: 'Nakato Fresh Produce (Kampala)', phone: '0772123456' },
  { label: 'Kampalamart Scrap (Kampala)', phone: '0776123456' },
  { label: 'Gulu Agri Supplies (Gulu)', phone: '0712000001' },
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

function SignInForm({ onDone, onForgot }: { onDone: () => void; onForgot: () => void }) {
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
        <p className="text-xs text-muted-foreground">Any Ugandan format works: 07…, 2567… or +2567…</p>
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
      <p className="text-center">
        <button
          type="button"
          onClick={onForgot}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Forgot password?
        </button>
      </p>
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
  const [countryKey] = useState<string>(DEFAULT_COUNTRY)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const country: CountryDef = countryDef(countryKey)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = registerSchema.safeParse({ name, phone, country: countryKey, password, acceptTerms })
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? '_'
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }
    // The checkbox is required - caught client-side with the same words the
    // server uses, so an unchecked box never even becomes a request.
    if (!acceptTerms) {
      setErrors({ acceptTerms: 'Confirm you are 18+ and accept the Terms and Privacy Policy' })
      return
    }

    setBusy(true)
    try {
      const res = await apiPost<{ user: SessionUser; sessionToken: string }>('/api/auth/register', parsed.data)
      if (res.sessionToken) storeSessionToken(res.sessionToken)
      await queryClient.invalidateQueries()
      toast({ title: `Account created. Welcome, ${res.user.name}` })
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
      {/* Uganda is the only market for now - shown as fixed fact, not a
          choice, so nobody wonders whether their country is supported. */}
      <div className="space-y-1.5">
        <Label htmlFor="reg-country">Country</Label>
        <div
          id="reg-country"
          className="flex h-9 w-full items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-foreground"
        >
          Uganda (+256)
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-phone">Phone number</Label>
        <Input
          id="reg-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0772 345 678"
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
      {/* Required 18+ / Terms / Privacy confirmation - also enforced by the
          API, so an old client cannot skip it. */}
      <div className="space-y-1.5">
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="reg-terms"
            checked={acceptTerms}
            onCheckedChange={(v) => setAcceptTerms(v === true)}
            className="mt-0.5"
          />
          <Label htmlFor="reg-terms" className="text-sm font-normal leading-snug">
            I am 18+ and accept the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">
              Terms
            </a>{' '}and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">
              Privacy Policy
            </a>
          </Label>
        </div>
        {errors.acceptTerms ? <p className="text-sm text-destructive">{errors.acceptTerms}</p> : null}
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

// Two calm steps, no jargon: the phone, then the code from the SMS. The API
// answers the same way whether or not the number is registered, so the first
// screen never says "that number is wrong" - the code screen is where a real
// mismatch (wrong code, expired code) is explained, and always with the same
// sentence.
function ForgotPasswordForm({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { toast } = useToast()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function requestCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!phone.trim()) {
      setError('Enter your phone number first')
      return
    }

    setBusy(true)
    try {
      await apiPost<{ ok: boolean; message: string }>('/api/auth/forgot-password', { phone })
      // Same message either way - relay it as-is and move on to the code.
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    setBusy(true)
    try {
      const res = await apiPost<{ ok: boolean; message: string }>('/api/auth/reset-password', {
        phone,
        code,
        newPassword,
      })
      toast({ title: res.message || 'Password updated' })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'phone') {
    return (
      <form onSubmit={requestCode} className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="forgot-phone">Your phone number</Label>
          <Input
            id="forgot-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0772 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            We will text you a 6-digit code if this number has an account.
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Sending code…' : 'Send code'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          <button type="button" onClick={onBack} className="underline underline-offset-2">
            Back to sign in
          </button>
        </p>
      </form>
    )
  }

  return (
    <form onSubmit={submitReset} className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Enter the 6-digit code we sent to your phone, then choose a new password.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="forgot-code">Code from the SMS</Label>
        <Input
          id="forgot-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="forgot-password">New password</Label>
        <Input
          id="forgot-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">At least 8 characters, and not your phone number.</p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Updating password…' : 'Set new password'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        <button type="button" onClick={onBack} className="underline underline-offset-2">
          Back to sign in
        </button>
      </p>
    </form>
  )
}
