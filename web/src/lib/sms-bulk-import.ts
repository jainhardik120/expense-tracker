/**
 * Turning a queue of bank messages into statements, a screenful at a time.
 *
 * Entering messages one by one means a dialog per message; a few weeks away and
 * the queue is long enough that nobody ever catches up. The bulk grid instead
 * shows every pending message as a row, pre-filled with what the history
 * suggests, and leaves the corrections to the user before writing all of them
 * at once.
 *
 * The rules a row has to satisfy are the same ones the `statements` table
 * enforces with check constraints. They live here, dependency-free, so the grid
 * can show a problem next to the row that causes it and the router can refuse
 * the same row for the same reason instead of surfacing a Postgres error.
 */

/** The statement kinds a message can become. A self transfer is two accounts
 * rather than one and lives in its own table, so it is not offered here. */
export const BULK_IMPORT_KINDS = ['expense', 'outside_transaction', 'friend_transaction'] as const;

export type BulkImportKind = (typeof BULK_IMPORT_KINDS)[number];

/** The kind column's dropdown, in the order the kinds are worth reaching for. */
export const statementKindOptions: { label: string; value: BulkImportKind }[] = [
  { label: 'Expense', value: 'expense' },
  { label: 'Outside Transaction', value: 'outside_transaction' },
  { label: 'Friend Transaction', value: 'friend_transaction' },
];

/** The message types the SMS parser produces. */
export type SmsType = 'income' | 'expense' | 'credit' | 'transfer' | 'investment';

/**
 * A row of the grid.
 *
 * `date` is what the user edits — a calendar day with no time. `timestamp` is
 * the moment the message arrived and is kept out of the grid, because the time
 * of day is worth preserving and is not worth a column. The two are recombined
 * on import.
 */
export type BulkImportRow = {
  /** The pending notification this row came from. */
  id: string;
  include: boolean;
  date: string;
  amount: number;
  statementKind: BulkImportKind;
  accountId: string;
  friendId: string;
  category: string;
  tags: string[];
  /** Read-only context, carried so the user can tell the rows apart. */
  merchant: string;
  bankName: string;
  accountLast4: string;
  smsType: SmsType;
  currency: string;
  timestamp: Date;
};

/**
 * Which kind of statement a message becomes, and with which sign.
 *
 * An `expense` statement is stored positive and subtracted from the balance, so
 * card spend and debits keep the amount the message reported. Money arriving
 * from outside is a positive `outside_transaction`; money leaving for an
 * investment is a negative one. A `transfer` between the user's own accounts
 * has no single-statement form, so it is left as an expense for the user to
 * redirect — it is flagged rather than guessed at.
 */
const KIND_BY_SMS_TYPE: Record<SmsType, { statementKind: BulkImportKind; sign: 1 | -1 }> = {
  expense: { statementKind: 'expense', sign: 1 },
  credit: { statementKind: 'expense', sign: 1 },
  income: { statementKind: 'outside_transaction', sign: 1 },
  investment: { statementKind: 'outside_transaction', sign: -1 },
  transfer: { statementKind: 'expense', sign: 1 },
};

export const getDefaultsForSmsType = (smsType: SmsType) => KIND_BY_SMS_TYPE[smsType];

/** Formats a moment as the `yyyy-MM-dd` the grid's date cell expects. */
export const formatGridDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Reads a `yyyy-MM-dd` grid value back as a local date, rejecting days that do
 * not exist rather than letting the Date constructor roll them forward.
 */
export const parseGridDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
};

type NotificationForRow = {
  id: string;
  amount: string;
  type: SmsType;
  merchant: string | null;
  bankName: string;
  accountLast4: string | null;
  currency: string;
  createdAt: Date;
};

type RowHints = {
  accountIds: string[];
  categories: string[];
  tags: string[];
};

/**
 * The row a message starts as: the amount and moment it reported, plus the
 * account, category and tags that messages like it were filed under before.
 * Every one of them is editable — the history is a starting point, not a claim.
 */
export const buildInitialRow = (
  notification: NotificationForRow,
  hints: RowHints,
): BulkImportRow => {
  const { statementKind, sign } = getDefaultsForSmsType(notification.type);
  const magnitude = Math.abs(Number(notification.amount));
  return {
    id: notification.id,
    include: true,
    date: formatGridDate(notification.createdAt),
    amount: Number.isFinite(magnitude) ? magnitude * sign : 0,
    statementKind,
    accountId: hints.accountIds[0] ?? '',
    friendId: '',
    category: hints.categories[0] ?? '',
    tags: hints.tags.length > 0 ? [hints.tags[0]] : [],
    merchant: notification.merchant ?? '',
    bankName: notification.bankName,
    accountLast4: notification.accountLast4 ?? '',
    smsType: notification.type,
    currency: notification.currency,
    timestamp: notification.createdAt,
  };
};

/** The part of a row that is actually written, and so the part worth checking. */
export type BulkImportFields = Pick<
  BulkImportRow,
  'date' | 'amount' | 'statementKind' | 'accountId' | 'friendId' | 'category' | 'tags'
>;

/**
 * Why a row cannot be imported, or null when it can.
 *
 * The account/friend rules restate the table's own check constraints:
 *   - an expense is paid from an account or owed to a friend, never both;
 *   - an outside transaction has an account and no friend;
 *   - a friend transaction has a friend.
 */
export const getFieldsProblem = (row: BulkImportFields): string | null => {
  if (parseGridDate(row.date) === null) {
    return 'Date must be a real day in yyyy-mm-dd form';
  }
  if (!Number.isFinite(row.amount) || row.amount === 0) {
    return 'Amount is required';
  }
  if (row.category.trim() === '') {
    return 'Category is required';
  }

  const hasAccount = row.accountId !== '';
  const hasFriend = row.friendId !== '';

  switch (row.statementKind) {
    case 'expense':
      if (hasAccount === hasFriend) {
        return hasAccount
          ? 'An expense takes either an account or a friend, not both'
          : 'Pick the account it was paid from, or the friend who paid';
      }
      return null;
    case 'outside_transaction':
      if (!hasAccount) {
        return 'Pick the account the money moved through';
      }
      if (hasFriend) {
        return 'An outside transaction cannot name a friend';
      }
      return null;
    case 'friend_transaction':
      if (!hasFriend) {
        return 'Pick the friend this was with';
      }
      return null;
    default:
      return null;
  }
};

/** As above, but a row the user has unticked is never a problem. */
export const getRowProblem = (row: BulkImportRow): string | null =>
  row.include ? getFieldsProblem(row) : null;

export type BulkImportReadiness = {
  included: BulkImportRow[];
  skipped: number;
  problems: { id: string; problem: string }[];
  canImport: boolean;
};

/** What the footer needs to know: how many rows will go in, and what is blocking. */
export const getBulkImportReadiness = (rows: BulkImportRow[]): BulkImportReadiness => {
  const included = rows.filter((row) => row.include);
  const problems: { id: string; problem: string }[] = [];
  for (const row of included) {
    const problem = getRowProblem(row);
    if (problem !== null) {
      problems.push({ id: row.id, problem });
    }
  }
  return {
    included,
    skipped: rows.length - included.length,
    problems,
    canImport: included.length > 0 && problems.length === 0,
  };
};
