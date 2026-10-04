// Mudaala's 404 for shop codes. A mistyped till number should feel like a
// shrug, not a wall: say what a code looks like, offer the way in.

import Link from 'next/link'

export default function ShopNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p className="text-6xl font-semibold text-primary tabular-nums">MD-????</p>
      <h1 className="text-2xl font-semibold tracking-tight">This shop is not on Mudaala (yet)</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        Double-check the shop code with the seller (it looks like MD-4821) or browse the market for what you need.
      </p>
      <Link
        href="/#/browse"
        className="press mt-2 flex h-11 items-center justify-center rounded-md bg-primary px-6 text-[15px] font-medium text-primary-foreground hover:bg-primary/90"
      >
        Browse the market
      </Link>
    </div>
  )
}
