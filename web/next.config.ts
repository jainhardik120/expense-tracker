import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@helix-hq/pdf-report'],
  serverExternalPackages: ['@react-pdf/renderer', '@json-render/react-pdf'],
  experimental: {
    preloadEntriesOnStart: false,
  },
};

export default nextConfig;
