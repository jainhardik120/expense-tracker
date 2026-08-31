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
    // One connection per instance, because the budget is spent per instance
    // rather than per query.
    //
    // Aiven allows 20 connections with 3 reserved for superusers, so 17 are
    // ours. A pool is per process and nothing sits in front of Postgres to
    // share them, so an instance's connections are useless to every other
    // instance. Worse, `idleTimeoutMillis` below never fires here: it is a
    // timer, and Fluid freezes the instance between requests, so the event loop
    // that would run it is suspended. Measured on a warm deployment, five
    // instances held fourteen connections with every one of them idle — one for
    // 272 seconds — while nothing was running a query at all. The same pool in
    // an ordinary Node process releases after ten seconds as configured.
    //
    // So the ceiling is instances x max, and Vercel keeps instances warm for
    // minutes. At 3 that was five instances before a sixth got 53300; at 1 it
    // is seventeen. The cost is that a request issuing queries in parallel now
    // serialises them — `buildReportInput` runs six in a `Promise.all` — which
    // is worth a second on the report download to stop ordinary navigation
    // failing.
    max: 1,
    // Kept for the non-Fluid case (local runs, any self-hosted deployment),
    // where the loop keeps running and this does reclaim an idle connection.
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
