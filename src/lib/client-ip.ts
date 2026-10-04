// Mudaala - the ONE place that decides who a request came from.
//
// History taught this lesson: every route used to read the FIRST entry of
// x-forwarded-for, and the first entry is the one value a client can forge
// for free (`curl -H "x-forwarded-for: 1.2.3.4"`). A faker got a fresh
// rate-limit bucket on every request and the caps meant nothing. This module
// inverts the trust: only a header our OWN edge sets is believed - anything
// the client claims is noise.
//
// Order of belief:
//   1. TRUSTED_IP_HEADER (default "cf-connecting-ip" - Cloudflare stamps it
//      at the edge and clients cannot override it). If the named header
//      carries a comma list, the LAST entry wins: the rightmost value is
//      the one the trusted hop closest to us appended. One documented
//      exception: "x-vercel-forwarded-for" is client-first by Vercel's
//      contract, so its FIRST entry wins.
//   2. "x-real-ip" (nginx's single-value convention).
//   3. "x-vercel-forwarded-for" (when not already the trusted header).
//   4. Nothing trusted present:
//      - production: the LAST entry of x-forwarded-for - the closest thing
//        to a connection address a Next route handler can see. Client-forged
//        values live at the FRONT of the list and are ignored. A deploy with
//        NO proxy at all must set TRUSTED_IP_HEADER (or accept that the last
//        entry is client-supplied - documented in the hardening report).
//      - development: no proxy exists, so every direct caller is "local"
//        and shares one bucket. The test suite plays the edge by sending
//        the trusted header itself.

// The well-known alternative headers, in belief order after TRUSTED_IP_HEADER.
const ALT_HEADERS = ['x-real-ip', 'x-vercel-forwarded-for'] as const

function entries(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** One trusted header value -> the IP we believe, per that header's contract. */
function fromTrusted(headerName: string, raw: string): string | null {
  const parts = entries(raw)
  if (parts.length === 0) return null
  if (headerName === 'x-vercel-forwarded-for') return parts[0]! // Vercel: client first
  return parts[parts.length - 1]! // single-value headers pass through; lists take the trusted hop's entry
}

export function getClientIp(request: Request, env: Record<string, string | undefined> = process.env): string {
  const trustedName = (env.TRUSTED_IP_HEADER?.trim() || 'cf-connecting-ip').toLowerCase()

  // 1. The header our edge is configured to stamp - the only unconditional belief.
  const trusted = request.headers.get(trustedName)
  if (trusted) {
    const ip = fromTrusted(trustedName, trusted)
    if (ip) return ip
  }

  // 2-3. Well-known alternatives (skipped when the operator already named them).
  for (const alt of ALT_HEADERS) {
    if (alt === trustedName) continue
    const raw = request.headers.get(alt)
    if (!raw) continue
    const ip = fromTrusted(alt, raw)
    if (ip) return ip
  }

  // 4. Nothing trusted. Production: rightmost x-forwarded-for entry (our own
  //    proxy appended it). Dev: one honest bucket for the whole machine.
  const xff = request.headers.get('x-forwarded-for')
  if (xff && env.NODE_ENV === 'production') {
    const parts = entries(xff)
    if (parts.length > 0) return parts[parts.length - 1]!
  }
  return 'local'
}
