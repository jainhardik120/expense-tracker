import {
  and,
  arrayOverlaps,
  eq,
  sql,
  inArray,
  gte,
  lt,
  ne,
  asc,
  desc,
  or,
  type SQL,
  count,
} from 'drizzle-orm';
import { unionAll, alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { type z } from 'zod';

import type { StatementAttributes } from '@/db/attributes';
import { type ShareKind } from '@/db/enums';
import {
  bankAccount,
  friendsProfiles,
  selfTransferStatements,
  splits,
  statements,
  visibleStatements,
} from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import {
  type StatementSort,
  type StatementKind,
  type accountFriendStatementsParserSchema,
  type SelfTransferStatement,
  type Statement,
  parseStatementSort,
  type statementParserSchema,
} from '@/types';

import { buildQueryConditions } from '.';
import {
  getAccountsAndStartingBalances,
  getFinalBalanceFromStatements,
  getFinalBalancesFromFriendStatements,
  getFriendsAndStartingBalances,
} from './summary';

export const getStatementAmountAndSplits = instrumentedFunction(
  'getStatementAmountAndSplits',
  async (db: Database, userId: string, statementId: string, exceptSplitId?: string) => {
    const statementResult = await db
      .select({ amount: statements.amount, kind: statements.statementKind })
      .from(statements)
      .where(and(eq(statements.id, statementId), eq(statements.userId, userId)))
      .for('update');
    if (statementResult.length === 0) {
      throw new Error('Statement not found');
    }
    const statement = statementResult[0];
    const query = db
      .select({ sum: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number) })
      .from(splits);
    query.where(
      and(
        eq(splits.userId, userId),
        eq(splits.statementId, statementId),
        exceptSplitId === undefined ? undefined : ne(splits.id, exceptSplitId),
      ),
    );
    const totalAllocatedResult = await query.then((res) => res[0]);
    return {
      kind: statement.kind,
      statementAmount: Number.parseFloat(statement.amount),
      totalAllocated: totalAllocatedResult.sum,
    };
  },
);

export const splitTotalsByStatement = (db: Database, userId: string, statementIds?: string[]) =>
  db.$with('split_totals').as(
    db
      .select({
        statementId: splits.statementId,
        total: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number).as('total'),
      })
      .from(splits)
      .where(
        and(
          eq(splits.userId, userId),
          statementIds === undefined ? undefined : inArray(splits.statementId, statementIds),
        ),
      )
      .groupBy(splits.statementId),
  );

const generateStatementUnionDetailedQuery = (
  db: Database,
  userId: string,
  unnestTags?: boolean,
) => {
  const fromAccount = alias(bankAccount, 'from_account');
  const toAccount = alias(bankAccount, 'to_account');
  const splitTotals = splitTotalsByStatement(db, userId);
  let statementQuery = db
    .with(splitTotals)
    .select({
      id: visibleStatements.id,
      createdAt: visibleStatements.createdAt,
      amount: visibleStatements.amount,
      taxableAmount: visibleStatements.taxableAmount,
      accountName: bankAccount.accountName,
      friendName: friendsProfiles.name,
      userId: visibleStatements.userId,
      splitAmount: sql<number>`COALESCE(${splitTotals.total}, 0)`
        .mapWith(Number)
        .as('split_amount'),
      accountId: visibleStatements.accountId,
      friendId: visibleStatements.friendId,
      category: visibleStatements.category,
      tags: visibleStatements.tags,
      statementKind: visibleStatements.statementKind,
      additionalAttributes: visibleStatements.additionalAttributes,
      type: sql<string>`'statement'`.as('type'),
      fromAccount: sql<string | null>`NULL`.as('from_account'),
      toAccount: sql<string | null>`NULL`.as('to_account'),
      fromAccountId: sql<string | null>`NULL::uuid`.as('from_account_id'),
      toAccountId: sql<string | null>`NULL::uuid`.as('to_account_id'),
      shareKind: visibleStatements.shareKind,
      tag: sql<string | null>`tag`.as('tag'),
    })
    .from(visibleStatements)
    .leftJoin(bankAccount, eq(bankAccount.id, visibleStatements.accountId))
    .leftJoin(friendsProfiles, eq(friendsProfiles.id, visibleStatements.friendId))
    .leftJoin(splitTotals, eq(splitTotals.statementId, visibleStatements.id));
  if (unnestTags === true) {
    statementQuery = statementQuery.crossJoin(sql`unnest(${visibleStatements.tags}) as tag`);
  } else {
    statementQuery = statementQuery.crossJoin(sql`(SELECT NULL::text AS tag)`);
  }
  return unionAll(
    statementQuery.where(eq(visibleStatements.userId, userId)),
    db
      .select({
        id: selfTransferStatements.id,
        createdAt: selfTransferStatements.createdAt,
        amount: selfTransferStatements.amount,
        taxableAmount: sql<string | null>`NULL::numeric`.as('taxable_amount'),
        accountName: sql<string | null>`NULL`.as('account_name'),
        friendName: sql<string | null>`NULL`.as('friend_name'),
        userId: selfTransferStatements.userId,
        splitAmount: sql<number>`0`.as('split_amount'),
        accountId: sql<string | null>`NULL::uuid`.as('account_id'),
        friendId: sql<string | null>`NULL::uuid`.as('friend_id'),
        category: sql<string>`NULL`.as('category'),
        tags: sql<string[]>`ARRAY[]::text[]`.as('tags'),
        statementKind: sql<'self_transfer'>`'self_transfer'`.as('statement_kind'),
        additionalAttributes: sql<StatementAttributes>`'{}'`.as('additional_attributes'),
        type: sql<string>`'self_transfer'`.as('type'),
        fromAccount: fromAccount.accountName,
        toAccount: toAccount.accountName,
        fromAccountId: selfTransferStatements.fromAccountId,
        toAccountId: selfTransferStatements.toAccountId,
        shareKind: sql<ShareKind>`'own'`.as('share_kind'),
        tag: sql<string | null>`NULL`.as('tag'),
      })
      .from(selfTransferStatements)
      .leftJoin(fromAccount, eq(fromAccount.id, selfTransferStatements.fromAccountId))
      .leftJoin(toAccount, eq(toAccount.id, selfTransferStatements.toAccountId))
      .where(eq(selfTransferStatements.userId, userId)),
  ).as('union_query');
};

const generateStatementUnionOverviewQuery = (db: Database, userId: string) => {
  return unionAll(
    db
      .select({
        id: visibleStatements.id,
        createdAt: visibleStatements.createdAt,
        userId: visibleStatements.userId,
        friendId: visibleStatements.friendId,
        statementKind: visibleStatements.statementKind,
        type: sql<string>`'statement'`.as('type'),
      })
      .from(visibleStatements)
      .where(eq(visibleStatements.userId, userId)),
    db
      .select({
        id: selfTransferStatements.id,
        createdAt: selfTransferStatements.createdAt,
        userId: selfTransferStatements.userId,
        friendId: sql<string | null>`NULL::uuid`.as('friend_id'),
        statementKind: sql<'self_transfer'>`'self_transfer'`.as('statement_kind'),
        type: sql<string>`'self_transfer'`.as('type'),
      })
      .from(selfTransferStatements)
      .where(eq(selfTransferStatements.userId, userId)),
  ).as('union_query');
};

const sortableColumns = (union: ReturnType<typeof generateStatementUnionDetailedQuery>) => ({
  date: union.createdAt,
  amount: union.amount,
  category: union.category,
});

const getMergedStatementsDetailedRaw = (
  db: Database,
  userId: string,
  account: string[],
  category: string[],
  tags: string[],
  statementKind: StatementKind[],
  sort: StatementSort,
  start?: Date,
  end?: Date,
) => {
  const union = generateStatementUnionDetailedQuery(db, userId, false);
  const conditions: (SQL | undefined)[] = buildQueryConditions(union, userId, start, end);
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
    conditions.push(arrayOverlaps(union.tags, tags));
  }
  if (statementKind.length > 0) {
    conditions.push(inArray(union.statementKind, statementKind));
  }
  const columns = sortableColumns(union);
  const ordering =
    sort.length > 0
      ? sort.map((entry) => (entry.desc ? desc(columns[entry.id]) : asc(columns[entry.id])))
      : [desc(union.createdAt)];
  return db
    .select()
    .from(union)
    .where(and(...conditions))
    .orderBy(...ordering, asc(union.id));
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
      parseStatementSort(input.sort),
      input.start,
      input.end,
    );
    return (await selectQuery.limit(input.perPage).offset(offset))
      .map<Statement | SelfTransferStatement | undefined>((row) => {
        if (row.type === 'statement' && row.statementKind !== 'self_transfer') {
          const value: Statement = {
            id: row.id,
            createdAt: row.createdAt,
            userId: row.userId,
            type: 'statement',
            accountId: row.accountId,
            friendId: row.friendId,
            amount: row.amount,
            taxableAmount: row.taxableAmount,
            category: row.category,
            tags: row.tags,
            statementKind: row.statementKind,
            splitAmount: row.splitAmount,
            accountName: row.accountName,
            friendName: row.friendName,
            additionalAttributes: row.additionalAttributes,
            shareKind: row.shareKind,
            fromAccountId: null,
            toAccountId: null,
            fromAccount: null,
            toAccount: null,
          };
          return value;
        }
        if (row.fromAccountId !== null && row.toAccountId !== null) {
          const value: SelfTransferStatement = {
            id: row.id,
            createdAt: row.createdAt,
            userId: row.userId,
            type: 'self_transfer',
            amount: row.amount,
            statementKind: 'self_transfer',
            accountId: null,
            friendId: null,
            category: null,
            tags: [],
            splitAmount: 0,
            shareKind: 'own',
            accountName: null,
            friendName: null,
            additionalAttributes: {},
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

type CountInput = Omit<z.infer<typeof statementParserSchema>, 'page' | 'perPage'>;

const buildCountConditions = (db: Database, userId: string, input: CountInput) => {
  const statementConditions = [];
  const selfTransferStatementConditions = [];
  statementConditions.push(
    ...buildQueryConditions(visibleStatements, userId, input.start, input.end),
  );
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
        inArray(visibleStatements.accountId, input.account),
        inArray(visibleStatements.friendId, input.account),
        inArray(visibleStatements.id, statementIdsWithSplits),
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
    statementConditions.push(inArray(visibleStatements.statementKind, input.statementKind));
    if (input.statementKind.findIndex((kind) => kind === 'self_transfer') === -1) {
      selfTransferStatementConditions.push(sql`1 = 0`);
    }
  }
  if (input.category.length > 0) {
    statementConditions.push(inArray(visibleStatements.category, input.category));
  }
  if (input.tags.length > 0) {
    statementConditions.push(arrayOverlaps(visibleStatements.tags, input.tags));
  }
  return {
    statementConditions,
    selfTransferStatementConditions,
    includeSelfTransfers: input.category.length === 0 && input.tags.length === 0,
  };
};

export const getRowsCount = instrumentedFunction(
  'getRowsCount',
  async (db: Database, userId: string, input: CountInput) => {
    const { statementConditions, selfTransferStatementConditions, includeSelfTransfers } =
      buildCountConditions(db, userId, input);
    const [{ statementCount }] = await db
      .select({ statementCount: count() })
      .from(visibleStatements)
      .where(and(...statementConditions));
    let selfTransferStatementCount = 0;
    if (includeSelfTransfers) {
      [{ selfTransferStatementCount }] = await db
        .select({ selfTransferStatementCount: count() })
        .from(selfTransferStatements)
        .where(and(...selfTransferStatementConditions));
    }
    return {
      statementCount,
      selfTransferStatementCount,
    };
  },
);

const localDay = (column: AnyPgColumn, timezone: string) =>
  sql<string>`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}, 'YYYY-MM-DD')`;

export const getStatementTimeline = instrumentedFunction(
  'getStatementTimeline',
  async (db: Database, userId: string, input: CountInput, timezone: string) => {
    const { statementConditions, selfTransferStatementConditions, includeSelfTransfers } =
      buildCountConditions(db, userId, input);
    const statementDay = localDay(visibleStatements.createdAt, timezone);
    const selfTransferDay = localDay(selfTransferStatements.createdAt, timezone);
    const [statementDays, selfTransferDays] = await Promise.all([
      db
        .select({ date: statementDay, count: count() })
        .from(visibleStatements)
        .where(and(...statementConditions))
        .groupBy(sql`1`),
      includeSelfTransfers
        ? db
            .select({ date: selfTransferDay, count: count() })
            .from(selfTransferStatements)
            .where(and(...selfTransferStatementConditions))
            .groupBy(sql`1`)
        : Promise.resolve([]),
    ]);
    const counts = new Map<string, number>();
    for (const row of [...statementDays, ...selfTransferDays]) {
      counts.set(row.date, (counts.get(row.date) ?? 0) + row.count);
    }
    return [...counts.entries()]
      .map(([date, total]) => ({ date, count: total }))
      .sort((left, right) => right.date.localeCompare(left.date));
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
  if (statement.type === 'self_transfer') {
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
    page: number,
    perPage: number,
    ascending: boolean,
    account: string,
    start?: Date,
    end?: Date,
  ) => {
    const union = generateStatementUnionOverviewQuery(db, userId);
    const conditions: (SQL | undefined)[] = buildQueryConditions(union, userId, start, end);
    if (account.length > 0) {
      const statementIdsWithSplits = db
        .select({ statementId: splits.statementId })
        .from(splits)
        .where(eq(splits.friendId, account));
      conditions.push(
        or(inArray(union.friendId, [account]), inArray(union.id, statementIdsWithSplits)),
      );
    }
    const ordered = db
      .select()
      .from(union)
      .where(and(...conditions))
      .orderBy(ascending ? asc(union.createdAt) : desc(union.createdAt), asc(union.id));
    const selectedStatements = db
      .$with('selected_statements')
      .as(ascending ? ordered.limit((page - 1) * perPage) : ordered.offset(page * perPage));
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
    ascending: boolean,
  ) => {
    const accountStartingBalanceBeforeStart = (
      await getAccountsAndStartingBalances(db, userId, input.start)
    ).find((account) => account.account.id === input.account);
    const friendsStartingBalanceBeforeStart = (
      await getFriendsAndStartingBalances(db, userId, input.start)
    ).find((friend) => friend.friend.id === input.account);
    const rawQuery = getMergedStatementsDetailedRaw(
      db,
      userId,
      [input.account],
      [],
      [],
      [],
      ascending ? [{ id: 'date', desc: false }] : [],
      input.start,
      input.end,
    );
    const priorRows = ascending
      ? rawQuery.limit((input.page - 1) * input.perPage)
      : rawQuery.offset(input.page * input.perPage);
    const selectedRows = db.$with('selected_rows').as(priorRows);
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
        input.page,
        input.perPage,
        ascending,
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
    ascending: boolean,
  ) => {
    let splitTotal: {
      statementId: string;
      total: number;
    }[] = [];
    const summary = await getStartingBalancesPaginated(
      db,
      userId,
      { ...input, account: mergeWithAccountFriendId },
      ascending,
    );
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
    const chronological = ascending ? rawStatements : rawStatements.toReversed();
    const withBalances = chronological.map((statement) => {
      if ('account' in summary && mergeWithAccountFriendId === summary.account.id) {
        const change = getChangeForAccount(mergeWithAccountFriendId, statement);
        startingBalance += change;
        return { ...statement, finalBalance: startingBalance };
      }
      if ('friend' in summary && mergeWithAccountFriendId === summary.friend.id) {
        const change = getChangeForFriend(mergeWithAccountFriendId, statement, splitTotal);
        startingBalance += change;
        return { ...statement, finalBalance: startingBalance };
      }
      return statement;
    });
    return {
      summary,
      statements: ascending ? withBalances : withBalances.toReversed(),
    };
  },
);

type FacetInput = Omit<z.infer<typeof statementParserSchema>, 'page' | 'perPage'>;
type FacetName = 'account' | 'category' | 'tags' | 'statementKind';
export type FacetCount = { value: string; count: number };

const FACET_LEVEL: Record<FacetName, number> = {
  statementKind: 0,
  account: 0,
  category: 1,
  tags: 2,
};

const buildFacetConditions = (
  db: Database,
  union: ReturnType<typeof generateStatementUnionDetailedQuery>,
  userId: string,
  input: FacetInput,
  facet: FacetName,
) => {
  const applies = (other: FacetName) => FACET_LEVEL[other] < FACET_LEVEL[facet];
  const conditions: SQL<unknown>[] = [eq(union.userId, userId)];
  if (input.start !== undefined) {
    conditions.push(gte(union.createdAt, input.start));
  }
  if (input.end !== undefined) {
    conditions.push(lt(union.createdAt, input.end));
  }
  if (applies('account') && input.account.length > 0) {
    const statementIdsWithSplits = db
      .select({ statementId: splits.statementId })
      .from(splits)
      .where(inArray(splits.friendId, input.account));
    const accountMatch = or(
      inArray(union.accountId, input.account),
      inArray(union.fromAccountId, input.account),
      inArray(union.toAccountId, input.account),
      inArray(union.friendId, input.account),
      inArray(union.id, statementIdsWithSplits),
    );
    if (accountMatch !== undefined) {
      conditions.push(accountMatch);
    }
  }
  if (applies('category') && input.category.length > 0) {
    conditions.push(inArray(union.category, input.category));
  }
  if (applies('tags') && input.tags.length > 0) {
    conditions.push(inArray(union.tag, input.tags));
  }
  if (applies('statementKind') && input.statementKind.length > 0) {
    conditions.push(inArray(union.statementKind, input.statementKind));
  }
  return conditions;
};

export const getStatementFacetCounts = instrumentedFunction(
  'getStatementFacetCounts',
  async (
    db: Database,
    userId: string,
    input: FacetInput,
  ): Promise<Record<FacetName, FacetCount[]>> => {
    const countRows = async (
      exclude: FacetName,
      pick: (union: ReturnType<typeof generateStatementUnionDetailedQuery>) => {
        value: ReturnType<typeof sql<string | null>>;
      },
      unnestTags: boolean,
    ): Promise<FacetCount[]> => {
      const union = generateStatementUnionDetailedQuery(db, userId, unnestTags);
      const { value } = pick(union);
      const rows = await db
        .select({ value, count: sql<number>`count(distinct ${union.id})::int` })
        .from(union)
        .where(and(...buildFacetConditions(db, union, userId, input, exclude)))
        .groupBy(value);
      return rows
        .filter((row): row is { value: string; count: number } => row.value !== null)
        .map((row) => ({ value: row.value, count: Number(row.count) }));
    };

    const [statementKind, category, tags, account] = await Promise.all([
      countRows(
        'statementKind',
        (union) => ({ value: sql<string>`${union.statementKind}` }),
        false,
      ),
      countRows('category', (union) => ({ value: sql<string | null>`${union.category}` }), false),
      countRows('tags', (union) => ({ value: sql<string | null>`${union.tag}` }), true),
      (async () => {
        const union = generateStatementUnionDetailedQuery(db, userId, false);
        const rows = await db
          .select({
            value: sql<string | null>`account_ref`,
            count: sql<number>`count(distinct ${union.id})::int`,
          })
          .from(union)
          .crossJoin(
            sql`unnest(ARRAY[${union.accountId}, ${union.fromAccountId}, ${union.toAccountId}, ${union.friendId}]) AS account_ref`,
          )
          .where(and(...buildFacetConditions(db, union, userId, input, 'account')))
          .groupBy(sql`account_ref`);
        return rows
          .filter((row): row is { value: string; count: number } => row.value !== null)
          .map((row) => ({ value: row.value, count: Number(row.count) }));
      })(),
    ]);

    return { statementKind, category, tags, account };
  },
);
