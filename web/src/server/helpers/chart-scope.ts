import { asc, eq } from 'drizzle-orm';

import { budgetYears } from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';

import { getStatementsInWindow, getYearLines, statementIdsForLine } from './budget';

export const claimedStatementIds = instrumentedFunction(
  'claimedStatementIds',
  async (
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
    const lines = await getYearLines(db, year.id);
    const scoped = await getStatementsInWindow(db, userId, start, end);
    return statementIdsForLine(lines, scoped, lineId);
  },
);
