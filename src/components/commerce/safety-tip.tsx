import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

// The safety tip card shown before Call/Chat on every listing page — the
// three habits that stop most marketplace crime. Server-safe (pure markup):
// both the in-app detail and the public ad page render the identical card.
export function SafetyTip({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2.5', className)}
      aria-label="Safety tips"
    >
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-900">
        <ShieldCheck className="size-4 shrink-0 text-emerald-700" aria-hidden />
        Stay safe when you trade
      </p>
      <ul className="mt-1 space-y-0.5 text-[13px] leading-snug text-emerald-900/90">
        <li>Meet in a public place, in daylight.</li>
        <li>Check the goods carefully before you pay.</li>
        <li>Never pay in advance for something you have not seen.</li>
      </ul>
    </div>
  )
}
