import { type SQL, sql } from 'drizzle-orm';

import { statements } from '@/db/schema';
import { type Database } from '@/lib/db';

import { lineScopeCondition, resolveChartLineScope } from './budget-line-filter';

export const chartLineCondition = async (
  db: Database,
  userId: string,
  lineId: string,
  start?: Date,
  end?: Date,
): Promise<SQL> =>
  lineScopeCondition(await resolveChartLineScope(db, userId, lineId, start, end), statements) ??
  sql`false`;
