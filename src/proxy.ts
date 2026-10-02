// Next.js proxy (the layer formerly known as middleware).
//
// Two jobs:
//
// 1. CSRF protection — every state-changing API request (POST/PATCH/PUT/
//    DELETE) that carries an Origin header must come from this deployment's
//    own host. Browsers attach Origin to cross-site requests, so a foreign
//    site can no longer make a victim's cookie ride along on a write. The
//    check is strictly stronger than "cookie-authenticated only": a foreign
//    Origin is rejected even when the request also carries a Bearer token,
//    and requests without an Origin (server-to-server clients, the test
//    suite) pass — those are not browsers and cannot be forged this way.
//
// 2. The public pages /l/[id] and /s/[code] have segment not-found boundaries
//    that receive no route params. When a gone ad 404s, the boundary still
//    needs to know WHICH ad the URL pointed at, so it can offer similar live
//    ads from the same category. The proxy stamps the request path into the
//    headers; the not-found components read it with headers().

import { NextResponse, type NextRequest } from 'next/server'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function hostOf(originHeader: string | null): string | null {
  if (!originHeader) return null
  try {
    return new URL(originHeader).host
  } catch {
    return null
  }
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/') && !SAFE_METHODS.has(request.method)) {
    const originHost = hostOf(request.headers.get('origin'))
    if (originHost) {
      const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
      if (!host || originHost !== host) {
        return NextResponse.json(
          { error: 'This request was blocked for your protection — it did not come from Mudaala' },
          { status: 403 },
        )
      }
    }
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-mudaala-path', pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/l/:path*', '/s/:path*', '/api/:path*'],
}
