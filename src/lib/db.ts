import { drizzle } from 'drizzle-orm/node-postgres';
import PG from 'pg';

import { env } from '@/lib/env';
import logger from '@/lib/logger';

export const db = drizzle({
  connection: env.DATABASE_URL,
});
export type Database = typeof db;

interface QueryWithDetails {
  text?: string;
  values?: unknown[];
}

const originalSubmit = PG.Query.prototype.submit;

PG.Query.prototype.submit = function (...args) {
  const startTime = performance.now();
  const query = this as QueryWithDetails;
  const queryText = typeof query.text === 'string' ? query.text : 'No query text';
  const queryValues = Array.isArray(query.values) ? query.values : [];

  const _queryProps = Object.getOwnPropertyNames(this).filter(
    (prop) =>
      prop !== 'domain' &&
      prop !== '_events' &&
      prop !== '_eventsCount' &&
      prop !== '_maxListeners',
  );

  this.once('end', () => {
    const duration = performance.now() - startTime;

    if (queryText !== 'No query text' || queryValues.length > 0) {
      logger.info(`Query completed`, {
        durationMs: duration.toFixed(2),
        query: queryText,
        params: queryValues,
      });
    } else {
      logger.warn(`Query completed`, {
        durationMs: duration.toFixed(2),
        message: 'Query completed without text/params details',
        availableProps: _queryProps,
      });
    }
  });
  this.once('error', (err: Error) => {
    const duration = performance.now() - startTime;
    logger.error(`Query error`, {
      durationMs: duration.toFixed(2),
      query: queryText,
      params: queryValues,
      error: err.message,
      stack: err.stack,
    });
  });
  originalSubmit.apply(this, args);
};
