'use client'

// "Show number" - the tap that trades a page load for a phone number.
//
// The ad's server HTML carries no digits, so a crawler that sweeps every ad
// collects nothing. A buyer who is actually interested taps once: this calls
// the rate-limited contact endpoint, then renders the number with its Call
// and WhatsApp doors, exactly the contact the ad always offered. If the
// lookup fails the number never pretends to be there - an honest retry.

import { useState } from 'react'
import { Phone } from 'lucide-react'
import { WhatsAppIcon } from './brand-icons'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/client'
import { copy } from '@/lib/copy'
import { formatPhonePretty, telLink, whatsappLink } from '@/lib/format'

interface ContactResponse {
  phone: string
  whatsapp: string | null
}

export function ShowNumber({
  listingId,
  listingTitle,
  listingType,
}: {
  listingId: string
  listingTitle: string
  listingType: 'OFFER' | 'REQUEST'
}) {
  const [contact, setContact] = useState<ContactResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  async function reveal() {
    if (loading) return
    setLoading(true)
    setFailed(false)
    try {
      setContact(await apiGet<ContactResponse>(`/api/listings/${listingId}/contact`))
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  if (!contact) {
    return (
      <div className="mt-3">
        <Button type="button" onClick={reveal} disabled={loading} className="press h-11 w-full gap-1.5 text-[15px]">
          <Phone className="size-4" aria-hidden />
          {loading ? copy.listing.showNumberLoading : copy.listing.showNumber}
        </Button>
        {failed ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{copy.listing.showNumberError}</p>
            <Button type="button" variant="outline" size="sm" onClick={reveal} className="shrink-0">
              {copy.listing.retry}
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{copy.listing.showNumberHint}</p>
        )}
      </div>
    )
  }

  const pretty = formatPhonePretty(contact.phone)
  return (
    <div className="mt-3">
      <p className="text-lg font-semibold tracking-wide">{pretty}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Button asChild className="press h-11 flex-1 text-[15px]">
          <a href={telLink(contact.phone)} aria-label={`Call ${pretty}`}>
            <Phone className="size-4" aria-hidden /> {copy.common.call}
          </a>
        </Button>
        {contact.whatsapp ? (
          <Button
            asChild
            variant="outline"
            className="press h-11 flex-1 border-emerald-600 text-[15px] text-emerald-800 hover:bg-emerald-50"
          >
            <a href={whatsappLink(contact.whatsapp, listingTitle, listingType)} target="_blank" rel="noopener noreferrer">
              <WhatsAppIcon className="size-4" aria-hidden /> WhatsApp
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
