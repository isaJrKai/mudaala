// The sitemap: one URL for every ACTIVE ad. This is the catalog search
// engines crawl — Jiji's entire growth engine is organic search landing on
// ad pages, and the sitemap is what invites the crawler in. Expired,
// fulfilled and archived listings are deliberately excluded (their pages
// render for humans with honest banners, but they are noindex).

import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { siteUrl } from '@/lib/site'
import { adPath } from '@/lib/format'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listings = await db.listing.findMany({
    where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
    select: { id: true, title: true, refreshedAt: true },
    orderBy: { refreshedAt: 'desc' },
    take: 5000,
  })

  return [
    {
      url: siteUrl,
      changeFrequency: 'daily',
      priority: 1,
    },
    ...listings.map((listing) => ({
      url: `${siteUrl}${adPath(listing.title, listing.id)}`,
      lastModified: listing.refreshedAt,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ]
}
