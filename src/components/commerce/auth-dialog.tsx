'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { apiPost } from '@/lib/client'
import type { SessionUser } from '@/lib/client'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/lib/store'
import { registerSchema, loginSchema } from '@/lib/validation'

export function AuthDialog() {
  const open = useAppStore((s) => s.authOpen)
  const setOpen = useAppStore((s) => s.setAuthOpen)
  const [tab, setTab] = useState<'signin' | 'register'>('signin')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Welcome to Commerce OS</DialogTitle>
          <DialogDescription>Sign in to publish listings, save searches and get alerts.</DialogDescription>
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
      const { user } = await apiPost<{ user: SessionUser }>('/api/auth/login', parsed.data)
      await queryClient.invalidateQueries()
      toast({ title: `Signed in as ${user.name}` })
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
          placeholder="0712 345 678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
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
    </form>
  )
}

function RegisterForm({ onDone, onSwitch }: { onDone: () => void; onSwitch: () => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = registerSchema.safeParse({ name, phone, password })
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
      const { user } = await apiPost<{ user: SessionUser }>('/api/auth/register', parsed.data)
      await queryClient.invalidateQueries()
      toast({ title: `Account created — welcome, ${user.name}` })
      onDone()
    } catch (err) {
      const withFields = err as Error & { fields?: Record<string, string> }
      if (withFields.fields) setErrors(withFields.fields)
      else setErrors({ _: err instanceof Error ? err.message : 'Registration failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="reg-name">Your name or business name</Label>
        <Input
          id="reg-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jomo Scrap Traders"
          maxLength={80}
          required
        />
        {errors.name ? <p className="text-sm text-destructive">{errors.name}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-phone">Phone number</Label>
        <Input
          id="reg-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
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
