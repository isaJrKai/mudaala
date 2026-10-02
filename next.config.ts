import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Hide the dev-tools indicator so it never covers the mobile bottom nav.
  devIndicators: false,
  // Type errors fail the build — never ship unchecked types.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  // Enables forbidden()/unauthorized() from next/navigation — the /admin
  // moderation desk returns a real HTTP 403 for non-admins.
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
