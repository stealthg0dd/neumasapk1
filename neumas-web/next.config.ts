import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://neumas-production.up.railway.app";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Disable double-invoke in dev; remove once re-render loop is confirmed fixed
  // Produce a standalone build for Docker deployments.
  // Bundles the server and minimal node_modules into .next/standalone.
  output: "standalone",
  async redirects() {
    return [
      { source: "/inventory", destination: "/dashboard/inventory", permanent: false },
      { source: "/scans/new", destination: "/dashboard/scans/new", permanent: false },
      { source: "/scans", destination: "/dashboard/scans", permanent: false },
    ];
  },
  async rewrites() {
    return [
      {
        // Proxy /api/* → Railway backend /api/*
        // Next.js API routes under src/app/api/** take precedence over this rewrite.
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry organisation and project for source map uploads.
  org: process.env.SENTRY_ORG,
  project: "neumas-web",

  // Auth token for uploading source maps (set SENTRY_AUTH_TOKEN in env).
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Do not print Sentry CLI output unless running in CI.
  silent: !process.env.CI,

  // Upload a larger set of source maps to surface more readable stack traces.
  widenClientFileUpload: true,

  // Delete source map files after upload so they are not served publicly.
  sourcemaps: {
    filesToDeleteAfterUpload: [".next/static/**/*.map"],
  },

  // Tree-shake Sentry logger statements to reduce bundle size.
  disableLogger: true,
});
