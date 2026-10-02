'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CheckCircle2, Circle, Info, User, Settings, LogOut, Store, MapPin } from 'lucide-react'
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
import { CATEGORIES, countryDef } from '@/lib/constants'
import { useAppStore } from '@/lib/store'
import { useSession, useSignOut } from '@/hooks/use-session'
import { formatPhonePretty } from '@/lib/format'
import { PhotoPicker } from './photo-picker'
import { ListingListSkeleton } from './skeletons'
import { ErrorState } from './listings-browse'

interface ProfileFormState {
  businessName: string
  photoUrl: string
  category: string
  description: string
  county: string
  area: string
  phone: string
  whatsapp: string
  hours: string
}

// Debounce a changing value (shop-name typing) without setState-in-effect:
// the update happens inside the timer callback, never synchronously.
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
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
          <p className="text-sm text-muted-foreground">{formatPhonePretty(user.phone)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="gap-1.5" onClick={() => navigate({ name: 'shop', id: user.id })}>
          <Store className="size-4" aria-hidden /> View my shop
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={() => navigate({ name: 'my-listings' })}>
          <User className="size-4" aria-hidden /> My listings
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
    photoUrl: '',
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
        photoUrl: p?.photoUrl ?? '',
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

  // Live same-name guard: while the seller types a shop name that another
  // shop already uses, say so gently and point at the fix (add your area).
  // Their own saved name never triggers it; the check skips while typing.
  // Hooks stay above the early returns — they run on every render.
  const savedName = (data?.profile?.businessName ?? '').trim()
  const currentName = form.businessName.trim()
  const debouncedName = useDebounced(currentName, 450)
  const checkedName = debouncedName.length >= 2 && debouncedName !== savedName ? debouncedName : ''
  const { data: nameCheck } = useQuery({
    queryKey: ['check-shop-name', checkedName],
    queryFn: () =>
      apiGet<{ taken: boolean; matches: { area: string | null; county: string | null }[] }>(
        `/api/shops/check-name?name=${encodeURIComponent(checkedName)}&exclude=${user.id}`,
      ),
    enabled: checkedName !== '',
    staleTime: 30_000,
  })

  if (isLoading) return <ListingListSkeleton count={1} />
  if (isError) return <ErrorState message={error instanceof Error ? error.message : 'Could not load profile'} onRetry={() => refetch()} />

  const nameClash = checkedName !== '' && nameCheck?.taken === true
  const clashPlace = [nameCheck?.matches?.[0]?.area, nameCheck?.matches?.[0]?.county].filter(Boolean).join(', ')

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
      photoUrl: form.photoUrl.trim() === '' ? null : form.photoUrl.trim(),
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
      toast({ title: 'Shop saved', description: 'Your listings now show this name and information.' })
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
        <h2 className="flex items-center gap-1.5 text-base font-semibold">
          <Store className="size-4" aria-hidden /> My Shop
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          This is your space on Mudaala — give it the name of your shop. Buyers see it on every listing you post.
        </p>
        {data?.profile?.shopCode ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Your shop code is <span className="font-mono font-semibold text-foreground">{data.profile.shopCode}</span> — it never changes, so buyers and old posters can always find you.
          </p>
        ) : null}
      </div>

      {/* Verify your shop — honest completeness. Each tick is something the
          seller actually filled in; no platform vetting is claimed. */}
      <ShopChecklist form={form} />

      {/* Optional shop spot — captured at the shop with one tap, so buyers
          nearby see the shop first. Stored blurred to ~100 m; removable. */}
      <ShopLocationBlock profile={data?.profile ?? null} />

      <div className="rounded-lg border bg-secondary/30 p-3.5">
        <PhotoPicker value={form.photoUrl ? [form.photoUrl] : []} onChange={(photos) => set('photoUrl', photos[0] ?? '')} max={1} single />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bp-name">Shop name</Label>
        <Input id="bp-name" value={form.businessName} onChange={(e) => set('businessName', e.target.value)} maxLength={80} required />
        {errors.businessName ? <p role="alert" className="text-sm text-destructive">{errors.businessName}</p> : null}
        {nameClash ? (
          <p
            role="status"
            className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Another shop already uses this name{clashPlace ? ` in ${clashPlace}` : ''}. You can still use it — buyers tell
              shops apart by area and shop code — so add your <strong>Area / town</strong> below to make yours easy to recognise.
            </span>
          </p>
        ) : null}
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
          <Label htmlFor="bp-county">District / Region</Label>
          <Select value={form.county} onValueChange={(v) => set('county', v)}>
            <SelectTrigger id="bp-county">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="none">Not specified</SelectItem>
              {countryDef(user.country ?? 'UG').locations.map((c) => (
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

      <Button type="submit" disabled={busy} className="press">
        {busy ? 'Saving…' : 'Save shop'}
      </Button>
    </form>
  )
}

// The seller's shop spot. The browser's permission prompt only ever appears
// because of an explicit tap — and the copy tells the seller to stand at the
// shop first. Everything degrades softly: denial and removal both leave the
// rest of the shop exactly as it was.
function ShopLocationBlock({ profile }: { profile: BusinessProfileT | null }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<'idle' | 'locating' | 'saving'>('idle')
  const [locError, setLocError] = useState(false)

  const saved = profile?.lat != null && profile?.lng != null
  const busy = phase !== 'idle'

  async function persist(lat: number | null, lng: number | null) {
    setPhase('saving')
    try {
      await apiPut('/api/profile/location', { lat, lng })
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast({
        title: lat === null ? 'Location removed' : 'Shop location saved',
        description: lat === null ? 'Buyers can still find you by your area and shop code.' : 'Buyers near your shop will see it first.',
      })
      setLocError(false)
    } catch (err) {
      toast({ title: 'Could not save location', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setPhase('idle')
    }
  }

  function capture() {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setLocError(true)
      return
    }
    setLocError(false)
    setPhase('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => persist(pos.coords.latitude, pos.coords.longitude),
      () => {
        setPhase('idle')
        setLocError(true)
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  return (
    <div className="rounded-lg border bg-secondary/30 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="size-4 text-primary" aria-hidden /> Shop location
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {saved
              ? 'Saved ✓ — buyers nearby see your shop first. Your exact spot is never shown; distances stay approximate.'
              : 'Stand at your shop, then tap. The browser asks for permission once — say yes and we save the spot. Nothing is tracked.'}
          </p>
        </div>
        {saved ? (
          <div className="flex shrink-0 gap-1.5">
            <Button type="button" variant="outline" size="sm" className="press" disabled={busy} onClick={capture}>
              {phase === 'locating' ? 'Finding…' : 'Update'}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground press" disabled={busy} onClick={() => persist(null, null)}>
              Remove
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5 press" disabled={busy} onClick={capture}>
            <MapPin className="size-3.5" aria-hidden />
            {phase === 'locating' ? 'Finding you…' : phase === 'saving' ? 'Saving…' : 'Add my shop location'}
          </Button>
        )}
      </div>
      {locError ? (
        <p
          role="status"
          className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>We could not get your location. You can try again later — your Area / town still helps buyers find you.</span>
        </p>
      ) : null}
    </div>
  )
}

// The "verify my shop" moment, told honestly: a shop is complete when its
// photo, story, place, hours and WhatsApp are all filled in. The checklist
// updates live as the seller types — ticks appear before they even save.
function ShopChecklist({ form }: { form: ProfileFormState }) {
  const items: { key: string; label: string; done: boolean }[] = [
    { key: 'photo', label: 'Shop photo', done: form.photoUrl.trim() !== '' },
    { key: 'description', label: 'About the shop', done: form.description.trim() !== '' },
    { key: 'area', label: 'Location area', done: form.area.trim() !== '' },
    { key: 'hours', label: 'Opening hours', done: form.hours.trim() !== '' },
    { key: 'whatsapp', label: 'WhatsApp number', done: form.whatsapp.trim() !== '' },
  ]
  const done = items.filter((i) => i.done).length
  const complete = done === items.length

  return (
    <div
      className={complete ? 'rounded-lg border border-emerald-600/30 bg-emerald-50/60 p-3.5' : 'rounded-lg border bg-secondary/30 p-3.5'}
      aria-label="Shop completeness checklist"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {complete ? (
            <BadgeCheck className="size-4 text-emerald-700" aria-hidden />
          ) : (
            <CheckCircle2 className="size-4 text-muted-foreground" aria-hidden />
          )}
          {complete ? 'Shop details complete' : 'Complete your shop'}
        </p>
        <span className={complete ? 'text-sm font-bold text-emerald-800' : 'text-sm font-semibold text-muted-foreground'}>
          {done}/{items.length}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {complete
          ? 'Buyers see the ✓ Complete badge on your shop page.'
          : 'Shops with complete details look real — buyers call them with confidence.'}
      </p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-label={`${done} of ${items.length} shop details complete`}
      >
        <div
          className={complete ? 'h-full rounded-full bg-emerald-600' : 'h-full rounded-full bg-primary'}
          style={{ width: `${(done / items.length) * 100}%` }}
        />
      </div>
      <ul className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.key} className={item.done ? 'flex items-center gap-1.5' : 'flex items-center gap-1.5 text-muted-foreground'}>
            {item.done ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-700" aria-label="done" />
            ) : (
              <Circle className="size-4 shrink-0 text-muted-foreground/50" aria-label="not done yet" />
            )}
            <span className={item.done ? 'font-medium' : ''}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
