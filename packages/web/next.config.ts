import type { NextConfig } from 'next';
import { execSync } from 'child_process';

// Get git commit hash and build date at build time
function getGitCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

function getBuildDate(): string {
  return new Date().toISOString().split('T')[0];
}

const nextConfig: NextConfig = {
  transpilePackages: ['mindcache'],
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  env: {
    NEXT_PUBLIC_GIT_COMMIT: getGitCommitHash(),
    NEXT_PUBLIC_BUILD_DATE: getBuildDate(),
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '0.0.1'
  }
};

export default nextConfig;

