import type { NextConfig } from "next";

// Security headers (Task 4). frame-ancestors is env-tunable because the
// sandbox/preview legitimately embeds the app in a cross-origin iframe.
const frameAncestors = process.env.FRAME_ANCESTORS ?? "'self'"
const xFrameOptions =
  frameAncestors.trim() === "'none'" ? "DENY" : frameAncestors.trim() === "'self'" ? "SAMEORIGIN" : undefined

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
  outputFileTracingIncludes: {
    "**/*": [
      "./node_modules/pg-cloudflare/dist/**",
      "./node_modules/pg-cloudflare/esm/**",
    ],
  },
  devIndicators: false,
  typescript: { ignoreBuildErrors: false },
  reactStrictMode: false,
  experimental: { authInterrupts: true },
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    }
    return config
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
