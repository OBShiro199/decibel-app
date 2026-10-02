import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A second dev server (e.g. an editor preview) can set NEXT_DIST_DIR so it never
  // shares the build folder with your own `pnpm dev`; sharing one corrupts both.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  transpilePackages: ['@decibels/design-tokens'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
