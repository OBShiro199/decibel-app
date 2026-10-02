import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@decibels/design-tokens'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
