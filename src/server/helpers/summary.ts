import {
  and,
  eq,
  sql,
  inArray,
  isNotNull,
  type SQL,
  gte,
  lt,
  ne,
  asc,
  desc,
  or,
} from 'drizzle-orm';
import { type PgTableWithColumns, type TableConfig, unionAll, alias } from 'drizzle-orm/pg-core';
import { type z } from 'zod';

import {
  bankAccount,
  friendsProfiles,
  selfTransferStatements,
  splits,
  statements,
} from '@/db/schema';
import { type Database } from '@/lib/db';
import {
  type StatementKind,
  type DateTruncUnit,
  type AccountTransferSummary,
  type FriendTransferSummary,
  type AggregatedAccountTransferSummary,
  type AggregatedFriendTransferSummary,
  defaultAccountSummary,
  defaultFriendSummary,
  type AccountSummary,
  type FriendSummary,
  type Account,
  type Friend,
  type accountFriendStatementsParserSchema,
  type SelfTransferStatement,
  type Statement,
  type statementParserSchema,
  isSelfTransfer,
} from '@/types';

type AggregationArguments = {
  db: Database;
  userId: string;
  selectColumns?: Record<string, SQL>;
  aggregationBy?: SQL[];
  start?: Date;
  end?: Date;
};

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

type AggregatedStatementResult = {
  statementKind?: StatementKind;
  totalAmount: number;
};

export const getFinalBalanceFromStatements = (
  ...statements: AggregatedStatementResult[]
): AccountTransferSummary => {
  const expenses = statements
    .filter((statement) => statement.statementKind === 'expense')
    .reduce((acc, cur) => {
      return acc + cur.totalAmount;
    }, 0);
  const outsideTransactions = statements
    .filter((statement) => statement.statementKind === 'outside_transaction')
    .reduce((acc, cur) => {
      return acc + cur.totalAmount;
    }, 0);
  const friendTransactions = statements
    .filter((statement) => statement.statementKind === 'friend_transaction')
    .reduce((acc, cur) => {
      return acc + cur.totalAmount;
    }, 0);
  const selfTransfers = statements
    .filter((statement) => statement.statementKind === undefined)
    .reduce((acc, cur) => {
      return acc + cur.totalAmount;
    }, 0);
  return {
    expenses,
    selfTransfers,
    outsideTransactions,
    friendTransactions,
    totalTransfers: selfTransfers + outsideTransactions + friendTransactions - expenses,
  };
};

export const getFinalBalancesFromFriendStatements = (
  ...statements: AggregatedStatementResult[]
): FriendTransferSummary => {
  const expenses = statements
    .filter((statement) => statement.statementKind === 'expense')
    .reduce((acc, cur) => {
      return acc + cur.totalAmount;
    }, 0);
  const friendTransactions = statements
    .filter((statement) => statement.statementKind === 'friend_transaction')
    .reduce((acc, cur) => {
      return acc + cur.totalAmount;
    }, 0);
  const splits = statements
    .filter((statement) => statement.statementKind === undefined)
    .reduce((acc, cur) => {
      return acc + cur.totalAmount;
    }, 0);
  return {
    paidByFriend: expenses,
    splits: splits,
    friendTransactions: friendTransactions,
    totalTransfers: expenses - splits + friendTransactions,
  };
};

export const selfTransfersUnionQuery = (db: Database, conditions: SQL[]) =>
  unionAll(
    db
      .select({
        accountId: selfTransferStatements.toAccountId,
        createdAt: selfTransferStatements.createdAt,
        amount: sql<number>`${selfTransferStatements.amount}`.mapWith(Number).as('amount'),
      })
      .from(selfTransferStatements)
      .where(and(...conditions)),
    db
      .select({
        accountId: selfTransferStatements.fromAccountId,
        createdAt: selfTransferStatements.createdAt,
        amount: sql<number>`-${selfTransferStatements.amount}`.mapWith(Number).as('amount'),
      })
      .from(selfTransferStatements)
      .where(and(...conditions)),
  ).as('union_query');

export const aggregatedStatementsSummary = (aggregationArguments: AggregationArguments) => {
  const { db, userId, selectColumns = {}, aggregationBy = [], start, end } = aggregationArguments;
  const conditions = buildQueryConditions(statements, userId, start, end);
  return db
    .select({
      ...selectColumns,
      accountId: statements.accountId,
      statementKind: statements.statementKind,
      totalAmount: sql<number>`COALESCE(SUM(${statements.amount}), 0)`.mapWith(Number),
    })
    .from(statements)
    .where(and(...conditions))
    .groupBy(...aggregationBy, statements.accountId, statements.statementKind)
    .orderBy(...aggregationBy, statements.accountId, statements.statementKind);
};

export const aggregatedFriendsData = (aggregationArguments: AggregationArguments) => {
  const { db, userId, selectColumns = {}, aggregationBy = [], start, end } = aggregationArguments;
  const conditions = buildQueryConditions(statements, userId, start, end);
  return db
    .select({
      ...selectColumns,
      friendId: statements.friendId,
      statementKind: statements.statementKind,
      totalAmount: sql<number>`COALESCE(SUM(${statements.amount}), 0)`.mapWith(Number),
    })
    .from(statements)
    .where(
      and(
        ...conditions,
        inArray(statements.statementKind, ['friend_transaction', 'expense']),
        isNotNull(statements.friendId),
      ),
    )
    .groupBy(...aggregationBy, statements.friendId, statements.statementKind)
    .orderBy(...aggregationBy, statements.friendId, statements.statementKind);
};

export const aggregatedSplitsData = (aggregationArguments: AggregationArguments) => {
  const { db, userId, selectColumns = {}, aggregationBy = [], start, end } = aggregationArguments;
  const conditions = buildQueryConditions(statements, userId, start, end);
  return db
    .select({
      ...selectColumns,
      friendId: splits.friendId,
      totalAmount: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number),
    })
    .from(splits)
    .innerJoin(statements, eq(splits.statementId, statements.id))
    .where(and(...conditions))
    .groupBy(...aggregationBy, splits.friendId);
};

export const aggregatedSelfTransfersData = (aggregationArguments: AggregationArguments) => {
  const { db, userId, selectColumns = {}, aggregationBy = [], start, end } = aggregationArguments;
  const conditions = buildQueryConditions(selfTransferStatements, userId, start, end);
  const unionQuery = selfTransfersUnionQuery(db, conditions);
  return db
    .select({
      ...selectColumns,
      accountId: unionQuery.accountId,
      totalAmount: sql<number>`COALESCE(SUM(${unionQuery.amount}), 0)`.mapWith(Number),
    })
    .from(unionQuery)
    .groupBy(...aggregationBy, unionQuery.accountId)
    .orderBy(...aggregationBy, unionQuery.accountId);
};

export const getAccounts = (db: Database, userId: string) =>
  db
    .select()
    .from(bankAccount)
    .where(eq(bankAccount.userId, userId))
    .orderBy(bankAccount.accountName);

export const getFriends = (db: Database, userId: string) =>
  db
    .select()
    .from(friendsProfiles)
    .where(eq(friendsProfiles.userId, userId))
    .orderBy(friendsProfiles.name);

export const getTransfersSummary = async (
  db: Database,
  userId: string,
  start?: Date,
  end?: Date,
): Promise<(AccountTransferSummary & { accountId: string })[]> => {
  const expenses = await aggregatedStatementsSummary({ db, userId, start, end });
  const selfTransfers = await aggregatedSelfTransfersData({ db, userId, start, end });
  const uniqueAccounts = Array.from(
    new Set([
      ...expenses.map((exp) => exp.accountId).filter((id) => id !== null),
      ...selfTransfers.map((exp) => exp.accountId),
    ]),
  );
  return uniqueAccounts.map((id) => {
    const summary = getFinalBalanceFromStatements(
      ...expenses.filter((exp) => exp.accountId === id),
      ...selfTransfers.filter((exp) => exp.accountId === id),
    );
    return {
      accountId: id,
      ...summary,
    };
  });
};

export const friendTransfersSummary = async (
  db: Database,
  userId: string,
  start?: Date,
  end?: Date,
): Promise<(FriendTransferSummary & { friendId: string })[]> => {
  const friendTransactions = await aggregatedFriendsData({ db, userId, start, end });
  const friendSplits = await aggregatedSplitsData({ db, userId, start, end });
  const uniqueFriends = Array.from(
    new Set([
      ...friendTransactions.map((exp) => exp.friendId).filter((id) => id !== null),
      ...friendSplits.map((exp) => exp.friendId),
    ]),
  );
  return uniqueFriends.map((id) => {
    const friendSummary = getFinalBalancesFromFriendStatements(
      ...friendTransactions.filter((exp) => exp.friendId === id),
      ...friendSplits.filter((exp) => exp.friendId === id),
    );
    return {
      friendId: id,
      ...friendSummary,
    };
  });
};

export const getAccountsAndStartingBalances = async (
  db: Database,
  userId: string,
  start?: Date,
): Promise<{ account: Account; startingBalance: number }[]> => {
  const accounts = await getAccounts(db, userId);
  let initBalances = accounts.map((account) => {
    return {
      account,
      startingBalance: Number.parseFloat(account.startingBalance),
    };
  });
  if (start !== undefined) {
    const startingBalances = await getTransfersSummary(db, userId, undefined, start);
    const newBalances = initBalances.map((account) => {
      const transfers =
        startingBalances.find((transfer) => transfer.accountId === account.account.id)
          ?.totalTransfers ?? 0;
      return {
        ...account,
        startingBalance: account.startingBalance + transfers,
      };
    });
    initBalances = newBalances;
  }
  return initBalances;
};

export const getAccountsSummaryBetweenDates = async (
  db: Database,
  userId: string,
  start?: Date,
  end?: Date,
): Promise<AccountSummary[]> => {
  const accountsWithBalances = await getAccountsAndStartingBalances(db, userId, start);
  const getFinalBalances = await getTransfersSummary(db, userId, start, end);
  return accountsWithBalances.map((account) => {
    const accountSummary = getFinalBalances.find(
      (summary) => summary.accountId === account.account.id,
    ) ?? {
      accountId: account.account.id,
      ...defaultAccountSummary,
    };
    return {
      account: account.account,
      ...accountSummary,
      startingBalance: account.startingBalance,
      finalBalance: account.startingBalance + accountSummary.totalTransfers,
    };
  });
};

export const getFriendsAndStartingBalances = async (
  db: Database,
  userId: string,
  start?: Date,
): Promise<{ friend: Friend; startingBalance: number }[]> => {
  const friends = await getFriends(db, userId);
  let initBalances = friends.map((friend) => {
    return {
      friend: friend,
      startingBalance: 0,
    };
  });
  if (start !== undefined) {
    const startingBalances = await friendTransfersSummary(db, userId, undefined, start);
    const newBalances = initBalances.map((friend) => {
      const transfers =
        startingBalances.find((transfer) => transfer.friendId === friend.friend.id)
          ?.totalTransfers ?? 0;
      return {
        ...friend,
        startingBalance: friend.startingBalance + transfers,
      };
    });
    initBalances = newBalances;
  }
  return initBalances;
};

export const getFriendsSummaryBetweenDates = async (
  db: Database,
  userId: string,
  start?: Date,
  end?: Date,
): Promise<FriendSummary[]> => {
  const friendsWithBalances = await getFriendsAndStartingBalances(db, userId, start);
  const getFinalBalances = await friendTransfersSummary(db, userId, start, end);
  return friendsWithBalances.map((friend) => {
    const friendSummary = getFinalBalances.find(
      (summary) => summary.friendId === friend.friend.id,
    ) ?? {
      friendId: friend.friend.id,
      ...defaultFriendSummary,
    };
    return {
      friend: friend.friend,
      ...friendSummary,
      startingBalance: friend.startingBalance,
      finalBalance: friend.startingBalance + friendSummary.totalTransfers,
    };
  });
};

export const addAccountsSummary = (data: AggregatedAccountTransferSummary[]) =>
  data.reduce<AggregatedAccountTransferSummary>((acc, cur) => {
    return {
      startingBalance: acc.startingBalance + cur.startingBalance,
      expenses: acc.expenses + cur.expenses,
      selfTransfers: acc.selfTransfers + cur.selfTransfers,
      outsideTransactions: acc.outsideTransactions + cur.outsideTransactions,
      friendTransactions: acc.friendTransactions + cur.friendTransactions,
      totalTransfers: acc.totalTransfers + cur.totalTransfers,
      finalBalance: acc.finalBalance + cur.finalBalance,
    };
  }, defaultAccountSummary);

export const addFriendsSummary = (data: AggregatedFriendTransferSummary[]) =>
  data.reduce<AggregatedFriendTransferSummary>((acc, cur) => {
    return {
      startingBalance: acc.startingBalance + cur.startingBalance,
      paidByFriend: acc.paidByFriend + cur.paidByFriend,
      splits: acc.splits + cur.splits,
      friendTransactions: acc.friendTransactions + cur.friendTransactions,
      totalTransfers: acc.totalTransfers + cur.totalTransfers,
      finalBalance: acc.finalBalance + cur.finalBalance,
    };
  }, defaultFriendSummary);

export const getRawDataForAggregation = async (
  db: Database,
  userId: string,
  aggregateBy: DateTruncUnit,
  start?: Date,
  end?: Date,
) => {
  const params = {
    db: db,
    userId: userId,
    start: start,
    end: end,
  };
  const statementAggregation =
    sql<Date>`date_trunc('${sql.raw(aggregateBy)}', ${statements.createdAt})`.mapWith(
      (value: string | Date) => (value instanceof Date ? value : new Date(`${value}Z`)),
    );
  const selfTransferAggregation =
    sql<Date>`date_trunc('${sql.raw(aggregateBy)}', union_query.created_at)`.mapWith(
      (value: string | Date) => (value instanceof Date ? value : new Date(`${value}Z`)),
    );
  const statementParams = {
    ...params,
    selectColumns: {
      periodStart: statementAggregation,
    },
    aggregationBy: [statementAggregation],
  };
  const selfTransferParams = {
    ...params,
    selectColumns: {
      periodStart: selfTransferAggregation,
    },
    aggregationBy: [selfTransferAggregation],
  };
  const statementData = (await aggregatedStatementsSummary(statementParams)) as (Awaited<
    ReturnType<typeof aggregatedStatementsSummary>
  >[number] & {
    periodStart: Date;
  })[];
  const selfTransferData = (await aggregatedSelfTransfersData(selfTransferParams)) as (Awaited<
    ReturnType<typeof aggregatedSelfTransfersData>
  >[number] & {
    periodStart: Date;
  })[];
  const friendsData = (await aggregatedFriendsData(statementParams)) as (Awaited<
    ReturnType<typeof aggregatedFriendsData>
  >[number] & {
    periodStart: Date;
  })[];
  const splitsData = (await aggregatedSplitsData(statementParams)) as (Awaited<
    ReturnType<typeof aggregatedSplitsData>
  >[number] & {
    periodStart: Date;
  })[];
  const startingBalances = await getAccountsAndStartingBalances(db, userId, start);
  const startingFriendsBalances = await getFriendsAndStartingBalances(db, userId, start);
  return {
    accountsSummary: startingBalances,
    friendsSummary: startingFriendsBalances,
    statementData,
    friendsData,
    splitsData,
    selfTransferData,
  };
};

export const processAggregatedData = ({
  accountsSummary,
  friendsSummary,
  statementData,
  friendsData,
  splitsData,
  selfTransferData,
}: {
  accountsSummary: { account: Account; startingBalance: number }[];
  friendsSummary: { friend: Friend; startingBalance: number }[];
  statementData: {
    accountId: string | null;
    statementKind: 'expense' | 'outside_transaction' | 'friend_transaction' | 'self_transfer';
    totalAmount: number;
    periodStart: Date;
  }[];
  friendsData: {
    friendId: string | null;
    statementKind: 'expense' | 'outside_transaction' | 'friend_transaction' | 'self_transfer';
    totalAmount: number;
    periodStart: Date;
  }[];
  splitsData: {
    friendId: string;
    totalAmount: number;
    periodStart: Date;
  }[];
  selfTransferData: {
    accountId: string;
    totalAmount: number;
    periodStart: Date;
  }[];
}) => {
  const uniquePeriodStarts = Array.from(
    new Set([
      ...statementData.map((exp) => exp.periodStart.getTime()),
      ...friendsData.map((exp) => exp.periodStart.getTime()),
      ...splitsData.map((exp) => exp.periodStart.getTime()),
      ...selfTransferData.map((exp) => exp.periodStart.getTime()),
    ]),
  )
    .map((timestamp) => new Date(timestamp))
    .toSorted((a, b) => a.getTime() - b.getTime());
  const lastPeriodBalances: Record<string, number> = {};
  for (const account of accountsSummary) {
    lastPeriodBalances[account.account.id] = account.startingBalance;
  }
  for (const friend of friendsSummary) {
    lastPeriodBalances[friend.friend.id] = friend.startingBalance;
  }
  return uniquePeriodStarts.map((date) => {
    const processedAccountSummary: (AggregatedAccountTransferSummary & { accountId: string })[] =
      [];
    for (const account of accountsSummary) {
      const a = statementData.filter(
        (exp) =>
          exp.accountId === account.account.id && exp.periodStart.getTime() === date.getTime(),
      );
      const b = selfTransferData.filter(
        (exp) =>
          exp.accountId === account.account.id && exp.periodStart.getTime() === date.getTime(),
      );
      const summaryData = getFinalBalanceFromStatements(...a, ...b);
      const startingBalance = lastPeriodBalances[account.account.id];
      const finalBalance = startingBalance + summaryData.totalTransfers;
      lastPeriodBalances[account.account.id] = finalBalance;
      processedAccountSummary.push({
        accountId: account.account.id,
        ...summaryData,
        startingBalance,
        finalBalance,
      });
    }
    const processedFriendSummary: (AggregatedFriendTransferSummary & { friendId: string })[] = [];
    for (const friend of friendsSummary) {
      const a = friendsData.filter(
        (exp) => exp.friendId === friend.friend.id && exp.periodStart.getTime() === date.getTime(),
      );
      const b = splitsData.filter(
        (exp) => exp.friendId === friend.friend.id && exp.periodStart.getTime() === date.getTime(),
      );
      const summaryData = getFinalBalancesFromFriendStatements(...a, ...b);
      const startingBalance = lastPeriodBalances[friend.friend.id];
      const finalBalance = startingBalance + summaryData.totalTransfers;
      lastPeriodBalances[friend.friend.id] = finalBalance;
      processedFriendSummary.push({
        friendId: friend.friend.id,
        ...summaryData,
        startingBalance,
        finalBalance,
      });
    }
    const totalAccountsSummary = addAccountsSummary(processedAccountSummary);
    const totalFriendsSummary = addFriendsSummary(processedFriendSummary);
    return {
      date,
      accountsSummary: processedAccountSummary,
      friendsSummary: processedFriendSummary,
      totalAccountsSummary,
      totalFriendsSummary,
      totalExpenses:
        totalAccountsSummary.expenses +
        totalFriendsSummary.paidByFriend -
        totalFriendsSummary.splits,
    };
  });
};

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
  return db
    .select()
    .from(union)
    .where(and(...conditions))
    .orderBy(desc(union.createdAt), asc(union.id));
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

export const getChangeForAccount = (
  accountId: string,
  statement: Statement | SelfTransferStatement,
) => {
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

export const getChangeForFriend = (
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

export const mergeRawStatementsWithSummary = async (
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
};

export const getFromAccount = (statement: Statement | SelfTransferStatement): string | null => {
  if (isSelfTransfer(statement)) {
    return statement.fromAccount;
  }
  switch (statement.statementKind) {
    case 'expense':
      return statement.accountName ?? statement.friendName;
    case 'friend_transaction':
      return Number.parseFloat(statement.amount) < 0 ? statement.accountName : statement.friendName;
    case 'outside_transaction':
      return Number.parseFloat(statement.amount) < 0 ? statement.accountName : null;
    case 'self_transfer':
      return null;
    default:
      return null;
  }
};

export const getToAccount = (statement: Statement | SelfTransferStatement): string | null => {
  if (isSelfTransfer(statement)) {
    return statement.toAccount;
  }
  switch (statement.statementKind) {
    case 'expense':
      return null;
    case 'friend_transaction':
      return Number.parseFloat(statement.amount) < 0 ? statement.friendName : statement.accountName;
    case 'outside_transaction':
      return Number.parseFloat(statement.amount) < 0 ? null : statement.accountName;
    case 'self_transfer':
      return null;
    default:
      return null;
  }
};
