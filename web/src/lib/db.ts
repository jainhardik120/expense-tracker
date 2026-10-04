import { createHash } from 'node:crypto';

import { instrumentDrizzleClient } from '@kubiks/otel-drizzle';
import { attachDatabasePool } from '@vercel/functions';
import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { type PgDatabase } from 'drizzle-orm/pg-core';
import { Pool, type QueryConfig } from 'pg';

import { env } from '@/lib/env';
import logger from '@/lib/logger';

const globalForDb = globalThis as unknown as { expenseTrackerPool?: Pool };

const createPool = () => {
  const created = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    maxUses: 1000,
  });

  attachDatabasePool(created);

  created.on('error', (err) => {
    logger.error('Unexpected error on idle client', { error: err.message, stack: err.stack });
  });

  return created;
};

const MAX_PREPARED_PARAMS = 50;
const STATEMENT_NAME_LENGTH = 24;

const prepareEverything = (target: Pool) => {
  const query = target.query.bind(target) as (...args: unknown[]) => unknown;
  (target as unknown as { query: (...args: unknown[]) => unknown }).query = (
    config: unknown,
    values?: unknown,
    ...rest: unknown[]
  ) => {
    if (
      typeof config === 'object' &&
      config !== null &&
      'text' in config &&
      (config as QueryConfig).name === undefined &&
      !(Array.isArray(values) && values.length > MAX_PREPARED_PARAMS)
    ) {
      const { text } = config as QueryConfig;
      const name = `q_${createHash('sha256').update(text).digest('base64url').slice(0, STATEMENT_NAME_LENGTH)}`;
      return query({ ...config, name }, values, ...rest);
    }
    return query(config, values, ...rest);
  };
  return target;
};

const pool = globalForDb.expenseTrackerPool ?? prepareEverything(createPool());
globalForDb.expenseTrackerPool = pool;

export const db = drizzle({
  client: pool,
  logger: logger.isDebugEnabled()
    ? {
        logQuery: (query, params) => {
          logger.debug(`Query Executed`, { query, params });
        },
      }
    : false,
});

instrumentDrizzleClient(db);

export type Database = PgDatabase<NodePgQueryResultHKT>;
