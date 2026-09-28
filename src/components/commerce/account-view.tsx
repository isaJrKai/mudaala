'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { User, Settings, LogOut, Store, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { apiGet, apiPut } from '@/lib/client'
import type { BusinessProfileT, SessionUser } from '@/lib/client'
import { businessProfileSchema, fieldErrors } from '@/lib/validation'
import { CATEGORIES, COUNTIES } from '@/lib/constants'
import { useAppStore } from '@/lib/store'
import { useSession, useSignOut } from '@/hooks/use-session'
import { ListingListSkeleton } from './skeletons'
import { ErrorState } from './listings-browse'

interface ProfileFormState {
  businessName: string
  category: string
  description: string
  county: string
  area: string
  phone: string
  whatsapp: string
  hours: string
}

// Account: sign-in state, optional business profile, links to settings.
export function AccountView() {
  const { user, isLoading } = useSession()
  const { navigate, setAuthOpen } = useAppStore()
  const signOut = useSignOut()
  const { toast } = useToast()

  if (isLoading) return <ListingListSkeleton count={2} />

  if (!user) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <User className="size-5" aria-hidden />
        </span>
        <h1 className="mt-3 text-lg font-semibold">You are browsing as a visitor</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Sign in to publish listings, save searches, get alerts and manage your business profile.
        </p>
        <Button className="mt-4" onClick={() => setAuthOpen(true)}>
          Sign in or create account
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{user.name}</h1>
          <p className="text-sm text-muted-foreground">{user.phone}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="gap-1.5" onClick={() => navigate({ name: 'my-listings' })}>
          <Store className="size-4" aria-hidden /> My listings
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={() => navigate({ name: 'settings' })}>
          <Settings className="size-4" aria-hidden /> Settings
        </Button>
        <Button
          variant="ghost"
          className="gap-1.5 text-muted-foreground"
          onClick={() =>
            signOut.mutate(undefined, {
              onSuccess: () => toast({ title: 'Signed out' }),
            })
          }
        >
          <LogOut className="size-4" aria-hidden /> Sign out
        </Button>
      </div>

      <Separator />

      <BusinessProfileSection user={user} />
    </div>
  )
}

function BusinessProfileSection({ user }: { user: SessionUser }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiGet<{ profile: BusinessProfileT | null }>('/api/profile'),
  })

  const [form, setForm] = useState<ProfileFormState>({
    businessName: '',
    category: 'none',
    description: '',
    county: 'none',
    area: '',
    phone: user.phone,
    whatsapp: '',
    hours: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (data && !hydrated) {
      const p = data.profile
      setForm({
        businessName: p?.businessName ?? user.name,
        category: p?.category ?? 'none',
        description: p?.description ?? '',
        county: p?.county ?? 'none',
        area: p?.area ?? '',
        phone: p?.phone ?? user.phone,
        whatsapp: p?.whatsapp ?? '',
        hours: p?.hours ?? '',
      })
      setHydrated(true)
    }
  }, [data, hydrated, user])

  if (isLoading) return <ListingListSkeleton count={1} />
  if (isError) return <ErrorState message={error instanceof Error ? error.message : 'Could not load profile'} onRetry={() => refetch()} />

  function set<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => {
      if (!e[key]) return e
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const payload = {
      businessName: form.businessName,
      category: !form.category || form.category === 'none' ? null : form.category,
      description: form.description.trim() === '' ? null : form.description.trim(),
      county: !form.county || form.county === 'none' ? null : form.county,
      area: form.area.trim() === '' ? null : form.area.trim(),
      phone: form.phone,
      whatsapp: form.whatsapp.trim() === '' ? null : form.whatsapp.trim(),
      hours: form.hours.trim() === '' ? null : form.hours.trim(),
    }
    const parsed = businessProfileSchema.safeParse(payload)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }

    setBusy(true)
    try {
      await apiPut('/api/profile', parsed.data)
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast({ title: 'Profile saved', description: 'Your listings now show this business information.' })
    } catch (err) {
      const withFields = err as Error & { fields?: Record<string, string> }
      if (withFields.fields) setErrors(withFields.fields)
      else toast({ title: 'Could not save profile', description: withFields.message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Business profile</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Optional. Shown on your listings so buyers know who they are dealing with.</p>
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md border bg-secondary/40 px-2.5 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Verification is not offered yet, so no “verified” badge is shown to anyone.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bp-name">Business name</Label>
        <Input id="bp-name" value={form.businessName} onChange={(e) => set('businessName', e.target.value)} maxLength={80} required />
        {errors.businessName ? <p role="alert" className="text-sm text-destructive">{errors.businessName}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="bp-category">Trade</Label>
          <Select value={form.category} onValueChange={(v) => set('category', v)}>
            <SelectTrigger id="bp-category" aria-invalid={Boolean(errors.category)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="none">Not specified</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category ? <p role="alert" className="text-sm text-destructive">{errors.category}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bp-county">County</Label>
          <Select value={form.county} onValueChange={(v) => set('county', v)}>
            <SelectTrigger id="bp-county">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="none">Not specified</SelectItem>
              {COUNTIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="bp-area">Area / town</Label>
          <Input id="bp-area" value={form.area} onChange={(e) => set('area', e.target.value)} maxLength={80} />
          {errors.area ? <p role="alert" className="text-sm text-destructive">{errors.area}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bp-hours">Opening hours</Label>
          <Input id="bp-hours" value={form.hours} onChange={(e) => set('hours', e.target.value)} maxLength={120} placeholder="e.g. Mon–Sat, 7am–6pm" />
          {errors.hours ? <p role="alert" className="text-sm text-destructive">{errors.hours}</p> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bp-phone">Contact phone</Label>
        <Input id="bp-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} required />
        {errors.phone ? <p role="alert" className="text-sm text-destructive">{errors.phone}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bp-wa">WhatsApp</Label>
        <Input id="bp-wa" type="tel" inputMode="tel" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
        {errors.whatsapp ? <p role="alert" className="text-sm text-destructive">{errors.whatsapp}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bp-desc">About the business</Label>
        <Textarea id="bp-desc" value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={500} />
        {errors.description ? <p role="alert" className="text-sm text-destructive">{errors.description}</p> : null}
      </div>

      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save profile'}
      </Button>
    </form>
  )
}
