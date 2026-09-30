// Duuka — client navigation + filter state.
// Views are client-side (the product ships as a single route), synced to the
// URL hash so the browser back button behaves as users expect.

import { create } from 'zustand'
import type { ListingQuery } from '@/lib/validation'

export type ViewName =
  | 'browse'
  | 'listing'
  | 'shop'
  | 'publish'
  | 'edit'
  | 'my-listings'
  | 'saved'
  | 'notifications'
  | 'account'
  | 'settings'

export interface View {
  name: ViewName
  id?: string
}

export interface BrowseFilters {
  q: string
  type: 'any' | 'OFFER' | 'REQUEST'
  category: string
  county: string
  unit: string
  minPrice: string
  maxPrice: string
  sort: 'newest' | 'price_asc' | 'price_desc'
  page: number
}

export const DEFAULT_FILTERS: BrowseFilters = {
  q: '',
  type: 'any',
  category: 'any',
  county: 'any',
  unit: 'any',
  minPrice: '',
  maxPrice: '',
  sort: 'newest',
  page: 1,
}

interface AppState {
  view: View
  authOpen: boolean
  filters: BrowseFilters
  navigate: (view: View) => void
  setAuthOpen: (open: boolean) => void
  setFilters: (patch: Partial<BrowseFilters>) => void
  applyQuery: (query: Partial<BrowseFilters>) => void
  resetFilters: () => void
}

export function viewToHash(view: View): string {
  switch (view.name) {
    case 'browse':
      return '#/browse'
    case 'listing':
      return view.id ? `#/listing/${view.id}` : '#/browse'
    case 'shop':
      return view.id ? `#/shop/${view.id}` : '#/browse'
    case 'publish':
      return '#/publish'
    case 'edit':
      return view.id ? `#/edit/${view.id}` : '#/my-listings'
    case 'my-listings':
      return '#/my-listings'
    case 'saved':
      return '#/saved'
    case 'notifications':
      return '#/notifications'
    case 'account':
      return '#/account'
    case 'settings':
      return '#/settings'
  }
}

export function hashToView(hash: string): View {
  const parts = hash.replace(/^#\/?/, '').split('/')
  const [name, id] = parts
  const valid: ViewName[] = ['browse', 'listing', 'shop', 'publish', 'edit', 'my-listings', 'saved', 'notifications', 'account', 'settings']
  if (valid.includes(name as ViewName)) {
    if ((name === 'listing' || name === 'edit' || name === 'shop') && !id) return { name: 'browse' }
    return { name: name as ViewName, id }
  }
  return { name: 'browse' }
}

export const useAppStore = create<AppState>((set) => ({
  view: { name: 'browse' },
  authOpen: false,
  filters: { ...DEFAULT_FILTERS },
  navigate: (view) => {
    if (typeof window !== 'undefined') {
      window.location.hash = viewToHash(view)
      window.scrollTo({ top: 0 })
    }
    set({ view })
  },
  setAuthOpen: (open) => set({ authOpen: open }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch, ...(patch.page === undefined ? { page: 1 } : {}) } })),
  applyQuery: (query) => set((s) => ({ filters: { ...s.filters, ...query, page: 1 } })),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),
}))

// Build the API query string from browse filters.
export function filtersToQuery(f: BrowseFilters): string {
  const params = new URLSearchParams()
  if (f.q.trim()) params.set('q', f.q.trim())
  if (f.type !== 'any') params.set('type', f.type)
  if (f.category !== 'any') params.set('category', f.category)
  if (f.county !== 'any') params.set('county', f.county)
  if (f.unit !== 'any') params.set('unit', f.unit)
  if (f.minPrice.trim() !== '') params.set('minPrice', f.minPrice)
  if (f.maxPrice.trim() !== '') params.set('maxPrice', f.maxPrice)
  params.set('sort', f.sort)
  params.set('page', String(f.page))
  return params.toString()
}

// Human-readable summary of a saved-search query (from stored queryJson).
export function describeQuery(q: Partial<ListingQuery>): string {
  const bits: string[] = []
  if (q.type) bits.push(q.type === 'OFFER' ? 'Offers' : 'Requests')
  if (q.q) bits.push(`"${q.q}"`)
  if (q.category) bits.push(q.category.replace(/-/g, ' '))
  if (q.county) bits.push(q.county)
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    const min = q.minPrice !== undefined ? `${q.minPrice}` : ''
    const max = q.maxPrice !== undefined ? `${q.maxPrice}` : ''
    bits.push(`${min || 'any'} – ${max || 'any'}`)
  }
  return bits.length > 0 ? bits.join(' · ') : 'Everything'
}
