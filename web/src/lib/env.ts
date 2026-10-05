import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    AWS_REGION: z.string(),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),
    DATABASE_URL: z.url(),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(1),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional(),
    EMAIL_SENDER_ADDRESS: z.string(),
    NODE_ENV: z.enum(['development', 'test', 'production']),
    AUTH_TRUSTED_ORIGINS: z.string().optional(),
    GITHUB_CLIENT_ID: z.string(),
    GITHUB_CLIENT_SECRET: z.string(),
    COINGECKO_API_KEY: z.string(),
    AI_ASSISTANT_ENABLED: z.string().optional(),
    INBOUND_EMAIL_DOMAIN: z.string().optional(),
    INBOUND_EMAIL_BUCKET: z.string().optional(),
    INBOUND_EMAIL_TOPIC_ARN: z.string().optional(),
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
    AI_ASSISTANT_ENABLED: process.env['AI_ASSISTANT_ENABLED'],
    INBOUND_EMAIL_DOMAIN: process.env['INBOUND_EMAIL_DOMAIN'],
    INBOUND_EMAIL_BUCKET: process.env['INBOUND_EMAIL_BUCKET'],
    INBOUND_EMAIL_TOPIC_ARN: process.env['INBOUND_EMAIL_TOPIC_ARN'],
  },
  skipValidation:
    process.env['SKIP_ENV_VALIDATION'] !== undefined &&
    process.env['SKIP_ENV_VALIDATION'] === 'true',
  emptyStringAsUndefined: true,
});
