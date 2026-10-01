// Mudaala — price trends domain service.
//
// PriceSnapshot rows are DERIVED data: the daily cron sweep computes the
// median asking price per (category, unit, currency) from ACTIVE listings.
// Nothing here invents a number — a median is only recorded when at least
// MIN_SAMPLE real listings back it, and each median stays inside one
// currency so "USh 20,000 / kg" can never be averaged with "KSh 500 / kg".

import { db } from '@/lib/db'

// Below this many active listings a "median" is just someone's single price —
// the chart stays empty instead of pretending the market spoke.
export const MIN_SAMPLE = 5

// The Home chart window: the last 7 recorded days.
export const TREND_DAYS = 7

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Record today's medians. Idempotent: upsert on (date, category, unit,
// currency) means the sweep can run repeatedly (and from multiple callers)
// without duplicating rows or inflating counts. OFFER listings only: an
// OFFER's price is what a seller ASKS; a REQUEST's price is what a buyer
// WANTS TO PAY — averaging the two would fabricate a number neither side
// ever quoted.
export async function recordPriceSnapshots(): Promise<number> {
  const rows = await db.listing.findMany({
    where: {
      status: 'ACTIVE',
      type: 'OFFER',
      price: { not: null },
      unit: { not: null },
    },
    select: { category: true, unit: true, currency: true, price: true },
    take: 5000,
  })

  // Group in JS — SQLite groupBy can't cap-by-group and the volumes here are
  // market-stall scale.
  const groups = new Map<string, { category: string; unit: string; currency: string; prices: number[] }>()
  for (const row of rows) {
    if (row.price === null || row.unit === null) continue
    const key = `${row.category}|${row.unit}|${row.currency}`
    const group = groups.get(key) ?? { category: row.category, unit: row.unit, currency: row.currency, prices: [] }
    group.prices.push(row.price)
    groups.set(key, group)
  }

  const date = todayKey()
  let written = 0
  for (const group of groups.values()) {
    if (group.prices.length < MIN_SAMPLE) continue
    const medianPrice = median(group.prices)
    await db.priceSnapshot.upsert({
      where: {
        date_category_unit_currency: {
          date,
          category: group.category,
          unit: group.unit,
          currency: group.currency,
        },
      },
      create: {
        date,
        category: group.category,
        unit: group.unit,
        currency: group.currency,
        medianPrice,
        sampleSize: group.prices.length,
      },
      update: { medianPrice, sampleSize: group.prices.length },
    })
    written++
  }
  return written
}

export interface TrendPoint {
  date: string
  medianPrice: number
  sampleSize: number
}

export interface TrendSeries {
  category: string
  categoryLabel: string
  unit: string
  currency: string
  points: TrendPoint[]
}

// The category a user cares about most: counted from what they post and what
// they save — the two real signals the product already has.
export function topCategories(
  ownListings: { category: string }[],
  savedSearchCategories: (string | null | undefined)[],
  limit = 3,
): string[] {
  const score = new Map<string, number>()
  for (const listing of ownListings) score.set(listing.category, (score.get(listing.category) ?? 0) + 1)
  for (const category of savedSearchCategories) {
    if (category) score.set(category, (score.get(category) ?? 0) + 1)
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([category]) => category)
}

// Pick the (unit, currency) a series should follow for one category.
// Preference 1: the combo the USER actually posts in that category (their own
// active priced listings — the market they personally trade in).
// Preference 2: the combo with the most recorded sample across the window
// (what the market actually speaks in), so saved-search-only categories still
// get a line when data exists.
export function pickUnitCurrency(
  userCombos: { unit: string | null; currency: string }[],
  snapshotCombos: { unit: string; currency: string; sample: number }[],
): { unit: string; currency: string } | null {
  const counts = new Map<string, number>()
  for (const combo of userCombos) {
    if (!combo.unit) continue
    const key = `${combo.unit}|${combo.currency}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let best: { key: string; count: number } | null = null
  for (const [key, count] of counts) {
    if (!best || count > best.count) best = { key, count }
  }
  if (best) {
    const [unit, currency] = best.key.split('|')
    return { unit, currency }
  }
  const topSnapshot = [...snapshotCombos].sort((a, b) => b.sample - a.sample)[0]
  return topSnapshot ? { unit: topSnapshot.unit, currency: topSnapshot.currency } : null
}

// Build the 7-day series for a user's top categories. Categories with no
// qualifying snapshots return an EMPTY points array — the caller decides how
// to present honest absence ("Not enough listings yet").
export async function priceTrendsForUser(params: {
  ownListings: { category: string; unit: string | null; currency: string }[]
  savedSearchCategories: (string | null | undefined)[]
  categoryLabel: (key: string) => string
}): Promise<{ series: TrendSeries[] }> {
  const categories = topCategories(
    params.ownListings.map((l) => ({ category: l.category })),
    params.savedSearchCategories,
  )
  if (categories.length === 0) return { series: [] }

  const since = new Date()
  since.setDate(since.getDate() - (TREND_DAYS - 1))
  const sinceKey = since.toISOString().slice(0, 10)

  const series: TrendSeries[] = []
  for (const category of categories) {
    const combos = await db.priceSnapshot.groupBy({
      by: ['unit', 'currency'],
      where: { category, date: { gte: sinceKey } },
      _sum: { sampleSize: true },
    })
    const snapshotCombos = combos.map((c) => ({ unit: c.unit, currency: c.currency, sample: c._sum.sampleSize ?? 0 }))
    const chosen = pickUnitCurrency(
      params.ownListings.filter((l) => l.category === category),
      snapshotCombos,
    )
    if (!chosen) continue

    const points = await db.priceSnapshot.findMany({
      where: { category, unit: chosen.unit, currency: chosen.currency, date: { gte: sinceKey } },
      orderBy: { date: 'asc' },
      select: { date: true, medianPrice: true, sampleSize: true },
    })
    series.push({
      category,
      categoryLabel: params.categoryLabel(category),
      unit: chosen.unit,
      currency: chosen.currency,
      points: points.map((p) => ({ date: p.date, medianPrice: p.medianPrice, sampleSize: p.sampleSize })),
    })
  }
  return { series }
}
