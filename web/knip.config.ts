import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Entry points for the application
  entry: [
    // Next.js automatically handles page.tsx, layout.tsx, route.tsx, etc.
    // via its built-in plugin

    // tRPC server router
    // 'src/server/routers/**/*.ts',

    // Drizzle ORM schema and config
    'src/db/schema.ts',

    // Custom scripts
    'src/scripts/**/*.ts',
  ],

  // Project files to analyze
  project: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/**/*.spec.{ts,tsx}'],

  // Ignore patterns for files that should not be checked
  ignore: [
    // Generated files
    '.next/**',
    'drizzle/**',

    // Type declaration files
    '**/*.d.ts',
    'next-env.d.ts',

    // Drizzle config uses path aliases that knip can't resolve
    'src/db/drizzle.config.ts',
  ],

  // Ignore dependencies that are used but might not be detected
  ignoreDependencies: [
    // ESLint plugins loaded via config
    'eslint-*',

    // Used by postcss config
    'postcss',
  ],

  // Ignore specific exports that are used externally
  ignoreExportsUsedInFile: true,

  // Next.js plugin is auto-enabled when "next" is in dependencies
  // It automatically handles:
  // - page.tsx, layout.tsx, loading.tsx, error.tsx, not-found.tsx, template.tsx, default.tsx
  // - route.tsx for API routes
  // - middleware.ts
  // - next.config.ts
  // - instrumentation.ts

  // Drizzle plugin configuration - disabled since config uses path aliases
  drizzle: false,

  // Specific rules for issue types
  rules: {
    // Warn about unused files
    files: 'warn',
    // Warn about unused dependencies
    dependencies: 'warn',
    // Warn about unused devDependencies
    devDependencies: 'warn',
    // Error on unused exports (this is what you primarily want)
    exports: 'error',
    // Error on unused types
    types: 'error',
    // Warn about unlisted dependencies
    unlisted: 'warn',
    // Warn about duplicate exports
    duplicates: 'warn',
  },
};

export default config;
