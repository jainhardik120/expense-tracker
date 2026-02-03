import { and, eq, sql, inArray, gte, lt, ne, asc, desc, or } from 'drizzle-orm';
import { unionAll, alias } from 'drizzle-orm/pg-core';
import { type z } from 'zod';

import {
  bankAccount,
  friendsProfiles,
  selfTransferStatements,
  splits,
  statements,
} from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import {
  type StatementKind,
  type accountFriendStatementsParserSchema,
  type SelfTransferStatement,
  type Statement,
  type statementParserSchema,
} from '@/types';

import { buildQueryConditions } from '.';
import {
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
    statementAmount: Number.parseFloat(statement.amount),
    totalAllocated: totalAllocatedResult.sum,
  };
};

const generateStatementUnionDetailedQuery = (db: Database, unnestTags?: boolean) => {
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
  let statementQuery = db
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
      additionalAttributes: statements.additionalAttributes,
      type: sql<string>`'statement'`.as('type'),
      fromAccount: sql<string | null>`NULL`.as('from_account'),
      toAccount: sql<string | null>`NULL`.as('to_account'),
      fromAccountId: sql<string | null>`NULL::uuid`.as('from_account_id'),
      toAccountId: sql<string | null>`NULL::uuid`.as('to_account_id'),
      tag: sql<string | null>`tag`.as('tag'),
    })
    .from(statements)
    .leftJoin(bankAccount, eq(bankAccount.id, statements.accountId))
    .leftJoin(friendsProfiles, eq(friendsProfiles.id, statements.friendId))
    .leftJoin(splitTotals, eq(splitTotals.statementId, statements.id));
  if (unnestTags === true) {
    statementQuery = statementQuery.crossJoin(sql`unnest(${statements.tags}) as tag`);
  } else {
    statementQuery = statementQuery.crossJoin(sql`(SELECT NULL::text AS tag)`);
  }
  return unionAll(
    statementQuery,
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
        additionalAttributes: sql`'{}'`.as('additional_attributes'),
        type: sql<string>`'self_transfer'`.as('type'),
        fromAccount: fromAccount.accountName,
        toAccount: toAccount.accountName,
        fromAccountId: selfTransferStatements.fromAccountId,
        toAccountId: selfTransferStatements.toAccountId,
        tag: sql<string | null>`NULL`.as('tag'),
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

const getMergedStatementsDetailedRaw = (
  db: Database,
  userId: string,
  account: string[],
  category: string[],
  tags: string[],
  statementKind: StatementKind[],
  start?: Date,
  end?: Date,
) => {
  const union = generateStatementUnionDetailedQuery(db, tags.length > 0);
  const conditions = [];
  conditions.push(eq(union.userId, userId));
  if (start !== undefined) {
    conditions.push(gte(union.createdAt, start));
  }
  if (end !== undefined) {
    conditions.push(lt(union.createdAt, end));
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
  if (category.length > 0) {
    conditions.push(inArray(union.category, category));
  }
  if (tags.length > 0) {
    conditions.push(inArray(union.tag, tags));
  }
  if (statementKind.length > 0) {
    conditions.push(inArray(union.statementKind, statementKind));
  }
  return db
    .select()
    .from(union)
    .where(and(...conditions))
    .orderBy(desc(union.createdAt), asc(union.id));
};

export const getMergedStatements = instrumentedFunction(
  'getMergedStatements',
  async (
    db: Database,
    userId: string,
    input: z.infer<typeof statementParserSchema>,
  ): Promise<(Statement | SelfTransferStatement)[]> => {
    const offset = (input.page - 1) * input.perPage;
    const selectQuery = getMergedStatementsDetailedRaw(
      db,
      userId,
      input.account,
      input.category,
      input.tags,
      input.statementKind,
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
            additionalAttributes: row.additionalAttributes,
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
  },
);

export const getRowsCount = instrumentedFunction(
  'getRowsCount',
  async (
    db: Database,
    userId: string,
    input: Omit<z.infer<typeof statementParserSchema>, 'page' | 'perPage'>,
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
    if (input.statementKind.length > 0) {
      statementConditions.push(inArray(statements.statementKind, input.statementKind));
      if (input.statementKind.findIndex((kind) => kind === 'self_transfer') === -1) {
        selfTransferStatementConditions.push(sql`1 = 0`);
      }
    }
    if (input.category.length > 0) {
      statementConditions.push(inArray(statements.category, input.category));
    }
    let statementCount = 0;
    if (input.tags.length > 0) {
      statementConditions.push(inArray(sql`tag`, input.tags));
      statementCount = (
        await db
          .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
          .from(statements)
          .crossJoin(sql`unnest(${statements.tags}) as tag`)
          .where(and(...statementConditions))
      )[0].count;
    } else {
      statementCount = (
        await db
          .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
          .from(statements)
          .where(and(...statementConditions))
      )[0].count;
    }
    let selfTransferStatementCount = 0;
    if (input.category.length === 0 && input.tags.length === 0) {
      selfTransferStatementCount = (
        await db
          .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
          .from(selfTransferStatements)
          .where(and(...selfTransferStatementConditions))
      )[0].count;
    }
    return {
      statementCount,
      selfTransferStatementCount,
    };
  },
);

const getChangeForAccount = (accountId: string, statement: Statement | SelfTransferStatement) => {
  if ('accountId' in statement && statement.accountId === accountId) {
    let change = 0;
    if (statement.statementKind === 'expense') {
      change = -1 * Number.parseFloat(statement.amount);
    }
    if (
      statement.statementKind === 'friend_transaction' ||
      statement.statementKind === 'outside_transaction'
    ) {
      change = Number.parseFloat(statement.amount);
    }
    return change;
  }
  if ('fromAccountId' in statement && 'toAccountId' in statement) {
    if (statement.fromAccountId === accountId) {
      return -1 * Number.parseFloat(statement.amount);
    }
    if (statement.toAccountId === accountId) {
      return Number.parseFloat(statement.amount);
    }
  }
  return 0;
};

const getChangeForFriend = (
  friendId: string,
  statement: Statement | SelfTransferStatement,
  splitTotals: { statementId: string; total: number }[],
) => {
  const splitAmount =
    -1 * (splitTotals.find((split) => split.statementId === statement.id)?.total ?? 0);
  if (
    'friendId' in statement &&
    statement.friendId === friendId &&
    (statement.statementKind === 'expense' || statement.statementKind === 'friend_transaction')
  ) {
    return splitAmount + Number.parseFloat(statement.amount);
  }
  return splitAmount;
};

const getFriendSplitsLimited = instrumentedFunction(
  'getFriendSplitsLimited',
  async (
    db: Database,
    userId: string,
    limit: number,
    account: string,
    start?: Date,
    end?: Date,
  ) => {
    const union = generateStatementUnionOverviewQuery(db);
    const conditions = [];
    conditions.push(eq(union.userId, userId));
    if (start !== undefined) {
      conditions.push(gte(union.createdAt, start));
    }
    if (end !== undefined) {
      conditions.push(lt(union.createdAt, end));
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
  },
);

const getStartingBalancesPaginated = instrumentedFunction(
  'getStartingBalancesPaginated',
  async (
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
      [],
      [],
      [],
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
  },
);

export const mergeRawStatementsWithSummary = instrumentedFunction(
  'mergeRawStatementsWithSummary',
  async (
    db: Database,
    userId: string,
    mergeWithAccountFriendId: string,
    rawStatements: (Statement | SelfTransferStatement)[],
    input: Omit<z.infer<typeof statementParserSchema>, 'account'>,
  ) => {
    let splitTotal: {
      statementId: string;
      total: number;
    }[] = [];
    const summary = await getStartingBalancesPaginated(db, userId, {
      ...input,
      account: mergeWithAccountFriendId,
    });
    if ('friend' in summary) {
      splitTotal = await db
        .select({
          total: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number),
          statementId: splits.statementId,
        })
        .from(splits)
        .where(
          and(
            eq(splits.friendId, mergeWithAccountFriendId),
            inArray(
              splits.statementId,
              rawStatements.map((s) => s.id),
            ),
          ),
        )
        .groupBy(splits.statementId);
    }
    let startingBalance = summary.finalBalance;
    return {
      summary,
      statements: rawStatements
        .toReversed()
        .map((statement) => {
          if ('account' in summary && mergeWithAccountFriendId === summary.account.id) {
            const change = getChangeForAccount(mergeWithAccountFriendId, statement);
            startingBalance += change;
            return {
              ...statement,
              finalBalance: startingBalance,
            };
          }
          if ('friend' in summary && mergeWithAccountFriendId === summary.friend.id) {
            const change = getChangeForFriend(mergeWithAccountFriendId, statement, splitTotal);
            startingBalance += change;
            return {
              ...statement,
              finalBalance: startingBalance,
            };
          }
          return statement;
        })
        .reverse(),
    };
  },
);
