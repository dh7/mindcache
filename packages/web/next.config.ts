import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['mindcache'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

