import { and, eq, sql, inArray, isNotNull, type SQL } from 'drizzle-orm';
import { type PgTableWithColumns, type TableConfig, unionAll } from 'drizzle-orm/pg-core';

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
    conditions.push(sql`date(${table.createdAt}) >= ${start}`);
  }
  if (end !== undefined) {
    conditions.push(sql`date(${table.createdAt}) < ${end}`);
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

const getAccountsAndStartingBalances = async (
  db: Database,
  userId: string,
  start?: Date,
): Promise<{ account: Account; startingBalance: number }[]> => {
  const accounts = await getAccounts(db, userId);
  let initBalances = accounts.map((account) => {
    return {
      account,
      startingBalance: parseFloat(account.startingBalance),
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

const getFriendsAndStartingBalances = async (
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
