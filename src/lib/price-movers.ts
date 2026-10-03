// Mudaala - market movers for the home dashboard's "Moving this week".
//
// Pure logic over PriceSnapshot rows: no db, no React - the suite tests this
// file directly (the same discipline as env-flags and storage). The caller
// (the price-trends route) hands over the recorded window; this file decides
// what earns the word "moving" and says nothing about anything else.
//
// Honesty rules:
//   - A mover needs a sample-backed median on BOTH ends of the window. One
//     busy day beside one quiet day is not a trend, it is noise.
//   - The move is computed on the medians the daily cron actually recorded -
//     nothing is recomputed ad-hoc, nothing is interpolated between days.
//   - Small wiggles stay quiet: below MOVER_MIN_PCT a change does not earn a
//     spot on a list titled "Moving this week".

export interface MoverRow {
  category: string
  unit: string
  currency: string
  date: string
  medianPrice: number
  sampleSize: number
}

export interface PriceMover {
  category: string
  categoryLabel: string
  unit: string
  currency: string
  firstMedian: number
  lastMedian: number
  /** Signed whole-percent change across the window. */
  pct: number
  /** Sample behind the latest median. */
  sampleSize: number
  direction: 'up' | 'down'
}

// Both endpoint days must carry at least this many real listings behind their
// median. Matches the recording bar in price-trends.ts (MIN_SAMPLE): rows in
// the table are already recorded at that bar, so for database rows this guard
// is a second lock on the same door - it exists so this function stays honest
// even when fed rows from somewhere else.
export const MOVER_MIN_SAMPLE = 5

// A move under this percent is not "moving", it is the market breathing.
export const MOVER_MIN_PCT = 2

// How many movers the card shows at most.
export const MOVER_LIMIT = 6

export function pickMovers(rows: MoverRow[], categoryLabel: (key: string) => string): PriceMover[] {
  const groups = new Map<string, MoverRow[]>()
  for (const row of rows) {
    const key = `${row.category}|${row.unit}|${row.currency}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  const movers: PriceMover[] = []
  for (const [key, group] of groups) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (first.date === last.date) continue
    if (first.sampleSize < MOVER_MIN_SAMPLE || last.sampleSize < MOVER_MIN_SAMPLE) continue

    const pct = Math.round(((last.medianPrice - first.medianPrice) / first.medianPrice) * 100)
    if (Math.abs(pct) < MOVER_MIN_PCT) continue

    const [category, unit, currency] = key.split('|')
    movers.push({
      category,
      categoryLabel: categoryLabel(category),
      unit,
      currency,
      firstMedian: first.medianPrice,
      lastMedian: last.medianPrice,
      pct,
      sampleSize: last.sampleSize,
      direction: pct < 0 ? 'down' : 'up',
    })
  }

  movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.categoryLabel.localeCompare(b.categoryLabel))
  return movers.slice(0, MOVER_LIMIT)
}
