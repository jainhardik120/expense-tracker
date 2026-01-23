import { waitUntil } from '@vercel/functions';
import { Redis } from 'ioredis';

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

let idleTimeout: NodeJS.Timeout | null = null;
let idleTimeoutResolve: (value: void | PromiseLike<void>) => void = () => {};
const bootTime = Date.now();
const maximumDuration = 15 * 60 * 1000 - 1000;
redis.on('end', () => {
  if (idleTimeout !== null) {
    clearTimeout(idleTimeout);
    idleTimeoutResolve();
  }
  const promise = new Promise((resolve) => {
    idleTimeoutResolve = resolve;
  });
  const waitTime = Math.min(5100, Math.max(100, maximumDuration - (Date.now() - bootTime)));
  idleTimeout = setTimeout(() => {
    idleTimeoutResolve();
    logger.info('Database pool idle timeout reached. Releasing connections.');
  }, waitTime);
  waitUntil(promise);
});

redis.on('error', (err: Error) => {
  logger.error('Redis error', { error: err.message, stack: err.stack });
});

export { redis };
