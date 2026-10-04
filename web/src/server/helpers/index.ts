import { type AnyColumn, eq, gte, lt, type SQL } from 'drizzle-orm';

export const buildQueryConditions = (
  source: { userId: AnyColumn; createdAt: AnyColumn },
  userId: string,
  start?: Date,
  end?: Date,
): SQL[] => [
  eq(source.userId, userId),
  ...(start === undefined ? [] : [gte(source.createdAt, start)]),
  ...(end === undefined ? [] : [lt(source.createdAt, end)]),
];
