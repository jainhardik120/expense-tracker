import { drizzle } from 'drizzle-orm/node-postgres';

import { env } from '@/lib/env';

export const db = drizzle({
  logger: true,
  connection: env.DATABASE_URL,
});
export type Database = typeof db;
