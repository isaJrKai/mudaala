'use client'

// Photo picker - built for market vendors on low-end phones:
//   • "Take photo" opens the camera directly (capture="environment") - for a
//     trader standing in front of their stock, the camera IS the flow.
//   • "Choose photo" opens the gallery for already-taken pictures.
//   • Each selected file uploads immediately; thumbnails show honest progress
//     and failures (never a fake success).
// Used for listing photos (up to 4) and the shop photo (1).

import { useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/client'
import { cn } from '@/lib/utils'

interface PhotoPickerProps {
  value: string[]
  onChange: (photos: string[]) => void
  max?: number
  /** Single-photo mode (shop avatar) renders one round tile. */
  single?: boolean
  label?: string
}

export function PhotoPicker({ value, onChange, max = 4, single = false, label }: PhotoPickerProps) {
  const { toast } = useToast()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const full = value.length >= max

  async function upload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    // Reset the input so picking the same file again still fires onChange.
    if (cameraRef.current) cameraRef.current.value = ''
    if (galleryRef.current) galleryRef.current.value = ''

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
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => upload(e.target.files)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => upload(e.target.files)}
      />

      {single ? (
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
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              className="flex size-16 items-center justify-center rounded-full border border-dashed bg-secondary/40 text-muted-foreground transition-colors hover:bg-accent"
              aria-label="Take a shop photo"
            >
              {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
            </button>
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
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={busy}
                className={cn(
                  'flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-secondary/30 text-muted-foreground transition-colors hover:bg-accent',
                  busy && 'opacity-60',
                )}
                aria-label="Take a photo"
              >
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
                <span className="text-[11px] font-medium">{busy ? 'Uploading…' : 'Take photo'}</span>
              </button>
            ) : null}

            {!full ? (
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                disabled={busy}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-secondary/30 text-muted-foreground transition-colors hover:bg-accent"
                aria-label="Choose from gallery"
              >
                <ImagePlus className="size-5" aria-hidden />
                <span className="text-[11px] font-medium">Gallery</span>
              </button>
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
