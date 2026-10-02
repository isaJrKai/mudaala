// Next.js proxy (the layer formerly known as middleware).
//
// The public pages /l/[id] and /s/[code] have segment not-found boundaries
// that receive no route params. When a gone ad 404s, the boundary still
// needs to know WHICH ad the URL pointed at, so it can offer similar live
// ads from the same category. The proxy stamps the request path into the
// headers; the not-found components read it with headers().
//
// Matcher is deliberately tight: only the two public page trees need it.
// The SPA, the API and uploads never pay for this.

import { NextResponse, type NextRequest } from 'next/server'

export default function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-mudaala-path', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/l/:path*', '/s/:path*'],
}
