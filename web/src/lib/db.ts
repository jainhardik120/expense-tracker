import { createHash } from 'node:crypto';

import { instrumentDrizzleClient } from '@kubiks/otel-drizzle';
import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type QueryConfig } from 'pg';

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
    //
    // That is the default, not a constant: a database on the same machine has
    // no such budget, and there the serialising is all cost. `DATABASE_POOL_MAX`
    // raises it where the database can take it.
    max: env.DATABASE_POOL_MAX,
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

/**
 * Beyond this many parameters a query is an `IN (...)` list whose text changes
 * with its length, so it is never run twice and naming it would only fill the
 * connection's statement cache.
 */
const MAX_PREPARED_PARAMS = 50;
/** Enough of the digest to make a collision between two query texts out of the question. */
const STATEMENT_NAME_LENGTH = 24;

/**
 * Every query as a named prepared statement, named after its own text.
 *
 * Unnamed, Postgres parses and plans each query from scratch on every call --
 * nearly a fifth of its time on the dashboard went on planning the same thirty
 * or so query shapes over and over. Named, a connection parses a shape once and,
 * after a few runs, reuses its plan. The name is a hash of the SQL, so one name
 * can never stand for two different statements.
 */
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

// Every query, with its parameters, is a debug-level line: worth having in
// development, but formatting ~40 of them per dashboard load was the second
// largest cost of rendering it in production. Without debug enabled Drizzle is
// given no logger at all, so it does not even build the arguments.
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

export type Database = typeof db;
