import { eq, gte, lt } from 'drizzle-orm';
import { type PgTableWithColumns, type TableConfig } from 'drizzle-orm/pg-core';

export const buildQueryConditions = <T extends TableConfig>(
  table: PgTableWithColumns<T>,
  userId: string,
  start?: Date,
  end?: Date,
) => {
  const conditions = [];
  conditions.push(eq(table.userId, userId));
  if (start !== undefined) {
    conditions.push(gte(table.createdAt, start));
  }
  if (end !== undefined) {
    conditions.push(lt(table.createdAt, end));
  }
  return conditions;
};
