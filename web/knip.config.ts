import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/db/schema.ts', 'src/scripts/**/*.ts'],

  project: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/**/*.spec.{ts,tsx}'],

  ignore: ['.next/**', 'drizzle/**', '**/*.d.ts', 'next-env.d.ts', 'src/db/drizzle.config.ts'],

  ignoreDependencies: ['eslint-*', 'postcss'],

  ignoreExportsUsedInFile: true,

  drizzle: false,

  rules: {
    files: 'warn',
    dependencies: 'warn',
    devDependencies: 'warn',
    exports: 'error',
    types: 'error',
    unlisted: 'warn',
    duplicates: 'warn',
  },
};

export default config;
