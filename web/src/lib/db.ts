import { instrumentDrizzleClient } from '@kubiks/otel-drizzle';
import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '@/lib/env';
import logger from '@/lib/logger';

// Next.js bundles this module into more than one module graph (the RSC/SSR layer
// and the root-of-the-server layer for proxy + route handlers). Without a shared
// global, each graph builds its own Pool and the per-instance connection budget
// doubles. The database only allows ~14 connections to non-superuser roles, so
// every pool has to be accounted for.
const globalForDb = globalThis as unknown as { expenseTrackerPool?: Pool };

const createPool = () => {
  const created = new Pool({
    connectionString: env.DATABASE_URL,
    // Aiven reports max_connections=20 with 3 reserved for superusers, and its own
    // background workers hold several more. Keep this small enough that a handful
    // of concurrent Fluid instances still fit inside the budget.
    max: 3,
    // Hand idle connections back quickly so other instances can claim the slot.
    idleTimeoutMillis: 10000,
    // Queue for a while instead of failing fast; a small pool means bursts wait.
    connectionTimeoutMillis: 10000,
    maxUses: 1000,
  });

  attachDatabasePool(created);

  created.on('error', (err) => {
    logger.error('Unexpected error on idle client', { error: err.message, stack: err.stack });
  });

  return created;
};

const pool = globalForDb.expenseTrackerPool ?? createPool();
globalForDb.expenseTrackerPool = pool;

export const db = drizzle({
  client: pool,
  logger: {
    logQuery: (query, params) => {
      logger.info(`Query Executed`, {
        query: query,
        params: params,
      });
    },
  },
});

instrumentDrizzleClient(db);

export type Database = typeof db;
