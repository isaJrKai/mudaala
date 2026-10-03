// The sitemap: the catalog search engines crawl. Every ACTIVE ad (/l/{id})
// plus every live shop (/s/{code} - a shop with at least one ACTIVE ad).
// Expired, fulfilled and archived listings are deliberately excluded.
//
// Paged: entries beyond PAGE_SIZE roll onto /sitemap.xml?page=N. While
// everything fits one page, /sitemap.xml IS the urlset; once it would
// overflow, /sitemap.xml becomes a sitemapindex pointing at the pages.
// robots.txt keeps pointing at /sitemap.xml either way.

import { db } from '@/lib/db'
import { siteUrl } from '@/lib/site'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 2000

const xmlHeader = () => '<?xml version="1.0" encoding="UTF-8"?>'

const xml = (body: string) =>
  new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  })

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function urlEntry(loc: string, lastmod: Date | undefined, priority: string): string {
  return [
    '  <url>',
    `    <loc>${esc(loc)}</loc>`,
    ...(lastmod ? [`    <lastmod>${lastmod.toISOString()}</lastmod>`] : []),
    '    <changefreq>daily</changefreq>',
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n')
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('page')

  // PLACEHOLDER RULE - seed listings are development fixtures, never real
  // content: search engines never crawl them from the sitemap.
  const activeListing = { status: 'ACTIVE', expiresAt: { gt: new Date() }, isSeed: false }
  const [listingCount, shopCount] = await Promise.all([
    db.listing.count({ where: activeListing }),
    db.businessProfile.count({
      where: { shopCode: { not: null }, user: { listings: { some: activeListing } } },
    }),
  ])

  // Entry slot 0 is the home page; then every listing; then every live shop.
  const totalEntries = 1 + listingCount + shopCount
  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE))

  if (raw === null && totalPages > 1) {
    const entries: string[] = []
    for (let p = 1; p <= totalPages; p++) {
      entries.push(`  <sitemap>\n    <loc>${esc(`${siteUrl}/sitemap.xml?page=${p}`)}</loc>\n  </sitemap>`)
    }
    return xml(`${xmlHeader()}\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</sitemapindex>\n`)
  }

  const page = raw === null ? 1 : Number(raw)
  if (!Number.isInteger(page) || page < 1 || page > totalPages) {
    return new Response(`Sitemap page out of range: valid pages are 1 to ${totalPages}.`, {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  const start = (page - 1) * PAGE_SIZE
  const end = start + PAGE_SIZE
  const urls: string[] = []

  if (start < 1) urls.push(urlEntry(siteUrl, undefined, '1.0'))

  // Listings occupy entry slots [1, 1 + listingCount), freshest first.
  const lFrom = Math.max(start, 1)
  const lTo = Math.min(end, 1 + listingCount)
  if (lTo > lFrom) {
    const listings = await db.listing.findMany({
      where: activeListing,
      select: { id: true, refreshedAt: true },
      orderBy: { refreshedAt: 'desc' },
      skip: lFrom - 1,
      take: lTo - lFrom,
    })
    for (const listing of listings) {
      urls.push(urlEntry(`${siteUrl}/l/${listing.id}`, listing.refreshedAt, '0.7'))
    }
  }

  // Shops occupy [1 + listingCount, totalEntries).
  const sFrom = Math.max(start, 1 + listingCount)
  const sTo = Math.min(end, totalEntries)
  if (sTo > sFrom) {
    const shops = await db.businessProfile.findMany({
      where: { shopCode: { not: null }, user: { listings: { some: activeListing } } },
      select: { shopCode: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      skip: sFrom - 1 - listingCount,
      take: sTo - sFrom,
    })
    for (const shop of shops) {
      if (shop.shopCode) urls.push(urlEntry(`${siteUrl}/s/${shop.shopCode}`, shop.updatedAt, '0.6'))
    }
  }

  return xml(`${xmlHeader()}\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`)
}
