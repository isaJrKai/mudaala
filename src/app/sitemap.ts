import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { listingSlug } from '@/lib/format'

// Sitemap for search engines: the homepage plus every ACTIVE listing's public
// ad page. Fulfilled/expired listings deliberately stay out — they render for
// people holding old links but should not compete in search.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const entries: MetadataRoute.Sitemap = [{ url: `${base}/`, lastModified: new Date() }]

  try {
    const rows = await db.listing.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, title: true, refreshedAt: true },
      orderBy: { refreshedAt: 'desc' },
      take: 5000,
    })
    for (const row of rows) {
      entries.push({ url: `${base}/listing/${listingSlug(row.title, row.id)}`, lastModified: row.refreshedAt })
    }
  } catch {
    // Database unavailable — the homepage entry alone is still a valid sitemap.
  }

  return entries
}
