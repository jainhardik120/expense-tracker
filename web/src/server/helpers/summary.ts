import { fromZonedTime } from 'date-fns-tz';
import { Decimal } from 'decimal.js';
import { and, eq, sql, inArray, isNotNull, type SQL, gte, lt } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';

import { reportBoundaries, selfTransferStatements, splits, statements } from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
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

import { buildQueryConditions } from '.';
import { getAccounts, getFriends } from './account';

type AggregationArguments = {
  db: Database;
  userId: string;
  selectColumns?: Record<string, SQL>;
  aggregationBy?: SQL[];
  start?: Date;
  end?: Date;
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
      return acc.plus(cur.totalAmount);
    }, new Decimal(0));
  const outsideTransactions = statements
    .filter((statement) => statement.statementKind === 'outside_transaction')
    .reduce((acc, cur) => {
      return acc.plus(cur.totalAmount);
    }, new Decimal(0));
  const friendTransactions = statements
    .filter((statement) => statement.statementKind === 'friend_transaction')
    .reduce((acc, cur) => {
      return acc.plus(cur.totalAmount);
    }, new Decimal(0));
  const selfTransfers = statements
    .filter((statement) => statement.statementKind === undefined)
    .reduce((acc, cur) => {
      return acc.plus(cur.totalAmount);
    }, new Decimal(0));
  return {
    expenses: expenses.toNumber(),
    selfTransfers: selfTransfers.toNumber(),
    outsideTransactions: outsideTransactions.toNumber(),
    friendTransactions: friendTransactions.toNumber(),
    totalTransfers: selfTransfers
      .plus(outsideTransactions)
      .plus(friendTransactions)
      .minus(expenses)
      .toNumber(),
  };
};

export const getFinalBalancesFromFriendStatements = (
  ...statements: AggregatedStatementResult[]
): FriendTransferSummary => {
  const expenses = statements
    .filter((statement) => statement.statementKind === 'expense')
    .reduce((acc, cur) => {
      return acc.plus(cur.totalAmount);
    }, new Decimal(0));
  const friendTransactions = statements
    .filter((statement) => statement.statementKind === 'friend_transaction')
    .reduce((acc, cur) => {
      return acc.plus(cur.totalAmount);
    }, new Decimal(0));
  const splits = statements
    .filter((statement) => statement.statementKind === undefined)
    .reduce((acc, cur) => {
      return acc.plus(cur.totalAmount);
    }, new Decimal(0));
  return {
    paidByFriend: expenses.toNumber(),
    splits: splits.toNumber(),
    friendTransactions: friendTransactions.toNumber(),
    totalTransfers: expenses.minus(splits).plus(friendTransactions).toNumber(),
  };
};

const selfTransfersUnionQuery = (db: Database, conditions: SQL[]) =>
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

const aggregatedStatementsSummary = (aggregationArguments: AggregationArguments) => {
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

const aggregatedFriendsData = (aggregationArguments: AggregationArguments) => {
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

const aggregatedSplitsData = (aggregationArguments: AggregationArguments) => {
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

const aggregatedSelfTransfersData = (aggregationArguments: AggregationArguments) => {
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

const getTransfersSummary = instrumentedFunction(
  'getTransfersSummary',
  async (
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
  },
);

const friendTransfersSummary = instrumentedFunction(
  'friendTransfersSummary',
  async (
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
  },
);

export const getAccountsAndStartingBalances = instrumentedFunction(
  'getAccountsAndStartingBalances',
  async (
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
  },
);

export const getAccountsSummaryBetweenDates = instrumentedFunction(
  'getAccountsSummaryBetweenDates',
  async (db: Database, userId: string, start?: Date, end?: Date): Promise<AccountSummary[]> => {
    const accountsWithBalances = await getAccountsAndStartingBalances(db, userId, start);
    const getFinalBalances = await getTransfersSummary(db, userId, start, end);
    return accountsWithBalances.map((account) => {
      const accountSummary = getFinalBalances.find(
        (summary) => summary.accountId === account.account.id,
      ) ?? {
        accountId: account.account.id,
        startingBalance: 0,
        expenses: 0,
        selfTransfers: 0,
        outsideTransactions: 0,
        friendTransactions: 0,
        totalTransfers: 0,
        finalBalance: 0,
      };
      return {
        account: account.account,
        ...accountSummary,
        startingBalance: account.startingBalance,
        finalBalance: account.startingBalance + accountSummary.totalTransfers,
      };
    });
  },
);

export const getFriendsAndStartingBalances = instrumentedFunction(
  'getFriendsAndStartingBalances',
  async (
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
  },
);

export const getFriendsSummaryBetweenDates = instrumentedFunction(
  'getFriendsSummaryBetweenDates',
  async (db: Database, userId: string, start?: Date, end?: Date): Promise<FriendSummary[]> => {
    const friendsWithBalances = await getFriendsAndStartingBalances(db, userId, start);
    const getFinalBalances = await friendTransfersSummary(db, userId, start, end);
    return friendsWithBalances.map((friend) => {
      const friendSummary = getFinalBalances.find(
        (summary) => summary.friendId === friend.friend.id,
      ) ?? {
        friendId: friend.friend.id,
        startingBalance: 0,
        paidByFriend: 0,
        splits: 0,
        friendTransactions: 0,
        totalTransfers: 0,
        finalBalance: 0,
      };
      return {
        friend: friend.friend,
        ...friendSummary,
        startingBalance: friend.startingBalance,
        finalBalance: friend.startingBalance + friendSummary.totalTransfers,
      };
    });
  },
);

export const addAccountsSummary = (data: AggregatedAccountTransferSummary[]) => {
  const val = data.reduce((acc, cur) => {
    return {
      startingBalance: acc.startingBalance.plus(cur.startingBalance),
      expenses: acc.expenses.plus(cur.expenses),
      selfTransfers: acc.selfTransfers.plus(cur.selfTransfers),
      outsideTransactions: acc.outsideTransactions.plus(cur.outsideTransactions),
      friendTransactions: acc.friendTransactions.plus(cur.friendTransactions),
      totalTransfers: acc.totalTransfers.plus(cur.totalTransfers),
      finalBalance: acc.finalBalance.plus(cur.finalBalance),
    };
  }, defaultAccountSummary);
  return {
    startingBalance: val.startingBalance.toNumber(),
    expenses: val.expenses.toNumber(),
    selfTransfers: val.selfTransfers.toNumber(),
    outsideTransactions: val.outsideTransactions.toNumber(),
    friendTransactions: val.friendTransactions.toNumber(),
    totalTransfers: val.totalTransfers.toNumber(),
    finalBalance: val.finalBalance.toNumber(),
  };
};

export const addFriendsSummary = (data: AggregatedFriendTransferSummary[]) => {
  const val = data.reduce((acc, cur) => {
    return {
      startingBalance: acc.startingBalance.plus(cur.startingBalance),
      paidByFriend: acc.paidByFriend.plus(cur.paidByFriend),
      splits: acc.splits.plus(cur.splits),
      friendTransactions: acc.friendTransactions.plus(cur.friendTransactions),
      totalTransfers: acc.totalTransfers.plus(cur.totalTransfers),
      finalBalance: acc.finalBalance.plus(cur.finalBalance),
    };
  }, defaultFriendSummary);
  return {
    startingBalance: val.startingBalance.toNumber(),
    paidByFriend: val.paidByFriend.toNumber(),
    splits: val.splits.toNumber(),
    friendTransactions: val.friendTransactions.toNumber(),
    totalTransfers: val.totalTransfers.toNumber(),
    finalBalance: val.finalBalance.toNumber(),
  };
};

type StatementAggregatedData = Awaited<ReturnType<typeof aggregatedStatementsSummary>>[number] & {
  periodStart: Date;
  category: string;
};
type SelfTransferAggregatedData = Awaited<
  ReturnType<typeof aggregatedSelfTransfersData>
>[number] & {
  periodStart: Date;
};
type FriendsAggregatedData = Awaited<ReturnType<typeof aggregatedFriendsData>>[number] & {
  periodStart: Date;
  category: string;
};
type SplitsAggregatedData = Awaited<ReturnType<typeof aggregatedSplitsData>>[number] & {
  periodStart: Date;
  category: string;
};
export const getRawDataForAggregation = instrumentedFunction(
  'getRawDataForAggregation',
  async (
    db: Database,
    userId: string,
    aggregateBy: DateTruncUnit,
    timezone: string,
    start?: Date,
    end?: Date,
  ) => {
    const params = {
      db: db,
      userId: userId,
      start: start,
      end: end,
    };
    const dateTruncWithTz = (column: string) =>
      sql<Date>`
    date_trunc(
      '${sql.raw(aggregateBy)}',
      (${sql.raw(column)} AT TIME ZONE 'UTC') AT TIME ZONE '${sql.raw(timezone)}'
    )
  `.mapWith((value: string | Date) => {
        if (value instanceof Date) {
          return value;
        }
        return fromZonedTime(new Date(`${value}`), timezone);
      });
    const statementAggregation = dateTruncWithTz('statements.created_at');
    const selfTransferAggregation = dateTruncWithTz('union_query.created_at');
    const statementParams = {
      ...params,
      selectColumns: {
        periodStart: statementAggregation,
        category: sql<string>`${statements.category}`,
      },
      aggregationBy: [statementAggregation, sql<string>`${statements.category}`],
    };
    const selfTransferParams = {
      ...params,
      selectColumns: {
        periodStart: selfTransferAggregation,
      },
      aggregationBy: [selfTransferAggregation],
    };
    const statementData = (await aggregatedStatementsSummary(
      statementParams,
    )) as StatementAggregatedData[];
    const selfTransferData = (await aggregatedSelfTransfersData(
      selfTransferParams,
    )) as SelfTransferAggregatedData[];
    const friendsData = (await aggregatedFriendsData(statementParams)) as FriendsAggregatedData[];
    const splitsData = (await aggregatedSplitsData(statementParams)) as SplitsAggregatedData[];
    const startingBalances = await getAccountsSummaryBetweenDates(db, userId, start, end);
    const startingFriendsBalances = await getFriendsSummaryBetweenDates(db, userId, start, end);
    return {
      accountsSummary: startingBalances,
      friendsSummary: startingFriendsBalances,
      statementData,
      friendsData,
      splitsData,
      selfTransferData,
    };
  },
);

export const processAggregatedData = ({
  accountsSummary,
  friendsSummary,
  statementData,
  friendsData,
  splitsData,
  selfTransferData,
}: {
  accountsSummary: { account: { id: string }; startingBalance: number }[];
  friendsSummary: { friend: { id: string }; startingBalance: number }[];
  statementData: StatementAggregatedData[];
  friendsData: FriendsAggregatedData[];
  splitsData: SplitsAggregatedData[];
  selfTransferData: SelfTransferAggregatedData[];
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
  const uniqueCategories = Array.from(
    new Set([
      ...statementData.map((exp) => exp.category),
      ...friendsData.map((exp) => exp.category),
      ...splitsData.map((exp) => exp.category),
    ]),
  );
  const lastPeriodBalances: Record<string, number> = {};
  for (const account of accountsSummary) {
    lastPeriodBalances[account.account.id] = account.startingBalance;
  }
  for (const friend of friendsSummary) {
    lastPeriodBalances[friend.friend.id] = friend.startingBalance;
  }
  const periodAggregations = uniquePeriodStarts.map((date) => {
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
      const finalBalance = new Decimal(startingBalance).plus(summaryData.totalTransfers).toNumber();
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
      const finalBalance = new Decimal(startingBalance).plus(summaryData.totalTransfers).toNumber();
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
    const categoryWiseSummary: Record<string, number> = {};
    for (const category of uniqueCategories) {
      const filteredStatements = statementData.filter(
        (exp) => exp.category === category && exp.periodStart.getTime() === date.getTime(),
      );
      const statementsSummary = getFinalBalanceFromStatements(...filteredStatements);
      const friendsStatements = friendsData.filter(
        (exp) => exp.category === category && exp.periodStart.getTime() === date.getTime(),
      );
      const splitsStatements = splitsData.filter(
        (exp) => exp.category === category && exp.periodStart.getTime() === date.getTime(),
      );
      const friendsSummary = getFinalBalancesFromFriendStatements(
        ...friendsStatements,
        ...splitsStatements,
      );
      const expense = new Decimal(statementsSummary.expenses)
        .minus(friendsSummary.splits)
        .toNumber();
      categoryWiseSummary[category] = expense;
    }
    return {
      date,
      accountsSummary: processedAccountSummary,
      friendsSummary: processedFriendSummary,
      totalAccountsSummary,
      totalFriendsSummary,
      totalExpenses: new Decimal(totalAccountsSummary.expenses)
        .plus(totalFriendsSummary.paidByFriend)
        .minus(totalFriendsSummary.splits)
        .toNumber(),
      categoryWiseSummary,
    };
  });
  const categoryWiseTotals = periodAggregations.reduce<Record<string, number>>((acc, cur) => {
    for (const category in cur.categoryWiseSummary) {
      acc[category] = new Decimal(acc[category] ?? 0)
        .plus(cur.categoryWiseSummary[category])
        .toNumber();
    }
    return acc;
  }, {});
  return {
    periodAggregations,
    categoryWiseTotals,
  };
};

export const getRawDataForCustomAggregation = instrumentedFunction(
  'getRawDataForCustomAggregation',
  async (db: Database, userId: string) => {
    // @ts-ignore This is not working in drizzle
    const one = db.$with('one').as(sql`select 1 as x`);
    const boundariesCte = db.$with('boundaries').as(
      db
        .select({
          boundary: sql<Date>`(${reportBoundaries.boundaryDate})::timestamptz`
            .mapWith((value: string | Date) => {
              if (value instanceof Date) {
                return value;
              }
              return new Date(`${value}`);
            })
            .as('boundary'),
        })
        .from(reportBoundaries)
        .where(eq(reportBoundaries.userId, userId))
        .unionAll(
          db
            .select({
              boundary: sql<Date>`to_timestamp(0)::timestamptz`
                .mapWith((value: string | Date) => {
                  if (value instanceof Date) {
                    return value;
                  }
                  return new Date(`${value}`);
                })
                .as('boundary'),
            })
            .from(one),
        )
        .unionAll(
          db
            .select({
              boundary: sql<Date>`now()::timestamptz`
                .mapWith((value: string | Date) => {
                  if (value instanceof Date) {
                    return value;
                  }
                  return new Date(`${value}`);
                })
                .as('boundary'),
            })
            .from(one),
        ),
    );
    const dedupCte = db.$with('dedup').as(
      db
        .selectDistinct({
          boundary: boundariesCte.boundary,
        })
        .from(boundariesCte),
    );
    const bucketsCte = db.$with('buckets').as(
      db
        .select({
          startDate: dedupCte.boundary,
          endDate: sql`
          lead(${dedupCte.boundary}) over (order by ${dedupCte.boundary})
        `
            .mapWith((value: string | Date) => {
              if (value instanceof Date) {
                return value;
              }
              return new Date(`${value}`);
            })
            .as('end_date'),
        })
        .from(dedupCte),
    );
    const dbWithExtras = db.with(one, boundariesCte, dedupCte, bucketsCte);
    const statementConditions = buildQueryConditions(statements, userId);
    const selfTransferConditions = buildQueryConditions(selfTransferStatements, userId);
    const statementData = await dbWithExtras
      .select({
        accountId: statements.accountId,
        statementKind: statements.statementKind,
        totalAmount: sql<number>`COALESCE(SUM(${statements.amount}), 0)`.mapWith(Number),
        periodStart: bucketsCte.startDate,
        category: statements.category,
      })
      .from(statements)
      .innerJoin(
        bucketsCte,
        and(
          gte(statements.createdAt, bucketsCte.startDate),
          lt(statements.createdAt, bucketsCte.endDate),
        ),
      )
      .where(and(...statementConditions))
      .groupBy(
        bucketsCte.startDate,
        statements.accountId,
        statements.statementKind,
        statements.category,
      )
      .orderBy(
        bucketsCte.startDate,
        statements.accountId,
        statements.statementKind,
        statements.category,
      );

    const unionQuery = selfTransfersUnionQuery(db, selfTransferConditions);
    const selfTransferData = await dbWithExtras
      .select({
        accountId: unionQuery.accountId,
        totalAmount: sql<number>`COALESCE(SUM(${unionQuery.amount}), 0)`.mapWith(Number),
        periodStart: bucketsCte.startDate,
      })
      .from(unionQuery)
      .innerJoin(
        bucketsCte,
        and(
          gte(unionQuery.createdAt, bucketsCte.startDate),
          lt(unionQuery.createdAt, bucketsCte.endDate),
        ),
      )
      .groupBy(bucketsCte.startDate, unionQuery.accountId)
      .orderBy(bucketsCte.startDate, unionQuery.accountId);
    const friendsData = await dbWithExtras
      .select({
        periodStart: bucketsCte.startDate,
        category: statements.category,
        friendId: statements.friendId,
        statementKind: statements.statementKind,
        totalAmount: sql<number>`COALESCE(SUM(${statements.amount}), 0)`.mapWith(Number),
      })
      .from(statements)
      .innerJoin(
        bucketsCte,
        and(
          gte(statements.createdAt, bucketsCte.startDate),
          lt(statements.createdAt, bucketsCte.endDate),
        ),
      )
      .where(
        and(
          ...statementConditions,
          inArray(statements.statementKind, ['friend_transaction', 'expense']),
          isNotNull(statements.friendId),
        ),
      )
      .groupBy(
        bucketsCte.startDate,
        statements.friendId,
        statements.statementKind,
        statements.category,
      )
      .orderBy(
        bucketsCte.startDate,
        statements.friendId,
        statements.statementKind,
        statements.category,
      );
    const splitsData = await dbWithExtras
      .select({
        periodStart: bucketsCte.startDate,
        category: statements.category,
        friendId: splits.friendId,
        totalAmount: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number),
      })
      .from(splits)
      .innerJoin(statements, eq(splits.statementId, statements.id))
      .innerJoin(
        bucketsCte,
        and(
          gte(statements.createdAt, bucketsCte.startDate),
          lt(statements.createdAt, bucketsCte.endDate),
        ),
      )
      .where(and(...statementConditions))
      .groupBy(bucketsCte.startDate, splits.friendId, statements.category)
      .orderBy(bucketsCte.startDate, splits.friendId, statements.category);
    return {
      statementData,
      selfTransferData,
      friendsData,
      splitsData,
    };
  },
);
