import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A second dev server (e.g. an editor preview) can set NEXT_DIST_DIR so it never
  // shares the build folder with your own `pnpm dev`; sharing one corrupts both.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  devIndicators: false,
  transpilePackages: ['@decibels/design-tokens'],
  eslint: { ignoreDuringBuilds: true },
  // Safe defaults on every response. No CSP yet: Twilio, PostHog and Stripe need a tested allow-list first.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // the dialler needs the microphone on our own pages; nothing else needs devices
          { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=(), payment=(), usb=()' },
        ],
      },
      // the visitor snippet is loaded by customers' websites: cache it briefly so updates reach them within the hour
      { source: '/v.js', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' }] },
      // flags never change
      { source: '/flags/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
  experimental: {
    // import only the icons used, in dev as well as production (lucide-react is covered by default)
    optimizePackageImports: ['@phosphor-icons/react'],
    // Client router cache. App pages fetch their own data in the browser (TanStack Query),
    // so their server payload barely changes: reuse it instead of a server round trip per tab click.
    staleTimes: { dynamic: 300, static: 300 },
  },
};

export default nextConfig;
