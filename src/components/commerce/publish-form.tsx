'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { apiPost, apiPatch, apiGet } from '@/lib/client'
import type { Listing, SessionUser } from '@/lib/client'
import { listingCreateSchema, fieldErrors } from '@/lib/validation'
import { CATEGORIES, COUNTIES, UNITS } from '@/lib/constants'
import { useAppStore } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { ErrorState } from './listings-browse'
import { ListingListSkeleton } from './skeletons'
import { cn } from '@/lib/utils'

interface FormState {
  type: 'OFFER' | 'REQUEST'
  title: string
  description: string
  category: string
  price: string
  priceNegotiable: boolean
  unit: string
  quantity: string
  county: string
  area: string
  contactPhone: string
  contactWhatsapp: string
}

const EMPTY_FORM: FormState = {
  type: 'OFFER',
  title: '',
  description: '',
  category: 'none',
  price: '',
  priceNegotiable: false,
  unit: 'none',
  quantity: '',
  county: 'none',
  area: '',
  contactPhone: '',
  contactWhatsapp: '',
}

// Publish (and edit) a listing. Required fields are validated with the SAME
// shared schema the API uses; failed submissions preserve everything typed.
export function PublishForm() {
  const { navigate, setAuthOpen } = useAppStore()
  const { user, isLoading: sessionLoading } = useSession()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user && form.contactPhone === '') {
      setForm((f) => ({ ...f, contactPhone: user.phone }))
    }
  }, [user, form.contactPhone])

  if (sessionLoading) {
    return <ListingListSkeleton count={3} />
  }

  if (!user) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">Sign in to post a listing</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          An account keeps your listings, saved searches and alerts in one place. It takes less than a minute.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => setAuthOpen(true)}>Sign in or create account</Button>
          <Button variant="outline" onClick={() => navigate({ name: 'browse' })}>
            Keep browsing
          </Button>
        </div>
      </div>
    )
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => {
      if (!e[key]) return e
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  function buildPayload() {
    const priceRaw = form.price.trim()
    const quantityRaw = form.quantity.trim()
    return {
      type: form.type,
      title: form.title,
      description: form.description,
      category: form.category === 'none' ? undefined : form.category,
      price: priceRaw === '' ? null : Number(priceRaw),
      priceNegotiable: form.priceNegotiable,
      unit: form.unit === 'none' ? null : form.unit,
      quantity: quantityRaw === '' ? null : Number(quantityRaw),
      county: form.county === 'none' ? undefined : form.county,
      area: form.area.trim() === '' ? null : form.area.trim(),
      contactPhone: form.contactPhone,
      contactWhatsapp: form.contactWhatsapp.trim() === '' ? null : form.contactWhatsapp.trim(),
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    const payload = buildPayload()

    const parsed = listingCreateSchema.safeParse(payload)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }

    setBusy(true)
    try {
      const { listing } = await apiPost<{ listing: Listing }>('/api/listings', parsed.data)
      await queryClient.invalidateQueries({ queryKey: ['listings'] })
      await queryClient.invalidateQueries({ queryKey: ['my-listings'] })
      toast({ title: 'Listing published', description: 'Buyers and sellers can now find it in search.' })
      navigate({ name: 'listing', id: listing.id })
    } catch (err) {
      const withFields = err as Error & { fields?: Record<string, string> }
      if (withFields.fields) setErrors(withFields.fields)
      else
        toast({
          title: 'Could not publish listing',
          description: withFields.message,
          variant: 'destructive',
        })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5" autoComplete="on">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate({ name: 'browse' })}>
        <ArrowLeft className="size-4" aria-hidden /> Cancel
      </Button>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Post a listing</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Say clearly what you offer or what you need.</p>
      </div>

      <div className="space-y-1.5" role="group" aria-label="Listing type">
        <Label>I want to…</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['OFFER', 'REQUEST'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={form.type === t}
              onClick={() => set('type', t)}
              className={cn(
                'rounded-md border px-3 py-2.5 text-sm font-medium transition-colors',
                form.type === t ? 'border-primary bg-accent text-accent-foreground' : 'bg-card text-muted-foreground hover:bg-secondary',
              )}
            >
              {t === 'OFFER' ? 'Sell something (OFFER)' : 'Ask for something (REQUEST)'}
            </button>
          ))}
        </div>
      </div>

      <Field label="What exactly?" htmlFor="p-title" error={errors.title} hint={`${form.title.length}/120`}>
        <Input
          id="p-title"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder={form.type === 'OFFER' ? 'e.g. Copper scrap 99% clean' : 'e.g. Need wheat flour, 50 bags weekly'}
          maxLength={120}
          required
        />
      </Field>

      <Field label="Category" htmlFor="p-category" error={errors.category}>
        <Select value={form.category} onValueChange={(v) => set('category', v)}>
          <SelectTrigger id="p-category" aria-invalid={Boolean(errors.category)}>
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {CATEGORIES.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
                <span className="ml-1.5 text-xs text-muted-foreground">({c.examples})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Description" htmlFor="p-desc" error={errors.description} hint={`${form.description.length}/2000`}>
        <Textarea
          id="p-desc"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder={
            form.type === 'OFFER'
              ? 'Condition, packaging, collection or delivery, who should buy…'
              : 'Specification, how much, how often, who should contact you…'
          }
          required
        />
      </Field>

      <div className="rounded-lg border bg-secondary/30 p-3.5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={form.type === 'OFFER' ? 'Price (KSh)' : 'Budget (KSh)'} htmlFor="p-price" error={errors.price}>
            <Input
              id="p-price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              placeholder="Leave empty if negotiable"
            />
          </Field>
          <Field label="Per" htmlFor="p-unit" error={errors.unit}>
            <Select value={form.unit} onValueChange={(v) => set('unit', v)}>
              <SelectTrigger id="p-unit" aria-invalid={Boolean(errors.unit)}>
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u.key} value={u.key}>
                    per {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <Checkbox checked={form.priceNegotiable} onCheckedChange={(v) => set('priceNegotiable', v === true)} />
          Price is negotiable
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Quantity available" htmlFor="p-qty" error={errors.quantity}>
          <Input
            id="p-qty"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            placeholder="e.g. 500"
          />
        </Field>
        <Field label="County" htmlFor="p-county" error={errors.county}>
          <Select value={form.county} onValueChange={(v) => set('county', v)}>
            <SelectTrigger id="p-county" aria-invalid={Boolean(errors.county)}>
              <SelectValue placeholder="Choose county" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {COUNTIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Area / town (optional)" htmlFor="p-area" error={errors.area}>
        <Input id="p-area" value={form.area} onChange={(e) => set('area', e.target.value)} maxLength={80} placeholder="e.g. Gikomba" />
      </Field>

      <div className="rounded-lg border bg-secondary/30 p-3.5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Contact phone" htmlFor="p-phone" error={errors.contactPhone}>
            <Input
              id="p-phone"
              type="tel"
              inputMode="tel"
              value={form.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
              placeholder="0712 345 678"
              required
            />
          </Field>
          <Field label="WhatsApp (optional)" htmlFor="p-wa" error={errors.contactWhatsapp} hint="Leave empty if same as phone">
            <Input
              id="p-wa"
              type="tel"
              inputMode="tel"
              value={form.contactWhatsapp}
              onChange={(e) => set('contactWhatsapp', e.target.value)}
              placeholder="0712 345 678"
            />
          </Field>
        </div>
      </div>

      {errors._ ? (
        <p role="alert" className="text-sm text-destructive">
          {errors._}
        </p>
      ) : null}

      <div className="flex gap-2 pb-2">
        <Button type="submit" disabled={busy} className="flex-1 sm:flex-none sm:px-8">
          {busy ? 'Publishing…' : 'Publish listing'}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate({ name: 'browse' })} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

// Edit an existing ACTIVE listing (owner only).
export function EditListingForm({ id }: { id: string }) {
  const { navigate } = useAppStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [loaded, setLoaded] = useState<Listing | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    apiGet<{ listing: Listing }>(`/api/listings/${id}`)
      .then(({ listing }) => {
        setLoaded(listing)
        setForm({
          type: listing.type,
          title: listing.title,
          description: listing.description,
          category: listing.category,
          price: listing.price === null ? '' : String(listing.price),
          priceNegotiable: listing.priceNegotiable,
          unit: listing.unit ?? 'none',
          quantity: listing.quantity === null ? '' : String(listing.quantity),
          county: listing.county,
          area: listing.area ?? '',
          contactPhone: listing.contactPhone,
          contactWhatsapp: listing.contactWhatsapp ?? '',
        })
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load listing'))
  }, [id])

  const unitOptions = useMemo(() => UNITS, [])

  if (loadError) {
    return <ErrorState message={loadError} onRetry={() => window.location.reload()} />
  }
  if (!loaded) {
    return <ListingListSkeleton count={3} />
  }
  if (loaded.status !== 'ACTIVE') {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">This listing is {loaded.status.toLowerCase()}</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Reactivate it from My Listings before editing its details.</p>
        <Button className="mt-4" onClick={() => navigate({ name: 'my-listings' })}>
          Go to My Listings
        </Button>
      </div>
    )
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
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
    const current = loaded
    if (!current) return

    const priceRaw = form.price.trim()
    const quantityRaw = form.quantity.trim()
    const payload = {
      title: form.title,
      description: form.description,
      category: form.category === 'none' ? undefined : form.category,
      price: priceRaw === '' ? null : Number(priceRaw),
      priceNegotiable: form.priceNegotiable,
      unit: form.unit === 'none' ? null : form.unit,
      quantity: quantityRaw === '' ? null : Number(quantityRaw),
      county: form.county === 'none' ? undefined : form.county,
      area: form.area.trim() === '' ? null : form.area.trim(),
      contactPhone: form.contactPhone,
      contactWhatsapp: form.contactWhatsapp.trim() === '' ? null : form.contactWhatsapp.trim(),
    }

    const parsed = listingCreateSchema.safeParse({ ...payload, type: current.type })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }

    setBusy(true)
    try {
      await apiPatch(`/api/listings/${id}`, payload)
      await queryClient.invalidateQueries({ queryKey: ['listings'] })
      await queryClient.invalidateQueries({ queryKey: ['listing', id] })
      await queryClient.invalidateQueries({ queryKey: ['my-listings'] })
      toast({ title: 'Listing updated' })
      navigate({ name: 'listing', id })
    } catch (err) {
      const withFields = err as Error & { fields?: Record<string, string> }
      if (withFields.fields) setErrors(withFields.fields)
      else toast({ title: 'Could not save changes', description: withFields.message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate({ name: 'listing', id })}>
        <ArrowLeft className="size-4" aria-hidden /> Back to listing
      </Button>
      <h1 className="text-xl font-semibold tracking-tight">Edit listing</h1>

      <Field label="Title" htmlFor="e-title" error={errors.title} hint={`${form.title.length}/120`}>
        <Input id="e-title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} required />
      </Field>

      <Field label="Category" htmlFor="e-category" error={errors.category}>
        <Select value={form.category} onValueChange={(v) => set('category', v)}>
          <SelectTrigger id="e-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {CATEGORIES.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Description" htmlFor="e-desc" error={errors.description} hint={`${form.description.length}/2000`}>
        <Textarea id="e-desc" value={form.description} onChange={(e) => set('description', e.target.value)} rows={5} maxLength={2000} required />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Price (KSh)" htmlFor="e-price" error={errors.price}>
          <Input
            id="e-price"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={form.price}
            onChange={(e) => set('price', e.target.value)}
          />
        </Field>
        <Field label="Per" htmlFor="e-unit" error={errors.unit}>
          <Select value={form.unit} onValueChange={(v) => set('unit', v)}>
            <SelectTrigger id="e-unit">
              <SelectValue placeholder="Unit" />
            </SelectTrigger>
            <SelectContent>
              {unitOptions.map((u) => (
                <SelectItem key={u.key} value={u.key}>
                  per {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={form.priceNegotiable} onCheckedChange={(v) => set('priceNegotiable', v === true)} />
        Price is negotiable
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Quantity available" htmlFor="e-qty" error={errors.quantity}>
          <Input
            id="e-qty"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
          />
        </Field>
        <Field label="County" htmlFor="e-county" error={errors.county}>
          <Select value={form.county} onValueChange={(v) => set('county', v)}>
            <SelectTrigger id="e-county">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {COUNTIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Area / town (optional)" htmlFor="e-area" error={errors.area}>
        <Input id="e-area" value={form.area} onChange={(e) => set('area', e.target.value)} maxLength={80} />
      </Field>

      {errors._ ? (
        <p role="alert" className="text-sm text-destructive">
          {errors._}
        </p>
      ) : null}

      <div className="flex gap-2 pb-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate({ name: 'listing', id })} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
