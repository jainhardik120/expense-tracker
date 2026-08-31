import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@helix-hq/pdf-report'],
  // Both build React contexts at module scope. Under Next's `react-server`
  // condition `createContext` does not exist, so bundling them there throws at
  // render time; externalising resolves them outside those conditions.
  serverExternalPackages: ['@react-pdf/renderer', '@json-render/react-pdf'],
  experimental: {
    // The server otherwise loads every route's modules at boot. Measured on this
    // app that is ~148 MB of resident code before a single request arrives, for
    // no change in cold start (481ms either way). Modules load on first request
    // instead. See docs/memory.md.
    preloadEntriesOnStart: false,
  },
};

export default nextConfig;
