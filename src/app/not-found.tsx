// Mudaala's 404. Warm, honest, one way out — no dead-end void.

import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p className="font-display text-6xl font-semibold text-primary">404</p>
      <h1 className="font-display text-2xl font-semibold tracking-tight">This page has moved on</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        The page or ad you are looking for does not exist, expired, or was removed. The market itself is still open.
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
