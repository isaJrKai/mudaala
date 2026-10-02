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
};

export default nextConfig;
