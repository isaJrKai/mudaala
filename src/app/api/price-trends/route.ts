// Price trends for the signed-in Home dashboard: a 7-day median-price line
// per top category (the categories the user posts or saves most). All data
// comes from PriceSnapshot rows the cron sweep derived from ACTIVE listings -
// nothing is computed ad-hoc here, so what the chart shows is exactly what
// the daily process recorded. Categories without enough market data come back
// with empty points and the UI shows the honest "not enough listings" state.

import { route, jsonOk, requireUser } from '@/lib/api'
import { db } from '@/lib/db'
import { priceTrendsForUser, MIN_SAMPLE, TREND_DAYS } from '@/lib/price-trends'
import { pickMovers } from '@/lib/price-movers'
import { categoryLabel } from '@/lib/constants'

export async function GET() {
  return route(async () => {
    const user = await requireUser('Sign in to see price trends')

    const [ownListings, savedSearches] = await Promise.all([
      db.listing.findMany({
        where: { userId: user.id },
        select: { category: true, unit: true, currency: true },
        take: 500,
      }),
      db.savedSearch.findMany({
        where: { userId: user.id },
        select: { queryJson: true },
        take: 20,
      }),
    ])

    const savedSearchCategories: (string | null | undefined)[] = savedSearches.map((s) => {
      try {
        return (JSON.parse(s.queryJson) as { category?: string | null }).category
      } catch {
        return null // corrupt queryJson must not break the dashboard
      }
    })

    const { series } = await priceTrendsForUser({
      ownListings,
      savedSearchCategories,
      categoryLabel,
    })

    // Market-wide movers over the SAME recorded window - the "Moving this
    // week" list. Same table, same medians the cron recorded; the pure
    // picker decides what earns the word "moving".
    const since = new Date()
    since.setDate(since.getDate() - (TREND_DAYS - 1))
    const moverRows = await db.priceSnapshot.findMany({
      where: { date: { gte: since.toISOString().slice(0, 10) } },
      orderBy: { date: 'asc' },
      select: { category: true, unit: true, currency: true, date: true, medianPrice: true, sampleSize: true },
    })

    return jsonOk({
      series,
      movers: pickMovers(moverRows, categoryLabel),
      source: 'Based on Mudaala listings',
      minSample: MIN_SAMPLE,
    })
  })
}
