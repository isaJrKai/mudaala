// The Duka curve — the brand's sweeping edge, the one shape that belongs to
// no template. It appears ONLY on doorway surfaces and NEVER on functional
// ones (cards, forms, lists, chips, buttons stay rectangles — a signature
// that shows up everywhere is just decoration again):
//
//   1. The browse front-door ribbon (the poster move — green band that rises
//      out of the page through the curve on top and flows back in below)
//   2. The shop cover-photo seam
//   3. The lettermark signboard (no-photo shop)
//   4. The printed QR poster — the brand's physical surface
//
// One path, one direction, everywhere: the edge sits low on the left and
// sweeps up to the right. Filled with currentColor, so the same path works
// over any background — text-primary where the green mass carries the edge,
// text-card / text-background where the page eats into it. Pure paint — no
// text rides on it, nothing animates, aria-hidden everywhere.
export function DukaCurve({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 10" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d="M0 7.2 C 26 8.8, 58 2.6, 100 1.6 L 100 10 L 0 10 Z" fill="currentColor" />
    </svg>
  )
}
