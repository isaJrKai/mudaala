// Mudaala — canonical site origin.
//
// Ad pages carry real URLs into the world (WhatsApp shares, OG tags, the
// sitemap, JSON-LD), so absolute links need ONE origin. Production sets
// NEXT_PUBLIC_APP_URL to the public domain; dev falls back to localhost.
// Trailing slashes are trimmed so string concatenation stays exact.
export const siteUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
