import type { NextConfig } from "next";

// Security headers (Task 4). frame-ancestors is env-tunable because the
// sandbox/preview legitimately embeds the app in a cross-origin iframe.
// Production should set FRAME_ANCESTORS='none' (or a specific parent origin)
// in .env. X-Frame-Options mirrors the self/none cases; it is omitted when
// frame-ancestors names custom origins, since XFO cannot express a list.
const frameAncestors = process.env.FRAME_ANCESTORS ?? "'self'"
const xFrameOptions =
  frameAncestors.trim() === "'none'" ? "DENY" : frameAncestors.trim() === "'self'" ? "SAMEORIGIN" : undefined

// 'unsafe-eval' is dev-only: Next.js dev tooling (HMR / react-refresh)
// eval-compiles in development, while production output is precompiled and
// must not carry it. next.config.ts is evaluated by the Next.js CLI with
// NODE_ENV "development" under next dev and "production" under next build,
// so the check below resolves correctly per mode. 'unsafe-inline' stays for
// now: Next.js injects inline bootstrap scripts, and a nonce-based CSP is
// the future hardening step.
const scriptSrc = ["'self'", "'unsafe-inline'"]
if (process.env.NODE_ENV !== "production") scriptSrc.push("'unsafe-eval'")

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  `frame-ancestors ${frameAncestors}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=()" },
  ...(xFrameOptions ? [{ key: "X-Frame-Options", value: xFrameOptions }] : []),
]

const nextConfig: NextConfig = {
  output: "standalone",
  // Hide the dev-tools indicator so it never covers the mobile bottom nav.
  devIndicators: false,
  // Type errors fail the build: never ship unchecked types.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  // Enables forbidden()/unauthorized() from next/navigation, so the /admin
  // moderation desk returns a real HTTP 403 for non-admins.
  experimental: {
    authInterrupts: true,
  },
  // Task 4: security headers on every response.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
