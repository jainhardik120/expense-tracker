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
} from 'drizzle-orm';
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

/**
 * Statements and self transfers as one list of rows, for one user.
 *
 * The user is filtered inside each branch -- and on the split totals -- as well
 * as by the callers outside. Only outside, Postgres summed every split in the
 * table and joined every statement before the filter applied: five queries a
 * statements page, ~950,000 pages read and 2.5 s each at a thousand users.
 * The rows are the same either way.
 */
const generateStatementUnionDetailedQuery = (
  db: Database,
  userId: string,
  unnestTags?: boolean,
) => {
  const fromAccount = alias(bankAccount, 'from_account');
  const toAccount = alias(bankAccount, 'to_account');
  const splitTotals = db.$with('split_totals').as(
    db
      .select({
        statementId: splits.statementId,
        total: sql<number>`COALESCE(SUM(${splits.amount}), 0)`.mapWith(Number).as('total'),
      })
      .from(splits)
      .where(eq(splits.userId, userId))
      .groupBy(splits.statementId),
  );
  let statementQuery = db
    .with(splitTotals)
    .select({
      id: statements.id,
      createdAt: statements.createdAt,
      amount: statements.amount,
      taxableAmount: statements.taxableAmount,
      accountName: bankAccount.accountName,
      friendName: friendsProfiles.name,
      userId: statements.userId,
      splitAmount: sql<number>`COALESCE(${splitTotals.total}, 0)`
        .mapWith(Number)
        .as('split_amount'),
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
    statementQuery.where(eq(statements.userId, userId)),
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
      .leftJoin(toAccount, eq(toAccount.id, selfTransferStatements.toAccountId))
      .where(eq(selfTransferStatements.userId, userId)),
  ).as('union_query');
};

/** As above, the overview columns only; filtered by user inside each branch too. */
const generateStatementUnionOverviewQuery = (db: Database, userId: string) => {
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
      .from(statements)
      .where(eq(statements.userId, userId)),
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

/**
 * Sortable columns, mapped to what the union query can order on.
 *
 * Ordering happens in SQL because the table is paginated -- sorting the page in
 * the browser would only reorder the rows that happened to land on it.
 */
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
  // Not unnested, even when filtering by tag. Unnesting gives a row per tag,
  // so a statement carrying two of the tags being filtered for came back twice
  // -- the list showed it twice and the page count was wrong. Asking whether
  // the arrays overlap needs no unnesting and cannot duplicate a row.
  const union = generateStatementUnionDetailedQuery(db, userId, false);
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
  return (
    db
      .select()
      .from(union)
      .where(and(...conditions))
      // Id last as a tiebreaker: without it rows that compare equal can swap
      // between pages and the same row shows up twice, or not at all.
      .orderBy(...ordering, asc(union.id))
  );
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
            additionalAttributes: row.additionalAttributes as Record<string, unknown>,
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
    // Same "everything before this page" slice as the balance query, picked from
    // whichever end the current direction puts the earlier rows at.
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
    // Everything that happened before the page, summed, gives the balance the
    // page opens on. Which rows those are depends on the direction: reading
    // newest first they are the ones past the page, reading oldest first they
    // are the ones before it.
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
    // Accumulate oldest to newest, then put the rows back the way they came.
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

/**
 * Filters are a hierarchy, and narrowing only ever runs downhill.
 *
 * Statement kind and account sit at the top: their value sets are small, fixed
 * and worth seeing in full, so nothing below them removes an option. Category
 * sits under those, and tags under everything -- tags run to the hundreds, and
 * once you are looking at one category the rest are noise.
 *
 * The reverse would be the confusing direction: picking a tag should not quietly
 * delete categories from the list you picked it under.
 */
const FACET_LEVEL: Record<FacetName, number> = {
  statementKind: 0,
  account: 0,
  category: 1,
  tags: 2,
};

/**
 * Conditions for the union query, applying only the filters above this facet.
 *
 * Its own selection is left out too, or picking "Food" would remove every other
 * category from the list and a second one could never be added.
 */
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

/**
 * How many rows each filter value would match under the filters above it.
 *
 * Only values that still match are returned. The caller decides what to do with
 * that: the top-level filters keep their full option list and use the counts to
 * mark the empty ones, while the ones below them drop what is missing.
 */
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
        // A row can name an account in several places at once -- the account it
        // sits on, either side of a transfer, the friend it involves -- so the
        // account dimension is unnested before grouping.
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
