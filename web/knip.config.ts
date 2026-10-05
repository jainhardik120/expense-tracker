import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'src/app/**/{page,layout,template,loading,error,global-error,not-found,forbidden,unauthorized,default,route,opengraph-image,icon,robots,sitemap,manifest}.{ts,tsx}',
    'src/db/drizzle.config.ts',
    'src/db/schema.ts',
    'src/db/auth-schema.ts',
    'src/emails/*.tsx',
    'scripts/*.ts',
  ],
  project: ['src/**/*.{ts,tsx,css}', 'scripts/**/*.ts', '*.{ts,mjs,cjs}'],
  ignoreDependencies: ['@helix-hq/design-system'],
  drizzle: false,
};

export default config;
