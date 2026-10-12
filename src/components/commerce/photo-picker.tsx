'use client'

// Photo picker - built for market vendors on low-end phones:
//   • "Take photo" opens the camera directly (capture="environment") - for a
//     trader standing in front of their stock, the camera IS the flow.
//   • "Choose photo" opens the gallery for already-taken pictures.
//   • Each selected file uploads immediately; thumbnails show honest progress
//     and failures (never a fake success).
// Used for listing photos (up to 4) and the shop photo (1).

import { useId, useState } from 'react'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/client'
import { cn } from '@/lib/utils'

interface PhotoPickerProps {
  value: string[]
  onChange: (photos: string[]) => void
  max?: number
  /** Single-photo mode (shop avatar or cover) stores one URL. */
  single?: boolean
  /** Wide preview and replace controls for a shop cover image. */
  cover?: boolean
  label?: string
}

export function PhotoPicker({ value, onChange, max = 4, single = false, cover = false, label }: PhotoPickerProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const inputId = useId().replace(/:/g, '')
  const cameraId = `${inputId}-camera`
  const galleryId = `${inputId}-gallery`

  const full = value.length >= max

  async function upload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await apiFetch<{ url: string }>('/api/upload', { method: 'POST', body })
      onChange(single ? [res.url] : [...value, res.url].slice(0, max))
    } catch (err) {
      toast({
        title: 'Photo could not be uploaded',
        description: err instanceof Error ? err.message : 'Try a smaller JPG or PNG photo.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  function remove(url: string) {
    onChange(value.filter((v) => v !== url))
  }

  return (
    <div>
      <input
        id={cameraId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          upload(e.target.files)
          e.currentTarget.value = ''
        }}
      />
      <input
        id={galleryId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          upload(e.target.files)
          // Allow the same gallery photo to be selected again after a failed
          // upload or after replacing the current image.
          e.currentTarget.value = ''
        }}
      />

      {single && cover ? (
        <div className="space-y-2">
          {value[0] ? (
            <div className="relative overflow-hidden rounded-md border bg-secondary/30">
              <img src={value[0]} alt="Shop cover preview" className="h-28 w-full object-cover sm:h-36" />
              <button
                type="button"
                onClick={() => onChange([])}
                className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full border bg-card/95 text-muted-foreground hover:text-destructive"
                aria-label="Remove shop cover photo"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : (
            <div className="flex h-28 items-center justify-center rounded-md border border-dashed bg-secondary/30 px-3 text-center text-xs text-muted-foreground sm:h-36">
              No cover photo yet
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <label htmlFor={cameraId} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium hover:bg-accent', busy && 'pointer-events-none opacity-60')}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
              {busy ? 'Uploading…' : 'Take photo'}
            </label>
            <label htmlFor={galleryId} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium hover:bg-accent', busy && 'pointer-events-none opacity-60')}>
              <ImagePlus className="size-4" aria-hidden /> Choose photo
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Use a wide landscape photo. JPG, PNG or WebP; up to 8 MB.</p>
        </div>
      ) : single ? (
        <div className="flex items-center gap-3">
          {value[0] ? (
            <div className="relative">
              <img
                src={value[0]}
                alt="Shop photo"
                className="size-16 rounded-full border object-cover"
              />
              <button
                type="button"
                onClick={() => onChange([])}
                className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground hover:text-destructive"
                aria-label="Remove shop photo"
              >
                <X className="size-3" aria-hidden />
              </button>
            </div>
          ) : (
            <label
              htmlFor={cameraId}
              className={cn(
                'flex size-16 items-center justify-center rounded-full border border-dashed bg-secondary/40 text-muted-foreground transition-colors hover:bg-accent',
                busy && 'pointer-events-none opacity-60',
              )}
              aria-label="Take a shop photo"
            >
              {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
            </label>
          )}
          <div className="text-sm text-muted-foreground">
            {value[0] ? 'Looking good. Buyers see this next to your name.' : 'A real photo of your shop builds trust.'}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap gap-2">
            {value.map((url) => (
              <div key={url} className="group relative size-20 overflow-hidden rounded-md border bg-secondary/30">
                <img src={url} alt="Listing photo" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => remove(url)}
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full border bg-card/95 text-muted-foreground hover:text-destructive"
                  aria-label="Remove photo"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </div>
            ))}

            {!full || value.length === 0 ? (
              <label
                htmlFor={cameraId}
                className={cn(
                  'flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-secondary/30 text-muted-foreground transition-colors hover:bg-accent',
                  busy && 'pointer-events-none opacity-60',
                )}
                aria-label="Take a photo"
              >
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
                <span className="text-[11px] font-medium">{busy ? 'Uploading…' : 'Take photo'}</span>
              </label>
            ) : null}

            {!full ? (
              <label
                htmlFor={galleryId}
                className={cn(
                  'flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-secondary/30 text-muted-foreground transition-colors hover:bg-accent',
                  busy && 'pointer-events-none opacity-60',
                )}
                aria-label="Choose from gallery"
              >
                <ImagePlus className="size-5" aria-hidden />
                <span className="text-[11px] font-medium">Gallery</span>
              </label>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {label ?? `Up to ${max} photos. Real photos get more calls.`}
            {value.length > 0 ? ` (${value.length}/${max})` : ''}
          </p>
        </div>
      )}
    </div>
  )
}
