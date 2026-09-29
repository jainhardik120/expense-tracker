import { asc, eq } from 'drizzle-orm';

import { budgetLines, budgetYears } from '@/db/schema';
import { type Database } from '@/lib/db';

import { getStatementsInWindow, statementIdsForLine } from './budget';

/**
 * Which statements a budget line claims inside a date range.
 *
 * The whole year's lines are loaded, not just the one asked for, because a line
 * owns only what the lines above it left: reading its rule alone would hand the
 * catch-all line the rent and the flights as well.
 *
 * An empty array means the line claimed nothing here, which is a real answer
 * and not a reason to fall back to showing everything.
 */
export const claimedStatementIds = async (
  db: Database,
  userId: string,
  lineId: string,
  start?: Date,
  end?: Date,
): Promise<string[]> => {
  const years = await db
    .select()
    .from(budgetYears)
    .where(eq(budgetYears.userId, userId))
    .orderBy(asc(budgetYears.startDate));
  const year = years.at(-1);
  if (year === undefined || start === undefined || end === undefined) {
    return [];
  }
  const lines = await db.select().from(budgetLines).where(eq(budgetLines.budgetYearId, year.id));
  const scoped = await getStatementsInWindow(db, userId, start, end);
  return statementIdsForLine(lines, scoped, lineId);
};
