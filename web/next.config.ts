import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['local-dev.hardikja.in', 'local-dev-mac.hardikja.in'],
  transpilePackages: ['@helix-hq/pdf-report'],
  serverExternalPackages: ['@react-pdf/renderer', '@json-render/react-pdf'],
  redirects: () => [
    { source: '/sms-notifications/:path*', destination: '/inbox/sms/:path*', permanent: false },
    { source: '/balance-checks', destination: '/inbox/balances', permanent: false },
    { source: '/email-forwarding', destination: '/inbox/email', permanent: false },
  ],
  headers: () =>
    process.env.NODE_ENV === 'development'
      ? [
          {
            source: '/_next/static/:path*',
            headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
          },
        ]
      : [],
  experimental: {
    preloadEntriesOnStart: false,
  },
};

export default nextConfig;
