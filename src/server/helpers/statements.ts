import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import {
  bankAccount,
  friendsProfiles,
  selfTransferStatements,
  splits,
  statements,
} from '@/db/schema';
import { type Database } from '@/lib/db';
import { type SelfTransferStatement, type Statement } from '@/types';

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

export const getStatements = async (db: Database, userId: string): Promise<Statement[]> => {
  const splitTotals = db.$with('split_totals').as(
    db
      .select({
        statementId: splits.statementId,
        total: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number).as('total'),
      })
      .from(splits)
      .groupBy(splits.statementId),
  );
  return (
    await db
      .with(splitTotals)
      .select({
        statements,
        accountName: bankAccount.accountName,
        friendName: friendsProfiles.name,
        totalSplit: sql<number>`COALESCE(${splitTotals.total}, 0)`.mapWith(Number),
      })
      .from(statements)
      .leftJoin(bankAccount, eq(bankAccount.id, statements.accountId))
      .leftJoin(friendsProfiles, eq(friendsProfiles.id, statements.friendId))
      .leftJoin(splitTotals, eq(splitTotals.statementId, statements.id))
      .where(eq(statements.userId, userId))
      .orderBy(desc(statements.createdAt))
  ).map((row) => {
    return {
      ...row.statements,
      splitAmount: row.totalSplit,
      accountName: row.accountName,
      friendName: row.friendName,
    };
  });
};

export const getSelfTransferStatements = async (
  db: Database,
  userId: string,
): Promise<SelfTransferStatement[]> => {
  const fromAccount = alias(bankAccount, 'from_account');
  const toAccount = alias(bankAccount, 'to_account');
  return (
    await db
      .select({
        selfTransferStatements,
        fromAccount: fromAccount.accountName,
        toAccount: toAccount.accountName,
      })
      .from(selfTransferStatements)
      .leftJoin(fromAccount, eq(fromAccount.id, selfTransferStatements.fromAccountId))
      .leftJoin(toAccount, eq(toAccount.id, selfTransferStatements.toAccountId))
      .where(eq(selfTransferStatements.userId, userId))
      .orderBy(desc(selfTransferStatements.createdAt))
  ).map((row) => {
    return {
      ...row.selfTransferStatements,
      fromAccount: row.fromAccount,
      toAccount: row.toAccount,
    };
  });
};
