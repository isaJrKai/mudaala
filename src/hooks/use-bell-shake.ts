'use client'

import { useEffect, useRef } from 'react'

// The bell swing: a pendulum that decays — it hangs from its crown, so
// transform-origin sits near the top of the glyph and every swing loses
// amplitude until it settles. WAAPI one-shot on a DOM ref, the same pattern
// as the basket pop: an external-system change (the unread count) mutating
// the DOM from an effect, no React state, no cascading render.
const SWING_KEYFRAMES: Keyframe[] = [
  { transform: 'rotate(0deg)' },
  { transform: 'rotate(-16deg)', offset: 0.14 },
  { transform: 'rotate(13deg)', offset: 0.32 },
  { transform: 'rotate(-9deg)', offset: 0.52 },
  { transform: 'rotate(6deg)', offset: 0.72 },
  { transform: 'rotate(-2.5deg)', offset: 0.88 },
  { transform: 'rotate(0deg)' },
]

// When the bell answers: the user's brief was "if a notification comes OR if
// you got notifications, you can see that little bell shake" — so it swings
// when unread alerts first become visible in this visit (a reload with unread
// counts too — that is exactly "you got notifications") and whenever the
// count grows (a new alert arrived while polling). Reading alerts (count
// falling) is quiet: the bell never scolds you for catching up.
export function useBellShake(unread: number) {
  const ref = useRef<HTMLSpanElement>(null)
  const seenRef = useRef<number | null>(null)

  useEffect(() => {
    const prev = seenRef.current
    seenRef.current = unread
    if (unread <= 0) return
    const shouldSwing = prev === null || unread > prev
    if (!shouldSwing) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    ref.current?.animate(SWING_KEYFRAMES, {
      duration: 700,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
    })
  }, [unread])

  return ref
}
