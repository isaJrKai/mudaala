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
import { CATEGORIES, UNITS, CURRENCIES, countryDef, currencyDef } from '@/lib/constants'
import { useAppStore } from '@/lib/store'
import { useSession } from '@/hooks/use-session'
import { ErrorState } from './listings-browse'
import { ListingListSkeleton } from './skeletons'
import { PhotoPicker } from './photo-picker'
import { cn } from '@/lib/utils'
import { copy } from '@/lib/copy'

interface FormState {
  type: 'OFFER' | 'REQUEST'
  title: string
  description: string
  category: string
  price: string
  compareAtPrice: string
  currency: string
  priceNegotiable: boolean
  unit: string
  quantity: string
  county: string
  area: string
  contactPhone: string
  contactWhatsapp: string
  photos: string[]
}

const EMPTY_FORM: FormState = {
  type: 'OFFER',
  title: '',
  description: '',
  category: 'none',
  price: '',
  compareAtPrice: '',
  currency: 'UGX',
  priceNegotiable: false,
  unit: 'none',
  quantity: '',
  county: 'none',
  area: '',
  contactPhone: '',
  contactWhatsapp: '',
  photos: [],
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
    if (user) {
      // Pre-fill contact phone and default the currency to the account's
      // country (Uganda → USh). Still switchable per listing.
      setForm((f) => ({
        ...f,
        contactPhone: f.contactPhone === '' ? user.phone : f.contactPhone,
        currency: f.currency === 'UGX' ? countryDef(user.country ?? 'UG').currency : f.currency,
      }))
    }
  }, [user])

  if (sessionLoading) {
    return <ListingListSkeleton count={3} />
  }

  if (!user) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">{copy.publish.signInTitle}</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{copy.publish.signInSub}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => setAuthOpen(true)}>{copy.publish.signInCta}</Button>
          <Button variant="outline" onClick={() => navigate({ name: 'browse' })}>
            {copy.publish.keepBrowsing}
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
    const oldPriceRaw = form.compareAtPrice.trim()
    const quantityRaw = form.quantity.trim()
    return {
      type: form.type,
      title: form.title,
      description: form.description,
      category: form.category === 'none' ? undefined : form.category,
      price: priceRaw === '' ? null : Number(priceRaw),
      compareAtPrice: oldPriceRaw === '' ? null : Number(oldPriceRaw),
      currency: form.currency,
      country: user?.country ?? 'UG',
      priceNegotiable: form.priceNegotiable,
      unit: form.unit === 'none' ? null : form.unit,
      quantity: quantityRaw === '' ? null : Number(quantityRaw),
      county: form.county === 'none' ? undefined : form.county,
      area: form.area.trim() === '' ? null : form.area.trim(),
      contactPhone: form.contactPhone,
      contactWhatsapp: form.contactWhatsapp.trim() === '' ? null : form.contactWhatsapp.trim(),
      photos: form.photos,
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
      toast({ title: copy.publish.publishedToast, description: copy.publish.publishedToastSub })
      navigate({ name: 'listing', id: listing.id })
    } catch (err) {
      const withFields = err as Error & { fields?: Record<string, string> }
      if (withFields.fields) setErrors(withFields.fields)
      else
        toast({
          title: copy.publish.failedToast,
          description: withFields.message,
          variant: 'destructive',
        })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5" autoComplete="on">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-1 press" onClick={() => navigate({ name: 'browse' })}>
        <ArrowLeft className="size-4" aria-hidden /> Cancel
      </Button>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">{copy.publish.title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{copy.publish.sub}</p>
      </div>

      <div className="space-y-1.5" role="group" aria-label="Listing type">
        <Label>{copy.publish.iWantTo}</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['OFFER', 'REQUEST'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={form.type === t}
              onClick={() => {
                set('type', t)
                // Discounts belong to offers; clear the disabled field so a
                // stale old price never rides along with a REQUEST.
                if (t === 'REQUEST') set('compareAtPrice', '')
              }}
              className={cn(
                'press rounded-md border px-3 py-2.5 text-sm font-medium transition-colors',
                form.type === t ? 'border-primary bg-accent text-accent-foreground' : 'bg-card text-muted-foreground hover:bg-secondary',
              )}
            >
              {t === 'OFFER' ? copy.publish.sell : copy.publish.buy}
            </button>
          ))}
        </div>
      </div>

      <Field label="What exactly?" htmlFor="p-title" error={errors.title} hint={`${form.title.length}/120`}>
        <Input
          id="p-title"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder={form.type === 'OFFER' ? copy.publish.titlePlaceholderOffer : copy.publish.titlePlaceholderRequest}
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
              ? copy.publish.descPlaceholderOffer
              : copy.publish.descPlaceholderRequest
          }
          required
        />
      </Field>

      <Field label={copy.publish.photos} htmlFor="p-photos" hint={copy.publish.photosHint}>
        <PhotoPicker value={form.photos} onChange={(photos) => set('photos', photos)} max={4} />
      </Field>

      <div className="rounded-lg border bg-secondary/30 p-3.5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={form.type === 'OFFER' ? copy.common.price : copy.common.budget} htmlFor="p-price" error={errors.price}>
            <div className="flex gap-2">
              <Input
                id="p-price"
                type="number"
                inputMode="decimal"
                min={0}
                step={currencyDef(form.currency).zeroDecimal ? '1' : '0.01'}
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                placeholder="Leave empty if negotiable"
                className="flex-1"
              />
              {/* Native select: opens the phone's own picker, easiest for everyone. */}
              <select
                aria-label="Currency"
                value={form.currency}
                onChange={(e) => set('currency', e.target.value)}
                className="h-9 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.symbol}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field
            label={copy.publish.oldPrice}
            htmlFor="p-compare"
            error={errors.compareAtPrice}
            hint={form.type === 'OFFER' ? copy.publish.oldPriceHint : undefined}
          >
            <Input
              id="p-compare"
              type="number"
              inputMode="decimal"
              min={0}
              step={currencyDef(form.currency).zeroDecimal ? '1' : '0.01'}
              value={form.compareAtPrice}
              onChange={(e) => set('compareAtPrice', e.target.value)}
              placeholder="e.g. 30000"
              disabled={form.type === 'REQUEST'}
            />
          </Field>
          <Field label={copy.publish.per} htmlFor="p-unit" error={errors.unit}>
            <Select value={form.unit} onValueChange={(v) => set('unit', v)}>
              <SelectTrigger id="p-unit" aria-invalid={Boolean(errors.unit)}>
                <SelectValue placeholder={copy.publish.unitPlaceholder} />
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
          {copy.publish.priceNegotiable}
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={copy.publish.quantity} htmlFor="p-qty" error={errors.quantity}>
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
        <Field label={copy.browse.district} htmlFor="p-county" error={errors.county}>
          <Select value={form.county} onValueChange={(v) => set('county', v)}>
            <SelectTrigger id="p-county" aria-invalid={Boolean(errors.county)}>
              <SelectValue placeholder="Choose district" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {countryDef(user.country ?? 'UG').locations.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label={copy.publish.area} htmlFor="p-area" error={errors.area}>
        <Input id="p-area" value={form.area} onChange={(e) => set('area', e.target.value)} maxLength={80} placeholder="e.g. Kisenyi" />
      </Field>

      <div className="rounded-lg border bg-secondary/30 p-3.5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={copy.publish.contactPhone} htmlFor="p-phone" error={errors.contactPhone}>
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
          <Field label={copy.publish.whatsapp} htmlFor="p-wa" error={errors.contactWhatsapp} hint={copy.publish.whatsappHint}>
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
        <Button type="submit" disabled={busy} className="press flex-1 sm:flex-none sm:px-8">
          {busy ? copy.publish.submitting : copy.publish.submit}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate({ name: 'browse' })} disabled={busy} className="press">
          {copy.common.cancel}
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
          compareAtPrice: listing.compareAtPrice === null || listing.compareAtPrice === undefined ? '' : String(listing.compareAtPrice),
          currency: listing.currency ?? 'UGX',
          priceNegotiable: listing.priceNegotiable,
          unit: listing.unit ?? 'none',
          quantity: listing.quantity === null ? '' : String(listing.quantity),
          county: listing.county,
          area: listing.area ?? '',
          contactPhone: listing.contactPhone,
          contactWhatsapp: listing.contactWhatsapp ?? '',
          photos: listing.photos ?? [],
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
    const oldPriceRaw = form.compareAtPrice.trim()
    const quantityRaw = form.quantity.trim()
    const payload = {
      title: form.title,
      description: form.description,
      category: form.category === 'none' ? undefined : form.category,
      price: priceRaw === '' ? null : Number(priceRaw),
      compareAtPrice: oldPriceRaw === '' ? null : Number(oldPriceRaw),
      currency: form.currency,
      priceNegotiable: form.priceNegotiable,
      unit: form.unit === 'none' ? null : form.unit,
      quantity: quantityRaw === '' ? null : Number(quantityRaw),
      county: form.county === 'none' ? undefined : form.county,
      area: form.area.trim() === '' ? null : form.area.trim(),
      contactPhone: form.contactPhone,
      contactWhatsapp: form.contactWhatsapp.trim() === '' ? null : form.contactWhatsapp.trim(),
      photos: form.photos,
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
      <h1 className="text-xl font-semibold tracking-tight">{copy.publish.editTitle}</h1>

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

      <Field label="Photos" htmlFor="e-photos" hint="Real photos get more calls">
        <PhotoPicker value={form.photos} onChange={(photos) => set('photos', photos)} max={4} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Price" htmlFor="e-price" error={errors.price}>
          <div className="flex gap-2">
            <Input
              id="e-price"
              type="number"
              inputMode="decimal"
              min={0}
              step={currencyDef(form.currency).zeroDecimal ? '1' : '0.01'}
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              className="flex-1"
            />
            <select
              aria-label="Currency"
              value={form.currency}
              onChange={(e) => set('currency', e.target.value)}
              className="h-9 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {CURRENCIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.symbol}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="Old price (optional)" htmlFor="e-compare" error={errors.compareAtPrice} hint="shows as a discount">
          <Input
            id="e-compare"
            type="number"
            inputMode="decimal"
            min={0}
            step={currencyDef(form.currency).zeroDecimal ? '1' : '0.01'}
            value={form.compareAtPrice}
            onChange={(e) => set('compareAtPrice', e.target.value)}
            placeholder="e.g. 30000"
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
        <Field label="District / Region" htmlFor="e-county" error={errors.county}>
          <Select value={form.county} onValueChange={(v) => set('county', v)}>
            <SelectTrigger id="e-county">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {countryDef(loaded.country ?? 'UG').locations.map((c) => (
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
        <Button type="submit" disabled={busy} className="press">
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate({ name: 'listing', id })} disabled={busy} className="press">
          Cancel
        </Button>
      </div>
    </form>
  )
}
