import type { MetadataRoute } from 'next'

// Robots: everything public is crawlable; the sitemap points crawlers at the
// live ad pages. Replaces the old static public/robots.txt so the sitemap URL
// follows the deployment's own domain.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${base}/sitemap.xml`,
  }
}
