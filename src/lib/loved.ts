// Duuka — the buyer's shortlist: things you loved while browsing, kept the
// same place the basket lives — on this phone, no account (rule 1).
//
//   • A heart is "I want to find this again", a softer intent than the
//     basket's "I am taking this". The shortlist re-checks every item
//     against the public API when shown, exactly like the basket does —
//     so a loved item that sold out says so instead of pretending.
//   • Same hand-rolled store pattern as basket.ts: parse-once at module
//     init, getSnapshot returns the cached state, server snapshot is EMPTY
//     (hydration-safe by construction).
//   • Newest first, capped at 40 — a shortlist longer than that is a
//     hoarding problem, and the UI says so honestly when the cap bites.

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'duuka.loved.v1'
const MAX_LOVED = 40

const EMPTY: string[] = []

// Parse-once: used ONLY at module init. The live snapshot is the cached
// `ids` below — getSnapshot must return a stable reference or React loops.
function parseStored(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY
    return parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    return EMPTY
  }
}

let ids: string[] = typeof window === 'undefined' ? EMPTY : parseStored()
const listeners = new Set<() => void>()

function commit(next: string[]) {
  ids = next
  try {
    // ids IS the persisted shape: a plain array of listing ids, newest first.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked — the in-memory shortlist still works for this visit.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// React binding — server snapshot is EMPTY, so SSR and hydration agree.
export function useLovedIds(): string[] {
  return useSyncExternalStore(subscribe, () => ids, () => EMPTY)
}

export function isLoved(list: string[], listingId: string): boolean {
  return list.includes(listingId)
}

export type LoveResult = 'loved' | 'unloved' | 'full'

/** Toggle one listing. Returns what happened so the UI can animate only a
 *  REAL love (the pop never fakes success) and explain the cap honestly. */
export function toggleLoved(listingId: string): LoveResult {
  if (ids.includes(listingId)) {
    commit(ids.filter((id) => id !== listingId))
    return 'unloved'
  }
  if (ids.length >= MAX_LOVED) return 'full'
  commit([listingId, ...ids])
  return 'loved'
}

export function unlove(listingId: string): void {
  if (ids.includes(listingId)) commit(ids.filter((id) => id !== listingId))
}

export const LOVED_CAP = MAX_LOVED
