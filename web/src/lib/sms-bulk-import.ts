import { toZonedTime } from 'date-fns-tz';

export const BULK_IMPORT_KINDS = ['expense', 'outside_transaction', 'friend_transaction'] as const;

export type BulkImportKind = (typeof BULK_IMPORT_KINDS)[number];

export const statementKindOptions: { label: string; value: BulkImportKind }[] = [
  { label: 'Expense', value: 'expense' },
  { label: 'Outside Transaction', value: 'outside_transaction' },
  { label: 'Friend Transaction', value: 'friend_transaction' },
];

export type SmsType = 'income' | 'expense' | 'credit' | 'transfer' | 'investment';

export type BulkImportRow = {
  id: string;
  include: boolean;
  date: string;
  amount: number;
  statementKind: BulkImportKind;
  accountId: string;
  friendId: string;
  category: string;
  tags: string[];
  merchant: string;
  bankName: string;
  accountLast4: string;
  smsType: SmsType;
  currency: string;
  timestamp: Date;
};

const KIND_BY_SMS_TYPE: Record<SmsType, { statementKind: BulkImportKind; sign: 1 | -1 }> = {
  expense: { statementKind: 'expense', sign: 1 },
  credit: { statementKind: 'expense', sign: 1 },
  income: { statementKind: 'outside_transaction', sign: 1 },
  investment: { statementKind: 'outside_transaction', sign: -1 },
  transfer: { statementKind: 'expense', sign: 1 },
};

const getDefaultsForSmsType = (smsType: SmsType) => KIND_BY_SMS_TYPE[smsType];

export const formatGridDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatGridDateInZone = (date: Date, timeZone: string): string =>
  formatGridDate(toZonedTime(date, timeZone));

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

export const buildInitialRow = (
  notification: NotificationForRow,
  hints: RowHints,
  timeZone: string,
): BulkImportRow => {
  const { statementKind, sign } = getDefaultsForSmsType(notification.type);
  const magnitude = Math.abs(Number(notification.amount));
  return {
    id: notification.id,
    include: true,
    date: formatGridDateInZone(notification.createdAt, timeZone),
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

export type BulkImportFields = Pick<
  BulkImportRow,
  'date' | 'amount' | 'statementKind' | 'accountId' | 'friendId' | 'category' | 'tags'
>;

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

export const getRowProblem = (row: BulkImportRow): string | null =>
  row.include ? getFieldsProblem(row) : null;

export const updateRows = (
  rows: BulkImportRow[],
  ids: ReadonlySet<string>,
  patch: Partial<BulkImportRow>,
): BulkImportRow[] => rows.map((row) => (ids.has(row.id) ? { ...row, ...patch } : row));

export const addTagToRows = (
  rows: BulkImportRow[],
  ids: ReadonlySet<string>,
  tag: string,
): BulkImportRow[] =>
  rows.map((row) =>
    ids.has(row.id) && !row.tags.includes(tag) ? { ...row, tags: [...row.tags, tag] } : row,
  );

export const collectTagOptions = (rows: BulkImportRow[], fromHistory: string[]): string[] => {
  const seen = new Set(fromHistory);
  const extra: string[] = [];
  for (const row of rows) {
    for (const tag of row.tags) {
      if (tag !== '' && !seen.has(tag)) {
        seen.add(tag);
        extra.push(tag);
      }
    }
  }
  return [...fromHistory, ...extra.sort((a, b) => a.localeCompare(b))];
};

export type BulkImportReadiness = {
  included: BulkImportRow[];
  skipped: number;
  problems: { id: string; problem: string }[];
  canImport: boolean;
};

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
