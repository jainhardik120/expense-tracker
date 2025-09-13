import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
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
import type {
  accountFriendStatementsParserSchema,
  SelfTransferStatement,
  Statement,
  statementParserSchema,
} from '@/types';

import {
  buildQueryConditions,
  getAccountsAndStartingBalances,
  getFinalBalanceFromStatements,
  getFinalBalancesFromFriendStatements,
  getFriendsAndStartingBalances,
} from './summary';

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

const generateStatementUnionDetailedQuery = (db: Database) => {
  const fromAccount = alias(bankAccount, 'from_account');
  const toAccount = alias(bankAccount, 'to_account');
  const splitTotals = db.$with('split_totals').as(
    db
      .select({
        statementId: splits.statementId,
        total: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number).as('total'),
      })
      .from(splits)
      .groupBy(splits.statementId),
  );
  return unionAll(
    db
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
      .leftJoin(splitTotals, eq(splitTotals.statementId, statements.id)),
    db
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
      .leftJoin(toAccount, eq(toAccount.id, selfTransferStatements.toAccountId)),
  ).as('union_query');
};

const generateStatementUnionOverviewQuery = (db: Database) => {
  return unionAll(
    db
      .select({
        id: statements.id,
        createdAt: statements.createdAt,
        userId: statements.userId,
        friendId: statements.friendId,
        statementKind: statements.statementKind,
        type: sql<string>`'statement'`.as('type'),
      })
      .from(statements),
    db
      .select({
        id: selfTransferStatements.id,
        createdAt: selfTransferStatements.createdAt,
        userId: selfTransferStatements.userId,
        friendId: sql<string | null>`NULL::uuid`.as('friend_id'),
        statementKind: sql<'self_transfer'>`'self_transfer'`.as('statement_kind'),
        type: sql<string>`'self_transfer'`.as('type'),
      })
      .from(selfTransferStatements),
  ).as('union_query');
};

export const getMergedStatementsDetailedRaw = (
  db: Database,
  userId: string,
  account: string[],
  start?: Date,
  end?: Date,
) => {
  const union = generateStatementUnionDetailedQuery(db);
  const conditions = [];
  conditions.push(eq(union.userId, userId));
  if (start !== undefined) {
    conditions.push(sql`date(${union.createdAt}) >= ${start}`);
  }
  if (end !== undefined) {
    conditions.push(sql`date(${union.createdAt}) <= ${end}`);
  }
  if (account.length > 0) {
    const statementIdsWithSplits = db
      .select({ statementId: splits.statementId })
      .from(splits)
      .where(inArray(splits.friendId, account));
    conditions.push(
      or(
        inArray(union.accountId, account),
        inArray(union.fromAccountId, account),
        inArray(union.toAccountId, account),
        inArray(union.friendId, account),
        inArray(union.id, statementIdsWithSplits),
      ),
    );
  }
  return db
    .select()
    .from(union)
    .where(and(...conditions))
    .orderBy(desc(union.createdAt), asc(union.id));
};

export const getFriendSplitsLimited = async (
  db: Database,
  userId: string,
  limit: number,
  account: string,
  start?: Date,
  end?: Date,
  // eslint-disable-next-line max-params
) => {
  const union = generateStatementUnionOverviewQuery(db);
  const conditions = [];
  conditions.push(eq(union.userId, userId));
  if (start !== undefined) {
    conditions.push(sql`date(${union.createdAt}) >= ${start}`);
  }
  if (end !== undefined) {
    conditions.push(sql`date(${union.createdAt}) <= ${end}`);
  }
  if (account.length > 0) {
    const statementIdsWithSplits = db
      .select({ statementId: splits.statementId })
      .from(splits)
      .where(eq(splits.friendId, account));
    conditions.push(
      or(inArray(union.friendId, [account]), inArray(union.id, statementIdsWithSplits)),
    );
  }
  const selectedStatements = db.$with('selected_statements').as(
    db
      .select()
      .from(union)
      .where(and(...conditions))
      .orderBy(desc(union.createdAt), asc(union.id))
      .offset(limit),
  );
  return db
    .with(selectedStatements)
    .select({
      friendId: splits.friendId,
      total: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number).as('total'),
    })
    .from(splits)
    .where(
      inArray(
        splits.statementId,
        db.select({ id: selectedStatements.id }).from(selectedStatements),
      ),
    )
    .groupBy(splits.friendId);
};

export const getStartingBalancesPaginated = async (
  db: Database,
  userId: string,
  input: z.infer<typeof accountFriendStatementsParserSchema>,
) => {
  const accountStartingBalanceBeforeStart = (
    await getAccountsAndStartingBalances(db, userId, input.start)
  ).find((account) => account.account.id === input.account);
  const friendsStartingBalanceBeforeStart = (
    await getFriendsAndStartingBalances(db, userId, input.start)
  ).find((friend) => friend.friend.id === input.account);
  const limit = input.page * input.perPage;
  const rawQuery = getMergedStatementsDetailedRaw(
    db,
    userId,
    [input.account],
    input.start,
    input.end,
  );
  const selectedRows = db.$with('selected_rows').as(rawQuery.offset(limit));
  const aggregatedStatementsSummary = await db
    .with(selectedRows)
    .select({
      fromAccountId: selectedRows.fromAccountId,
      toAccountId: selectedRows.toAccountId,
      accountId: selectedRows.accountId,
      friendId: selectedRows.friendId,
      statementKind: selectedRows.statementKind,
      totalAmount: sql<number>`COALESCE(SUM(${selectedRows.amount}), 0)`.mapWith(Number),
    })
    .from(selectedRows)
    .groupBy(
      selectedRows.statementKind,
      selectedRows.fromAccountId,
      selectedRows.toAccountId,
      selectedRows.accountId,
      selectedRows.friendId,
    );
  if (accountStartingBalanceBeforeStart !== undefined) {
    const accountId = accountStartingBalanceBeforeStart.account.id;
    const statements = aggregatedStatementsSummary.filter(
      (st) => st.accountId === accountId && st.statementKind !== 'self_transfer',
    );
    const selfTransfers = aggregatedStatementsSummary
      .filter(
        (st) =>
          st.statementKind === 'self_transfer' &&
          (st.fromAccountId === accountId || st.toAccountId === accountId),
      )
      .reduce((acc, cur) => {
        if (cur.fromAccountId === accountId) {
          return acc - cur.totalAmount;
        }
        if (cur.toAccountId === accountId) {
          return acc + cur.totalAmount;
        }
        return acc;
      }, 0);
    const transfers = getFinalBalanceFromStatements(...statements, {
      totalAmount: selfTransfers,
    });
    return {
      ...accountStartingBalanceBeforeStart,
      transfers: transfers,
      finalBalance: accountStartingBalanceBeforeStart.startingBalance + transfers.totalTransfers,
    };
  }
  if (friendsStartingBalanceBeforeStart !== undefined) {
    const friendId = friendsStartingBalanceBeforeStart.friend.id;
    const friendSplits = await getFriendSplitsLimited(
      db,
      userId,
      limit,
      input.account,
      input.start,
      input.end,
    );
    const statements = aggregatedStatementsSummary.filter(
      (st) =>
        st.friendId === friendId &&
        (st.statementKind === 'expense' || st.statementKind === 'friend_transaction'),
    );
    const split = friendSplits
      .filter((split) => split.friendId === friendId)
      .reduce((acc, cur) => {
        return acc + cur.total;
      }, 0);
    const transfers = getFinalBalancesFromFriendStatements(...statements, { totalAmount: split });
    return {
      ...friendsStartingBalanceBeforeStart,
      transfers: transfers,
      finalBalance: friendsStartingBalanceBeforeStart.startingBalance + transfers.totalTransfers,
    };
  }
  throw new Error('Invalid input');
};

export const getMergedStatements = async (
  db: Database,
  userId: string,
  input: z.infer<typeof statementParserSchema>,
): Promise<(Statement | SelfTransferStatement)[]> => {
  const offset = (input.page - 1) * input.perPage;
  const selectQuery = getMergedStatementsDetailedRaw(
    db,
    userId,
    input.account,
    input.start,
    input.end,
  );
  return (await selectQuery.limit(input.perPage).offset(offset))
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
  const statementConditions = [];
  const selfTransferStatementConditions = [];
  statementConditions.push(...buildQueryConditions(statements, userId, input.start, input.end));
  selfTransferStatementConditions.push(
    ...buildQueryConditions(selfTransferStatements, userId, input.start, input.end),
  );
  if (input.account.length > 0) {
    const statementIdsWithSplits = db
      .select({ statementId: splits.statementId })
      .from(splits)
      .where(inArray(splits.friendId, input.account));
    statementConditions.push(
      or(
        inArray(statements.accountId, input.account),
        inArray(statements.friendId, input.account),
        inArray(statements.id, statementIdsWithSplits),
      ),
    );
    selfTransferStatementConditions.push(
      or(
        inArray(selfTransferStatements.fromAccountId, input.account),
        inArray(selfTransferStatements.toAccountId, input.account),
      ),
    );
  }
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
