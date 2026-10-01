'use client'

// Share + view-count islands for the public ad page (and the in-app detail).
// The public page is a server component; these two are the only parts that
// need a browser.

import { useEffect, useState } from 'react'
import { Check, Link2, Share2 } from 'lucide-react'
import { whatsappShareUrl } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'

// The public page is rendered by the server, so a crawler never counts as a
// view. Real browsers ping the existing public detail endpoint once, which is
// the same counter the in-app detail uses — one number, one source of truth.
const pinged = new Set<string>()

export function ViewPing({ id }: { id: string }) {
  useEffect(() => {
    if (pinged.has(id)) return
    pinged.add(id)
    fetch(`/api/listings/${id}`).catch(() => undefined)
  }, [id])
  return null
}

// WhatsApp share + copy link. `url` is the canonical public ad URL the server
// computed (no hash/query noise from whatever address bar it renders in).
export function ShareRow({ url, shareText }: { url: string; shareText: string }) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast({ title: 'Link copied', description: 'Paste it in WhatsApp, SMS or Facebook.' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Could not copy', description: 'Long-press the address bar to copy this link.' })
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <a
        href={whatsappShareUrl(shareText)}
        target="_blank"
        rel="noopener noreferrer"
        className="press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md border border-emerald-600 bg-emerald-50 text-[15px] font-medium text-emerald-800 hover:bg-emerald-100"
        aria-label="Share this listing on WhatsApp"
      >
        <Share2 className="size-4" aria-hidden /> Share on WhatsApp
      </a>
      <button
        type="button"
        onClick={copy}
        className="press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md border bg-card text-[15px] font-medium text-foreground hover:bg-accent"
        aria-label="Copy the link to this listing"
      >
        {copied ? (
          <>
            <Check className="size-4 text-emerald-700" aria-hidden /> Copied
          </>
        ) : (
          <>
            <Link2 className="size-4 text-muted-foreground" aria-hidden /> Copy link
          </>
        )}
      </button>
    </div>
  )
}
