// The safety card sits directly ABOVE the Call / WhatsApp buttons on every
// ad page - buyers read it before contact happens, not after. Three habits
// only, because that is what fits between the price and the phone number:
// meet in public, check the goods, never pay in advance.

import { Banknote, SearchCheck, Users } from 'lucide-react'

const TIPS = [
  { icon: Users, text: 'Meet in a public place: a market, a shop, somewhere with people around.' },
  { icon: SearchCheck, text: 'Check the goods carefully before you pay.' },
  { icon: Banknote, text: 'Never pay in advance for a delivery you have not seen.' },
] as const

export function SafetyCard() {
  return (
    <div
      className="rounded-md border border-amber-200 bg-amber-50 p-3"
      role="note"
      aria-label="Safety tips"
    >
      <p className="text-[13px] font-semibold text-amber-900">Before you call, stay safe</p>
      <ul className="mt-1.5 space-y-1">
        {TIPS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-1.5 text-[13px] leading-snug text-amber-900/90">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-amber-700" aria-hidden />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
