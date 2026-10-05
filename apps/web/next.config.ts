import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A second dev server (e.g. an editor preview) can set NEXT_DIST_DIR so it never
  // shares the build folder with your own `pnpm dev`; sharing one corrupts both.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  devIndicators: false,
  transpilePackages: ['@decibels/design-tokens'],
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Client router cache. App pages fetch their own data in the browser (TanStack Query),
    // so their server payload barely changes: reuse it instead of a server round trip per tab click.
    staleTimes: { dynamic: 30, static: 300 },
  },
};

export default nextConfig;
