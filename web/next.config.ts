import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@helix-hq/pdf-report'],
  // Not optional. `defineRegistry` ships only from @json-render/react-pdf's root,
  // which builds React contexts at module scope; under Next's react-server
  // condition `createContext` does not exist and the render throws. Externalising
  // resolves them outside those conditions.
  serverExternalPackages: ['@react-pdf/renderer', '@json-render/react-pdf'],
};

export default nextConfig;
