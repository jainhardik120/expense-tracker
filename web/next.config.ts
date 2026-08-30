import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@helix-hq/pdf-report'],
  // Both build React contexts at module scope. Under Next's `react-server`
  // condition `createContext` does not exist, so bundling them there throws at
  // render time; externalising resolves them outside those conditions.
  serverExternalPackages: ['@react-pdf/renderer', '@json-render/react-pdf'],
};

export default nextConfig;
