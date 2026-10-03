import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    AWS_REGION: z.string(),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),
    DATABASE_URL: z.url(),
    /**
     * Connections each process may hold. Defaults to 1, which is what the hosted
     * database on Vercel can afford -- see `src/lib/db.ts`. With Postgres on the
     * same machine there is no such ceiling, and 1 makes every page run its
     * queries one after another, so raise it there.
     */
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(1),
    /**
     * How much the server logs. Defaults to `debug` in development and `info`
     * elsewhere; `debug` is what prints every database query, which is too much
     * work to do on every request in production.
     */
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional(),
    EMAIL_SENDER_ADDRESS: z.string(),
    NODE_ENV: z.enum(['development', 'test', 'production']),
    /**
     * Extra origins better-auth will accept sign-ins from, comma separated.
     *
     * Production otherwise trusts only `https://$VERCEL_URL`, which a local
     * `next start` can never satisfy — the browser sends `http://localhost:3000`
     * and no value of VERCEL_URL makes that match, so the scheme alone rejects
     * every local login. Set it in `.env` rather than rediscovering it.
     */
    AUTH_TRUSTED_ORIGINS: z.string().optional(),
    GITHUB_CLIENT_ID: z.string(),
    GITHUB_CLIENT_SECRET: z.string(),
    COINGECKO_API_KEY: z.string(),
    REDIS_URL: z.string().optional(),
    /**
     * Opt in to the experimental AI assistant. Off unless set to 'true'.
     *
     * The assistant proxies an AI gateway key and hands the model a caller with
     * full read and write access to the account, so it stays off by default and
     * has to be turned on deliberately rather than left on by forgetting.
     */
    AI_ASSISTANT_ENABLED: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_BASE_URL: z.string().optional(),
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string(),
  },
  runtimeEnv: {
    AWS_ACCESS_KEY_ID: process.env['AWS_ACCESS_KEY_ID'],
    AWS_REGION: process.env['AWS_REGION'],
    AWS_SECRET_ACCESS_KEY: process.env['AWS_SECRET_ACCESS_KEY'],
    EMAIL_SENDER_ADDRESS: process.env['EMAIL_SENDER_ADDRESS'],
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_POOL_MAX: process.env['DATABASE_POOL_MAX'],
    LOG_LEVEL: process.env['LOG_LEVEL'],
    NEXT_PUBLIC_BASE_URL: process.env['NEXT_PUBLIC_BASE_URL'],
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL:
      process.env['NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL'],
    NODE_ENV: process.env['NODE_ENV'],
    AUTH_TRUSTED_ORIGINS: process.env['AUTH_TRUSTED_ORIGINS'],
    GITHUB_CLIENT_ID: process.env['GITHUB_CLIENT_ID'],
    GITHUB_CLIENT_SECRET: process.env['GITHUB_CLIENT_SECRET'],
    NEXT_PUBLIC_POSTHOG_HOST: process.env['NEXT_PUBLIC_POSTHOG_HOST'],
    NEXT_PUBLIC_POSTHOG_KEY: process.env['NEXT_PUBLIC_POSTHOG_KEY'],
    COINGECKO_API_KEY: process.env['COINGECKO_API_KEY'],
    REDIS_URL: process.env['REDIS_URL'],
    AI_ASSISTANT_ENABLED: process.env['AI_ASSISTANT_ENABLED'],
  },
  skipValidation:
    process.env['SKIP_ENV_VALIDATION'] !== undefined &&
    process.env['SKIP_ENV_VALIDATION'] === 'true',
  emptyStringAsUndefined: true,
});
