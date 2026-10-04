import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['local-dev.hardikja.in', 'local-dev-mac.hardikja.in'],
  transpilePackages: ['@helix-hq/pdf-report'],
  serverExternalPackages: ['@react-pdf/renderer', '@json-render/react-pdf'],
  experimental: {
    preloadEntriesOnStart: false,
  },
};

export default nextConfig;
