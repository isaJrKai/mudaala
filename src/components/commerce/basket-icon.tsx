'use client'

// Mudaala's basket glyph — the lucide ShoppingBasket shape with one addition:
// a "goods" layer that rises inside the basket as the buyer's list grows.
//
//   • The fill is a rect clipped to the basket body, moved with transform
//     only (GPU path, no geometry animation). The transition lives in
//     globals.css (.basket-fill) so rapid adds RETARGET smoothly instead of
//     restarting — CSS transition, not keyframes.
//   • It never quite reaches the brim (capped ~85% of the body) — the
//     basket always has room, per the design brief.
//   • fill level is a FRACTION OF THE BASKET BODY (0..1), already capped by
//     the caller; the math below maps it into viewBox units.

import { useId } from 'react'
import { cn } from '@/lib/utils'

// Basket body interior in the 24-unit viewBox: rim at y=11, bottom ≈ y=20.3.
const BODY_TOP = 11
const BODY_BOTTOM = 20.3
const BODY_HEIGHT = BODY_BOTTOM - BODY_TOP

export function BasketGlyph({
  fill,
  className,
}: {
  /** 0..1 — how full the basket BODY looks. The caller caps below 1. */
  fill: number
  className?: string
}) {
  const clipId = useId()
  // rect starts at y=0 and is pushed DOWN so its top edge lands exactly at
  // the fill line. fill=0 → top at the body's bottom (nothing visible);
  // fill=0.85 → a visible sliver of rim stays unfilled. Never full.
  const rectTop = BODY_BOTTOM - Math.min(Math.max(fill, 0), 1) * BODY_HEIGHT

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('size-5 shrink-0', className)}
    >
      <defs>
        {/* Interior of the basket body — slightly inset so the fill never
            peeks past the 2px outline strokes drawn on top of it. */}
        <clipPath id={clipId}>
          <path d="M3.9 11 L20.1 11 L18.8 18.3 Q18.5 20.2 16.7 20.2 L7.3 20.2 Q5.5 20.2 5.2 18.3 Z" />
        </clipPath>
      </defs>

      {/* The goods — under every stroke, clipped to the body. */}
      <g clipPath={`url(#${clipId})`}>
        <rect
          className="basket-fill"
          x="2"
          y="0"
          width="20"
          height="48"
          fill="var(--primary)"
          style={{ transform: `translateY(${rectTop}px)` }}
        />
      </g>

      {/* The basket itself — handles, rim, body, weave ribs — over the fill. */}
      <path d="m5 11 4-7" />
      <path d="m19 11-4-7" />
      <path d="M2 11h20" />
      <path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L20.5 11" />
      <path d="m9 11 1 9" />
      <path d="m4.5 15.5h15" />
      <path d="m15 11-1 9" />
    </svg>
  )
}
