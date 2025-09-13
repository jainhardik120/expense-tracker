import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '@/lib/env';
import logger from '@/lib/logger';

// Create a connection pool with proper configuration
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20, // Maximum number of connections in the pool
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error if connection takes longer than 2 seconds
});

let connectionCount = 0;

pool.on('connect', () => {
  connectionCount++;
  logger.info('Database pool connection created', {
    totalConnections: connectionCount,
    idleCount: pool.idleCount,
    totalCount: pool.totalCount,
  });
});

pool.on('remove', () => {
  connectionCount--;
  logger.info('Database pool connection removed', {
    totalConnections: connectionCount,
    idleCount: pool.idleCount,
    totalCount: pool.totalCount,
  });
});

// Handle pool errors
pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', { error: err.message, stack: err.stack });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down database pool...');
  await pool.end();
  logger.info('Database pool closed');
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

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

export type Database = typeof db;
