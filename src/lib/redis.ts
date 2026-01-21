import { attachDatabasePool } from '@vercel/functions';
import Redis from 'ioredis';

import { env } from '@/lib/env';
import logger from '@/lib/logger';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;
const MAX_RETRY_DELAY_MS = 3000;

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: MAX_RETRIES,
  retryStrategy: (times) => {
    if (times > MAX_RETRIES) {
      logger.error('Redis connection failed after max retries');
      return null;
    }
    return Math.min(times * RETRY_DELAY_MS, MAX_RETRY_DELAY_MS);
  },
});

attachDatabasePool(redis);

redis.on('error', (err: Error) => {
  logger.error('Redis error', { error: err.message, stack: err.stack });
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

export { redis };
