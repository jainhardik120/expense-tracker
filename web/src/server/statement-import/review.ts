import { fromZonedTime } from 'date-fns-tz';
import { and, asc, desc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';

import { type statementKinds } from '@/db/enums';
import {
  bankAccount,
  creditCardAccounts,
  selfTransferStatements,
  smsNotifications,
  statementImportLinks,
  statementImports,
  statements,
  type StatementImportCheck,
  type StatementImportRow,
} from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';

import { addDays } from './ingest';
import {
  type Direction,
  inPeriodLedgerMatches,
  type LedgerEntry,
  type MatchGroup,
  reconcile,
  type Reconciliation,
} from './reconcile/match';
import { type StatementKind } from './types';

const LOOKBACK_DAYS = 35;
const LOOKAHEAD_DAYS = 35;
const SMS_DAYS = 2;
const LATER_DAYS = 3;
const EXACT_COUNTERPART_DAYS = 3;
const FOLD_DAYS = 3;
const HISTORY_IMPORTS = 24;
const MERCHANT_WORDS = 2;
const PAISE = 100;
const DAY_MS = 86_400_000;

export type AddKind = 'expense' | 'outside_transaction' | 'self_transfer';

export type AddDefaults = {
  statementKind: AddKind;
  category: string;
  tags: string[];
  counterpartyAccountId: string | null;
};

export type ReviewLedgerRow = {
  key: string;
  id: string;
  source: 'statement' | 'self_transfer';
  kind: (typeof statementKinds)[number];
  date: string;
  amount: number;
  direction: Direction;
  label: string;
  category: string | null;
  tags: string[];
};

export type ReviewSuggestion =
  | {
      id: string;
      type: 'add';
      row: number;
      date: string;
      amount: number;
      direction: Direction;
      description: string;
      foldInto: string | null;
      defaults: AddDefaults;
      smsId: string | null;
    }
  | {
      id: string;
      type: 'add_difference';
      group: number;
      date: string;
      amount: number;
      direction: Direction;
      description: string;
      foldInto: string | null;
      defaults: AddDefaults;
      smsId: null;
    }
  | { id: string; type: 'adjust'; ledger: string; from: number; to: number; group: number }
  | { id: string; type: 'redate'; ledger: string; from: string; to: string; group: number }
  | {
      id: string;
      type: 'not_on_statement';
      ledger: string;
      matchedOn: { id: string; periodEnd: string } | null;
      likelyNext: boolean;
    };

export type ReviewGroup = {
  kind: MatchGroup['kind'];
  rows: number[];
  ledger: string[];
  difference: number;
};

type ImportRecord = typeof statementImports.$inferSelect;

const rupees = (paise: number) => paise / PAISE;
const paise = (value: number) => Math.round(value * PAISE);

const localMidnight = (date: string, timeZone: string) =>
  fromZonedTime(`${date}T00:00:00`, timeZone);

const PAYMENT = /\b(?:payment|bbps|autopay|auto debit|neft|imps|rtgs)\b/i;
const FEE = /\b(?:fee|gst|igst|cgst|sgst|tax|surcharge|charges?|interest|markup)\b/i;
const CARD_PAYMENT = /credit\s*card|creditcard|cred club|card payment|cc payment|bbps/i;
const SALARY = /\bsalary\b|\bsal\b/i;
const INTEREST = /\bint\.?\s*pd\b|interest/i;
const CASHBACK = /\b(?:cashback|refund|reversal|reversed)\b/i;
const REFERENCE = /REF\s*NO/g;
const LINE_BREAK = /[\n\r\u2028\u2029]/;
const WHITESPACE = /\s/;

const stripReference = (text: string) => {
  for (const match of text.matchAll(REFERENCE)) {
    if (LINE_BREAK.test(text.slice(match.index + match[0].length))) {
      continue;
    }
    let start = match.index;
    while (start > 0 && WHITESPACE.test(text.charAt(start - 1))) {
      start -= 1;
    }
    if (start > 0 && text.charAt(start - 1) === '-') {
      start -= 1;
    }
    return text.slice(0, start);
  }
  return text;
};

const merchantKey = (description: string) =>
  stripReference(description.toUpperCase())
    .replace(/^UPI[_\s-]*/, '')
    .replace(/[^A-Z ]+/g, ' ')
    .replace(/\b(?:IND|IN|INDIA|PVT|LTD|PRIVATE|LIMITED|WWW|COM|THE)\b/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, MERCHANT_WORDS)
    .join(' ');

export const loadLedger = async (
  db: Database,
  userId: string,
  accountId: string,
  range: { start: string; end: string },
  timeZone: string,
): Promise<ReviewLedgerRow[]> => {
  const from = localMidnight(range.start, timeZone);
  const until = localMidnight(addDays(range.end, 1), timeZone);
  const day = (column: typeof statements.createdAt | typeof selfTransferStatements.createdAt) =>
    sql<string>`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;
  const [statementRows, transferRows] = await Promise.all([
    db
      .select({
        id: statements.id,
        kind: statements.statementKind,
        amount: statements.amount,
        category: statements.category,
        tags: statements.tags,
        date: day(statements.createdAt),
      })
      .from(statements)
      .where(
        and(
          eq(statements.userId, userId),
          eq(statements.accountId, accountId),
          gte(statements.createdAt, from),
          lt(statements.createdAt, until),
        ),
      ),
    db
      .select({
        id: selfTransferStatements.id,
        amount: selfTransferStatements.amount,
        fromAccountId: selfTransferStatements.fromAccountId,
        toAccountId: selfTransferStatements.toAccountId,
        fromName: sql<string>`(SELECT account_name FROM bank_account WHERE id = ${selfTransferStatements.fromAccountId})`,
        toName: sql<string>`(SELECT account_name FROM bank_account WHERE id = ${selfTransferStatements.toAccountId})`,
        date: day(selfTransferStatements.createdAt),
      })
      .from(selfTransferStatements)
      .where(
        and(
          eq(selfTransferStatements.userId, userId),
          sql`(${selfTransferStatements.fromAccountId} = ${accountId} OR ${selfTransferStatements.toAccountId} = ${accountId})`,
          gte(selfTransferStatements.createdAt, from),
          lt(selfTransferStatements.createdAt, until),
        ),
      ),
  ]);
  return [
    ...statementRows.map((row): ReviewLedgerRow => {
      const value = Number(row.amount);
      const signed = row.kind === 'expense' ? -value : value;
      return {
        key: `s:${row.id}`,
        id: row.id,
        source: 'statement',
        kind: row.kind,
        date: row.date,
        amount: Math.abs(value),
        direction: signed < 0 ? 'debit' : 'credit',
        label: row.category,
        category: row.category,
        tags: row.tags,
      };
    }),
    ...transferRows.map((row): ReviewLedgerRow => {
      const incoming = row.toAccountId === accountId;
      return {
        key: `t:${row.id}`,
        id: row.id,
        source: 'self_transfer',
        kind: 'self_transfer',
        date: row.date,
        amount: Number(row.amount),
        direction: incoming ? 'credit' : 'debit',
        label: incoming ? `Transfer from ${row.fromName}` : `Transfer to ${row.toName}`,
        category: null,
        tags: [],
      };
    }),
  ];
};

const toEntries = (rows: StatementImportRow[]) =>
  rows.map((row, index) => ({
    index,
    date: row.date,
    amount: paise(row.amount),
    direction: row.direction,
    description: row.description,
    emi: row.emi,
  }));

const toLedgerEntries = (rows: ReviewLedgerRow[]): LedgerEntry[] =>
  rows.map((row) => ({
    key: row.key,
    date: row.date,
    amount: paise(row.amount),
    direction: row.direction,
    label: row.label,
  }));

const reconcileRecord = (record: ImportRecord, ledger: ReviewLedgerRow[], claimed: Set<string>) =>
  reconcile({
    statement: toEntries(record.rows),
    ledger: toLedgerEntries(
      ledger.filter(
        (row) =>
          !claimed.has(row.key) &&
          row.date >= addDays(record.periodStart, -LOOKBACK_DAYS) &&
          row.date <= addDays(record.periodEnd, LOOKAHEAD_DAYS),
      ),
    ),
    period: { start: record.periodStart, end: record.periodEnd },
  });

const appBalanceBefore = async (
  db: Database,
  accountId: string,
  instant: Date,
): Promise<number> => {
  const result = await db.execute<{ balance: string }>(sql`
    SELECT b.starting_balance
      + COALESCE((
          SELECT SUM(CASE WHEN s."statementKind" = 'expense' THEN -s.amount ELSE s.amount END)
          FROM statements s
          WHERE s.account_id = b.id AND s.created_at < ${instant}
        ), 0)
      + COALESCE((
          SELECT SUM(CASE WHEN t.to_account_id = b.id THEN t.amount ELSE -t.amount END)
          FROM self_transfer_statements t
          WHERE (t.from_account_id = b.id OR t.to_account_id = b.id) AND t.created_at < ${instant}
        ), 0) AS balance
    FROM bank_account b
    WHERE b.id = ${accountId}
  `);
  return Number(result.rows.at(0)?.balance ?? 0);
};

type CategoryHint = { category: string; tags: string[] };

const categoryHistory = async (
  db: Database,
  userId: string,
  current: { rows: StatementImportRow[]; ledger: ReviewLedgerRow[]; result: Reconciliation },
) => {
  const votes = new Map<string, Map<string, { hint: CategoryHint; count: number }>>();
  const vote = (description: string, hint: CategoryHint) => {
    const key = merchantKey(description);
    if (key === '') {
      return;
    }
    const byCategory = votes.get(key) ?? new Map<string, { hint: CategoryHint; count: number }>();
    const signature = `${hint.category}|${hint.tags.join(',')}`;
    const entry = byCategory.get(signature) ?? { hint, count: 0 };
    entry.count += 1;
    byCategory.set(signature, entry);
    votes.set(key, byCategory);
  };

  const ledgerByKey = new Map(current.ledger.map((row) => [row.key, row]));
  for (const group of current.result.groups) {
    const index = group.statement.at(0);
    const key = group.ledger.at(0);
    if (group.statement.length !== 1 || group.ledger.length !== 1 || index === undefined) {
      continue;
    }
    const ledger = key === undefined ? undefined : ledgerByKey.get(key);
    const row = current.rows.at(index);
    if (ledger?.category !== null && ledger?.category !== undefined && row !== undefined) {
      vote(row.description, { category: ledger.category, tags: ledger.tags });
    }
  }

  const applied = await db
    .select({ rows: statementImports.rows, outcome: statementImports.outcome })
    .from(statementImports)
    .where(and(eq(statementImports.userId, userId), eq(statementImports.status, 'applied')))
    .orderBy(desc(statementImports.periodEnd))
    .limit(HISTORY_IMPORTS);
  const pairs = applied.flatMap((record) =>
    (record.outcome?.matches ?? []).flatMap((match) => {
      const index = match.rows.at(0);
      const key = match.ledger.at(0);
      const row = index === undefined ? undefined : record.rows.at(index);
      return match.rows.length === 1 &&
        match.ledger.length === 1 &&
        key?.startsWith('s:') === true &&
        row !== undefined
        ? [{ description: row.description, statementId: key.slice(2) }]
        : [];
    }),
  );
  if (pairs.length > 0) {
    const found = await db
      .select({ id: statements.id, category: statements.category, tags: statements.tags })
      .from(statements)
      .where(
        and(
          eq(statements.userId, userId),
          inArray(
            statements.id,
            pairs.map((pair) => pair.statementId),
          ),
        ),
      );
    const byId = new Map(found.map((row) => [row.id, row]));
    for (const pair of pairs) {
      const statement = byId.get(pair.statementId);
      if (statement !== undefined) {
        vote(pair.description, { category: statement.category, tags: statement.tags });
      }
    }
  }

  return (description: string): CategoryHint | null => {
    const byCategory = votes.get(merchantKey(description));
    if (byCategory === undefined) {
      return null;
    }
    const entries = [...byCategory.values()];
    const [first] = entries;
    return entries.reduce((best, entry) => (entry.count > best.count ? entry : best), first).hint;
  };
};

const usualCounterparty = async (
  db: Database,
  userId: string,
  accountId: string,
  kind: StatementKind,
) => {
  if (kind === 'credit_card') {
    const sources = await db
      .select({ accountId: selfTransferStatements.fromAccountId })
      .from(selfTransferStatements)
      .where(
        and(
          eq(selfTransferStatements.userId, userId),
          eq(selfTransferStatements.toAccountId, accountId),
        ),
      )
      .groupBy(selfTransferStatements.fromAccountId)
      .orderBy(desc(sql`count(*)`))
      .limit(1);
    return sources.at(0)?.accountId ?? null;
  }
  const cards = await db
    .select({ accountId: selfTransferStatements.toAccountId })
    .from(selfTransferStatements)
    .innerJoin(
      creditCardAccounts,
      eq(creditCardAccounts.accountId, selfTransferStatements.toAccountId),
    )
    .where(
      and(
        eq(selfTransferStatements.userId, userId),
        eq(selfTransferStatements.fromAccountId, accountId),
      ),
    )
    .groupBy(selfTransferStatements.toAccountId)
    .orderBy(desc(sql`count(*)`))
    .limit(1);
  return cards.at(0)?.accountId ?? null;
};

const pendingSmsNear = async (
  db: Database,
  userId: string,
  period: { start: string; end: string },
  timeZone: string,
) =>
  db
    .select({
      id: smsNotifications.id,
      amount: smsNotifications.amount,
      date: sql<string>`to_char((${smsNotifications.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`,
    })
    .from(smsNotifications)
    .where(
      and(
        eq(smsNotifications.userId, userId),
        eq(smsNotifications.status, 'pending'),
        gte(smsNotifications.createdAt, localMidnight(addDays(period.start, -SMS_DAYS), timeZone)),
        lt(smsNotifications.createdAt, localMidnight(addDays(period.end, SMS_DAYS + 1), timeZone)),
      ),
    )
    .orderBy(asc(smsNotifications.createdAt));

const dayGap = (left: string, right: string) =>
  Math.abs(Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / DAY_MS;

const defaultsFor = (
  description: string,
  direction: Direction,
  hint: CategoryHint | null,
  paymentSource: string | null,
  kind: StatementKind,
): AddDefaults => {
  if (kind === 'bank_account') {
    if (direction === 'debit' && CARD_PAYMENT.test(description)) {
      return {
        statementKind: 'self_transfer',
        category: '',
        tags: [],
        counterpartyAccountId: paymentSource,
      };
    }
    if (hint === null && direction === 'credit' && SALARY.test(description)) {
      return {
        statementKind: 'outside_transaction',
        category: 'Salary',
        tags: ['Salary'],
        counterpartyAccountId: null,
      };
    }
    if (hint === null && direction === 'credit' && INTEREST.test(description)) {
      return {
        statementKind: 'outside_transaction',
        category: 'Interest',
        tags: [],
        counterpartyAccountId: null,
      };
    }
  } else if (direction === 'credit' && PAYMENT.test(description)) {
    return {
      statementKind: 'self_transfer',
      category: '',
      tags: [],
      counterpartyAccountId: paymentSource,
    };
  }
  if (hint !== null) {
    return {
      statementKind: direction === 'debit' ? 'expense' : 'outside_transaction',
      category: hint.category,
      tags: hint.tags,
      counterpartyAccountId: null,
    };
  }
  if (direction === 'credit') {
    return {
      statementKind: 'outside_transaction',
      category: CASHBACK.test(description) ? 'Refund' : 'Credit',
      tags: [],
      counterpartyAccountId: null,
    };
  }
  return {
    statementKind: 'expense',
    category: FEE.test(description) ? 'Bank Charges' : 'Uncategorized',
    tags: [],
    counterpartyAccountId: null,
  };
};

const nearestMatchedLedger = (
  groups: MatchGroup[],
  ledgerByKey: Map<string, ReviewLedgerRow>,
  date: string,
  direction: Direction,
) => {
  let best: ReviewLedgerRow | null = null;
  for (const key of groups.flatMap((group) => group.ledger)) {
    const row = ledgerByKey.get(key);
    if (row?.direction !== direction || dayGap(row.date, date) > FOLD_DAYS) {
      continue;
    }
    if (
      best === null ||
      dayGap(row.date, date) < dayGap(best.date, date) ||
      (dayGap(row.date, date) === dayGap(best.date, date) && row.amount > best.amount)
    ) {
      best = row;
    }
  }
  return best?.key ?? null;
};

export type ChainLink = { importId: string; key: string };

export type ChainEntry = { result: Reconciliation; claimed: Set<string> };

export const reconcileChain = (
  records: ImportRecord[],
  ledger: ReviewLedgerRow[],
  links: ChainLink[],
) => {
  const appliedClaims = new Set(links.map((link) => link.key));
  const ownClaims = new Map<string, Set<string>>();
  for (const link of links) {
    const own = ownClaims.get(link.importId) ?? new Set<string>();
    own.add(link.key);
    ownClaims.set(link.importId, own);
  }
  const counterparts = new Map(
    records.map((record) => {
      const exactRows = ledger
        .filter((row) =>
          record.rows.some(
            (entry) =>
              entry.direction === row.direction &&
              paise(entry.amount) === paise(row.amount) &&
              dayGap(entry.date, row.date) <= EXACT_COUNTERPART_DAYS,
          ),
        )
        .map((row) => row.key);
      const own = ownClaims.get(record.id) ?? new Set<string>();
      const inPeriod = inPeriodLedgerMatches({
        statement: toEntries(record.rows),
        ledger: toLedgerEntries(
          ledger.filter((row) => !appliedClaims.has(row.key) || own.has(row.key)),
        ),
        period: { start: record.periodStart, end: record.periodEnd },
      });
      return [record.id, new Set([...exactRows, ...inPeriod])];
    }),
  );
  const reviewClaims = new Set<string>();
  const entries = new Map<string, ChainEntry>();
  for (const record of records) {
    const own = ownClaims.get(record.id) ?? new Set<string>();
    const mine = counterparts.get(record.id) ?? new Set<string>();
    const claimed = new Set(
      [...appliedClaims, ...(record.status === 'review' ? reviewClaims : [])].filter(
        (key) => !own.has(key),
      ),
    );
    for (const other of records) {
      if (other.id === record.id) {
        continue;
      }
      for (const key of counterparts.get(other.id) ?? []) {
        if (!mine.has(key)) {
          claimed.add(key);
        }
      }
    }
    const result = reconcileRecord(record, ledger, claimed);
    if (record.status === 'review') {
      for (const key of result.groups.flatMap((group) => group.ledger)) {
        reviewClaims.add(key);
      }
    }
    entries.set(record.id, { result, claimed });
  }
  return entries;
};

const matchedElsewhere = (
  records: ImportRecord[],
  entries: Map<string, ChainEntry>,
  recordId: string,
) => {
  const owner = new Map<string, { id: string; periodEnd: string }>();
  for (const record of records) {
    if (record.id === recordId) {
      continue;
    }
    for (const group of entries.get(record.id)?.result.groups ?? []) {
      for (const key of group.ledger) {
        owner.set(key, { id: record.id, periodEnd: record.periodEnd });
      }
    }
  }
  return owner;
};

export const accountRecords = (db: Database, accountId: string) =>
  db
    .select()
    .from(statementImports)
    .where(and(eq(statementImports.accountId, accountId), ne(statementImports.status, 'discarded')))
    .orderBy(asc(statementImports.periodStart));

export const accountLinks = async (db: Database, accountId: string): Promise<ChainLink[]> => {
  const links = await db
    .select({
      importId: statementImportLinks.importId,
      statementId: statementImportLinks.statementId,
      selfTransferId: statementImportLinks.selfTransferId,
    })
    .from(statementImportLinks)
    .innerJoin(statementImports, eq(statementImports.id, statementImportLinks.importId))
    .where(and(eq(statementImports.accountId, accountId), eq(statementImports.status, 'applied')));
  return links.map((link) => ({
    importId: link.importId,
    key: link.statementId === null ? `t:${link.selfTransferId ?? ''}` : `s:${link.statementId}`,
  }));
};

export const accountRange = (records: ImportRecord[]) => {
  const starts = records
    .map((record) => record.periodStart)
    .toSorted((left, right) => left.localeCompare(right));
  const ends = records
    .map((record) => record.periodEnd)
    .toSorted((left, right) => left.localeCompare(right));
  return {
    start: addDays(starts.at(0) ?? '', -LOOKBACK_DAYS),
    end: addDays(ends.at(-1) ?? '', LOOKAHEAD_DAYS),
  };
};

export const getImportReview = instrumentedFunction(
  'getImportReview',
  async (db: Database, userId: string, importId: string, timeZone: string) => {
    const found = await db
      .select({ record: statementImports, accountName: bankAccount.accountName })
      .from(statementImports)
      .innerJoin(bankAccount, eq(bankAccount.id, statementImports.accountId))
      .where(and(eq(statementImports.id, importId), eq(statementImports.userId, userId)))
      .limit(1);
    const current = found.at(0);
    if (current === undefined) {
      throw new Error('Statement import not found');
    }
    const { record, accountName } = current;
    const kind: StatementKind = record.summary.kind ?? 'credit_card';

    const siblings = await accountRecords(db, record.accountId);
    const records = siblings.some((sibling) => sibling.id === record.id)
      ? siblings
      : [...siblings, record].toSorted((left, right) =>
          left.periodStart.localeCompare(right.periodStart),
        );
    const [ledger, links] = await Promise.all([
      loadLedger(db, userId, record.accountId, accountRange(records), timeZone),
      accountLinks(db, record.accountId),
    ]);
    const chain = reconcileChain(records, ledger, links);
    const entry = chain.get(record.id);
    if (entry === undefined) {
      throw new Error('Statement import not found');
    }
    const { result, claimed } = entry;
    const explained = explainedRows(record, records, chain, ledger);
    const { elsewhere } = explained;
    const earlier =
      record.status === 'review'
        ? records.filter(
            (other) => other.status === 'review' && other.periodStart < record.periodStart,
          )
        : [];
    const ledgerByKey = new Map(ledger.map((row) => [row.key, row]));

    const [hintFor, paymentSource, sms, appOpening, appClosing, statementBalance] =
      await Promise.all([
        categoryHistory(db, userId, { rows: record.rows, ledger, result }),
        usualCounterparty(db, userId, record.accountId, kind),
        pendingSmsNear(db, userId, { start: record.periodStart, end: record.periodEnd }, timeZone),
        appBalanceBefore(db, record.accountId, localMidnight(record.periodStart, timeZone)),
        appBalanceBefore(
          db,
          record.accountId,
          localMidnight(addDays(record.periodEnd, 1), timeZone),
        ),
        chainedBalance(db, record),
      ]);

    const likelyNext = (key: string) => explained.likelyNext.has(key);

    const usedSms = new Set<string>();
    const smsFor = (amount: number, date: string) => {
      const match = sms.find(
        (candidate) =>
          !usedSms.has(candidate.id) &&
          paise(Math.abs(Number(candidate.amount))) === paise(amount) &&
          dayGap(candidate.date, date) <= SMS_DAYS,
      );
      if (match === undefined) {
        return null;
      }
      usedSms.add(match.id);
      return match.id;
    };

    const suggestions = result.suggestions.map((suggestion): ReviewSuggestion => {
      switch (suggestion.type) {
        case 'add': {
          const row = record.rows.at(suggestion.statement);
          if (row === undefined) {
            throw new Error('Statement row out of range');
          }
          return {
            id: `add:${String(suggestion.statement)}`,
            type: 'add',
            row: suggestion.statement,
            date: row.date,
            amount: row.amount,
            direction: row.direction,
            description: row.description,
            foldInto: suggestion.foldInto,
            defaults: defaultsFor(
              row.description,
              row.direction,
              hintFor(row.description),
              paymentSource,
              kind,
            ),
            smsId: smsFor(row.amount, row.date),
          };
        }
        case 'add_difference':
          return {
            id: `difference:${String(suggestion.group)}`,
            type: 'add_difference',
            group: suggestion.group,
            date: suggestion.date,
            amount: rupees(suggestion.amount),
            direction: suggestion.direction,
            description: 'Rounding left by an EMI conversion',
            foldInto: nearestMatchedLedger(
              result.groups,
              ledgerByKey,
              suggestion.date,
              suggestion.direction,
            ),
            defaults: defaultsFor('charges', suggestion.direction, null, paymentSource, kind),
            smsId: null,
          };
        case 'adjust':
          return {
            id: `adjust:${suggestion.ledger}`,
            type: 'adjust',
            ledger: suggestion.ledger,
            from: rupees(suggestion.from),
            to: rupees(suggestion.to),
            group: suggestion.group,
          };
        case 'redate':
          return { id: `redate:${suggestion.ledger}`, ...suggestion };
        case 'not_on_statement':
          return {
            id: `extra:${suggestion.ledger}`,
            ...suggestion,
            matchedOn: elsewhere.get(suggestion.ledger) ?? null,
            likelyNext: likelyNext(suggestion.ledger),
          };
      }
    });

    const referenced = new Set([
      ...result.groups.flatMap((group) => group.ledger),
      ...result.suggestions.flatMap((suggestion) =>
        'ledger' in suggestion ? [suggestion.ledger] : [],
      ),
      ...suggestions.flatMap((suggestion) =>
        'foldInto' in suggestion && suggestion.foldInto !== null ? [suggestion.foldInto] : [],
      ),
    ]);

    await db
      .update(statementImports)
      .set({
        check: checkOf(result, record.rows, ledger, {
          elsewhere: new Set(elsewhere.keys()),
          likelyNext: explained.likelyNext,
        }),
      })
      .where(eq(statementImports.id, record.id));

    return {
      import: {
        id: record.id,
        accountId: record.accountId,
        accountName,
        issuer: record.issuer,
        source: record.source,
        fileName: record.fileName,
        status: record.status,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        statementDate: record.statementDate,
        totalDue: record.totalDue === null ? null : Number(record.totalDue),
        summary: record.summary,
        kind,
        appliedAt: record.appliedAt,
      },
      rows: record.rows,
      ledger: Object.fromEntries(
        [...referenced].flatMap((key) => {
          const row = ledgerByKey.get(key);
          return row === undefined ? [] : [[key, row]];
        }),
      ) as Partial<Record<string, ReviewLedgerRow>>,
      groups: result.groups.map((group): ReviewGroup => ({
        kind: group.kind,
        rows: group.statement,
        ledger: group.ledger,
        difference: rupees(group.difference),
      })),
      suggestions,
      residual: rupees(result.residual),
      periodGap: periodGap(record, ledger, claimed, result),
      balance: {
        ...statementBalance,
        appOpening,
        appClosing,
      },
      blockedBy:
        earlier.length === 0
          ? null
          : { id: earlier[0]?.id ?? '', periodEnd: earlier[0]?.periodEnd ?? '' },
    };
  },
);

const ROUNDING_SLACK = 1;

const periodGap = (
  record: ImportRecord,
  ledger: ReviewLedgerRow[],
  claimed: Set<string>,
  result: Reconciliation,
) => {
  const inPeriod = (row: ReviewLedgerRow) =>
    row.date >= record.periodStart && row.date <= record.periodEnd;
  const value = (row: ReviewLedgerRow) =>
    paise(row.direction === 'debit' ? -row.amount : row.amount);
  const grouped = new Set(result.groups.flatMap((group) => group.ledger));
  const unmatched = new Set(
    result.suggestions.flatMap((suggestion) =>
      suggestion.type === 'not_on_statement' ? [suggestion.ledger] : [],
    ),
  );
  let notOnStatement = 0;
  let countedElsewhere = 0;
  let datedOutside = 0;
  for (const row of ledger) {
    if (unmatched.has(row.key)) {
      notOnStatement += value(row);
    } else if (claimed.has(row.key) && inPeriod(row)) {
      countedElsewhere += value(row);
    } else if (grouped.has(row.key) && !inPeriod(row)) {
      datedOutside -= value(row);
    }
  }
  return {
    notOnStatement: rupees(notOnStatement),
    countedElsewhere: rupees(countedElsewhere),
    datedOutside: rupees(datedOutside),
  };
};

const chainBalance = (record: ImportRecord, previousClosing: string | null) => {
  const stored = {
    statementOpening: record.openingBalance === null ? null : Number(record.openingBalance),
    statementClosing: record.closingBalance === null ? null : Number(record.closingBalance),
  };
  if (
    stored.statementOpening === null ||
    stored.statementClosing === null ||
    previousClosing === null
  ) {
    return stored;
  }
  const opening = Number(previousClosing);
  const movement = stored.statementClosing - stored.statementOpening;
  if (Math.abs(opening - stored.statementOpening) >= ROUNDING_SLACK) {
    return stored;
  }
  return {
    statementOpening: opening,
    statementClosing: Math.round((opening + movement) * PAISE) / PAISE,
  };
};

const chainedBalance = async (db: Database, record: ImportRecord) => {
  const previous = await db
    .select({ closingBalance: statementImports.closingBalance })
    .from(statementImports)
    .where(
      and(
        eq(statementImports.accountId, record.accountId),
        eq(statementImports.periodEnd, addDays(record.periodStart, -1)),
        ne(statementImports.status, 'discarded'),
      ),
    )
    .limit(1);
  return chainBalance(record, previous.at(0)?.closingBalance ?? null);
};

export const checkOf = (
  result: Reconciliation,
  rows: StatementImportRow[],
  ledger: ReviewLedgerRow[],
  explained: { elsewhere: Set<string>; likelyNext: Set<string> },
): StatementImportCheck => {
  const ledgerByKey = new Map(ledger.map((row) => [row.key, row]));
  const signedPaise = (amount: number, direction: Direction) =>
    direction === 'debit' ? -amount : amount;
  let difference = 0;
  const counts = { add: 0, adjust: 0, redate: 0, notOnStatement: 0, elsewhere: 0, likelyNext: 0 };
  for (const suggestion of result.suggestions) {
    if (suggestion.type === 'add') {
      const row = rows.at(suggestion.statement);
      difference += row === undefined ? 0 : signedPaise(paise(row.amount), row.direction);
      counts.add += 1;
    } else if (suggestion.type === 'add_difference') {
      difference += signedPaise(suggestion.amount, suggestion.direction);
      counts.add += 1;
    } else if (suggestion.type === 'adjust') {
      const row = ledgerByKey.get(suggestion.ledger);
      difference +=
        row === undefined
          ? 0
          : signedPaise(suggestion.to, row.direction) - signedPaise(suggestion.from, row.direction);
      counts.adjust += 1;
    } else if (suggestion.type === 'not_on_statement') {
      if (explained.elsewhere.has(suggestion.ledger)) {
        counts.elsewhere += 1;
      } else if (explained.likelyNext.has(suggestion.ledger)) {
        counts.likelyNext += 1;
      } else {
        const row = ledgerByKey.get(suggestion.ledger);
        difference -= row === undefined ? 0 : signedPaise(paise(row.amount), row.direction);
        counts.notOnStatement += 1;
      }
    } else {
      counts.redate += 1;
    }
  }
  return { computedAt: new Date().toISOString(), gap: rupees(difference), ...counts };
};

export const explainedRows = (
  record: ImportRecord,
  records: ImportRecord[],
  chain: Map<string, ChainEntry>,
  ledger: ReviewLedgerRow[],
) => {
  const elsewhere = matchedElsewhere(records, chain, record.id);
  const hasLaterStatement = records.some((other) => other.periodStart > record.periodEnd);
  const likelyNext = new Set(
    hasLaterStatement
      ? []
      : ledger
          .filter(
            (row) =>
              row.date <= record.periodEnd && dayGap(row.date, record.periodEnd) <= LATER_DAYS,
          )
          .map((row) => row.key),
  );
  return { elsewhere, likelyNext };
};
