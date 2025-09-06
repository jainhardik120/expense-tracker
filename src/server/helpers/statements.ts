import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { alias, unionAll } from 'drizzle-orm/pg-core';
import { type z } from 'zod';

import {
  bankAccount,
  friendsProfiles,
  selfTransferStatements,
  splits,
  statements,
} from '@/db/schema';
import { type Database } from '@/lib/db';
import { type SelfTransferStatement, type Statement, type statementParserSchema } from '@/types';

import { buildQueryConditions } from './summary';

export const getStatementAmountAndSplits = async (
  db: Database,
  statementId: string,
  exceptSplitId: string = '',
) => {
  const statementResult = await db
    .select({ amount: statements.amount, kind: statements.statementKind })
    .from(statements)
    .where(eq(statements.id, statementId));
  if (statementResult.length === 0) {
    throw new Error('Statement not found');
  }
  const statement = statementResult[0];
  const query = db
    .select({ sum: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number) })
    .from(splits);
  if (exceptSplitId.trim() === '') {
    query.where(eq(splits.statementId, statementId));
  } else {
    query.where(and(eq(splits.statementId, statementId), ne(splits.id, exceptSplitId)));
  }
  const totalAllocatedResult = await query.then((res) => res[0]);
  return {
    kind: statement.kind,
    statementAmount: parseFloat(statement.amount),
    totalAllocated: totalAllocatedResult.sum,
  };
};

export const getMergedStatements = async (
  db: Database,
  userId: string,
  input: z.infer<typeof statementParserSchema>,
): Promise<(Statement | SelfTransferStatement)[]> => {
  const splitTotals = db.$with('split_totals').as(
    db
      .select({
        statementId: splits.statementId,
        total: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number).as('total'),
      })
      .from(splits)
      .groupBy(splits.statementId),
  );
  const baseStatements = db
    .with(splitTotals)
    .select({
      id: statements.id,
      createdAt: statements.createdAt,
      amount: statements.amount,
      accountName: bankAccount.accountName,
      friendName: friendsProfiles.name,
      userId: statements.userId,
      splitAmount: splitTotals.total,
      accountId: statements.accountId,
      friendId: statements.friendId,
      category: statements.category,
      tags: statements.tags,
      statementKind: statements.statementKind,
      type: sql<string>`'statement'`.as('type'),
      fromAccount: sql<string | null>`NULL`.as('from_account'),
      toAccount: sql<string | null>`NULL`.as('to_account'),
      fromAccountId: sql<string | null>`NULL::uuid`.as('from_account_id'),
      toAccountId: sql<string | null>`NULL::uuid`.as('to_account_id'),
    })
    .from(statements)
    .leftJoin(bankAccount, eq(bankAccount.id, statements.accountId))
    .leftJoin(friendsProfiles, eq(friendsProfiles.id, statements.friendId))
    .leftJoin(splitTotals, eq(splitTotals.statementId, statements.id));
  const fromAccount = alias(bankAccount, 'from_account');
  const toAccount = alias(bankAccount, 'to_account');
  const baseSelfTransfers = db
    .select({
      id: selfTransferStatements.id,
      createdAt: selfTransferStatements.createdAt,
      amount: selfTransferStatements.amount,
      accountName: sql<string | null>`NULL`.as('account_name'),
      friendName: sql<string | null>`NULL`.as('friend_name'),
      userId: selfTransferStatements.userId,
      splitAmount: sql<number>`0`.as('split_amount'),
      accountId: sql<string | null>`NULL::uuid`.as('account_id'),
      friendId: sql<string | null>`NULL::uuid`.as('friend_id'),
      category: sql<string>`NULL`.as('category'),
      tags: sql<string[]>`ARRAY[]::text[]`.as('tags'),
      statementKind: sql<'self_transfer'>`'self_transfer'`.as('statement_kind'),
      type: sql<string>`'self_transfer'`.as('type'),
      fromAccount: fromAccount.accountName,
      toAccount: toAccount.accountName,
      fromAccountId: selfTransferStatements.fromAccountId,
      toAccountId: selfTransferStatements.toAccountId,
    })
    .from(selfTransferStatements)
    .leftJoin(fromAccount, eq(fromAccount.id, selfTransferStatements.fromAccountId))
    .leftJoin(toAccount, eq(toAccount.id, selfTransferStatements.toAccountId));
  const offset = (input.page - 1) * input.pageSize;
  const union = unionAll(baseStatements, baseSelfTransfers).as('union_query');
  const conditions = [];
  conditions.push(eq(union.userId, userId));
  if (input.start !== undefined) {
    conditions.push(sql`date(${union.createdAt}) >= ${input.start}`);
  }
  if (input.end !== undefined) {
    conditions.push(sql`date(${union.createdAt}) <= ${input.end}`);
  }
  if (input.accountId.length > 0) {
    conditions.push(
      or(
        inArray(union.accountId, input.accountId),
        inArray(union.fromAccountId, input.accountId),
        inArray(union.toAccountId, input.accountId),
      ),
    );
  }
  return (
    await db
      .select()
      .from(union)
      .where(and(...conditions))
      .orderBy(desc(union.createdAt))
      .limit(input.pageSize)
      .offset(offset)
  )
    .map<Statement | SelfTransferStatement | undefined>((row) => {
      if (row.type === 'statement') {
        const value: Statement = {
          id: row.id,
          createdAt: row.createdAt,
          userId: row.userId,
          accountId: row.accountId,
          friendId: row.friendId,
          amount: row.amount,
          category: row.category,
          tags: row.tags,
          statementKind: row.statementKind,
          splitAmount: row.splitAmount,
          accountName: row.accountName,
          friendName: row.friendName,
        };
        return value;
      }
      if (row.fromAccountId !== null && row.toAccountId !== null) {
        const value: SelfTransferStatement = {
          id: row.id,
          createdAt: row.createdAt,
          userId: row.userId,
          amount: row.amount,
          fromAccountId: row.fromAccountId,
          toAccountId: row.toAccountId,
          fromAccount: row.fromAccount,
          toAccount: row.toAccount,
        };
        return value;
      }
    })
    .filter((row): row is Statement | SelfTransferStatement => row !== undefined);
};

export const getRowsCount = async (
  db: Database,
  userId: string,
  input: z.infer<typeof statementParserSchema>,
) => {
  const statementConditions = buildQueryConditions(statements, userId, input.start, input.end);
  const selfTransferStatementConditions = buildQueryConditions(
    selfTransferStatements,
    userId,
    input.start,
    input.end,
  );
  const statementCount = (
    await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(statements)
      .where(and(...statementConditions))
  )[0].count;
  const selfTransferStatementCount = (
    await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(selfTransferStatements)
      .where(and(...selfTransferStatementConditions))
  )[0].count;
  return {
    statementCount,
    selfTransferStatementCount,
  };
};
