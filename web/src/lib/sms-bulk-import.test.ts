import { expect, test } from 'vitest';

import {
  buildInitialRow,
  formatGridDate,
  formatGridDateInZone,
  getBulkImportReadiness,
  getFieldsProblem,
  getRowProblem,
  parseGridDate,
  updateRows,
  addTagToRows,
  collectTagOptions,
} from './sms-bulk-import';

const NO_HINTS = { accountIds: [], categories: [], tags: [] };
const CATEGORY_REQUIRED = 'Category is required';
const LAST_OF_SEPTEMBER = '2026-09-30';
const IST = 'Asia/Kolkata';

// The module is imported through a suppressed .ts specifier, so these factories
// borrow their parameter types from the functions under test rather than
// restating them — otherwise every string literal widens and stops matching.
type Notification = Parameters<typeof buildInitialRow>[0];
type Fields = Parameters<typeof getFieldsProblem>[0];
type Row = Parameters<typeof getRowProblem>[0];

const notification = (over: Partial<Notification> = {}): Notification =>
  ({
    id: 'n1',
    amount: '450.5',
    type: 'expense',
    merchant: 'SWIGGY',
    bankName: 'HDFC',
    accountLast4: '1234',
    currency: 'INR',
    createdAt: new Date(2026, 8, 26, 14, 30, 15),
    ...over,
  }) as Notification;

const fields = (over: Partial<Fields> = {}): Fields =>
  ({
    date: '2026-09-26',
    amount: 450.5,
    statementKind: 'expense',
    accountId: 'account-a',
    friendId: '',
    category: 'Food',
    tags: ['delivery'],
    ...over,
  }) as Fields;

const gridRow = (over: Partial<Row> = {}): Row =>
  ({ ...fields(), id: 'n1', include: true, ...over }) as Row;

test('a card spend becomes a positive expense', () => {
  // Expense statements are stored positive and subtracted from the balance, so
  // the amount the message reported carries over untouched.
  const row = buildInitialRow(notification({ type: 'credit' }), NO_HINTS, IST);
  expect(row.statementKind).toBe('expense');
  expect(row.amount).toBe(450.5);
});

test('money arriving from outside becomes a positive outside transaction', () => {
  const row = buildInitialRow(notification({ type: 'income' }), NO_HINTS, IST);
  expect(row.statementKind).toBe('outside_transaction');
  expect(row.amount).toBe(450.5);
});

test('money leaving for an investment becomes a negative outside transaction', () => {
  const row = buildInitialRow(notification({ type: 'investment' }), NO_HINTS, IST);
  expect(row.statementKind).toBe('outside_transaction');
  expect(row.amount).toBe(-450.5);
});

test('the sign comes from the message type, not from the stored amount', () => {
  // Messages always report a magnitude; a stray sign should not flip the meaning.
  const row = buildInitialRow(
    notification({ type: 'investment', amount: '-450.5' }),
    NO_HINTS,
    IST,
  );
  expect(row.amount).toBe(-450.5);
});

test('the top hint pre-fills account, category and one tag', () => {
  const row = buildInitialRow(
    notification(),
    {
      accountIds: ['account-a', 'account-b'],
      categories: ['Food', 'Groceries'],
      tags: ['delivery', 'weekend'],
    },
    IST,
  );
  expect(row.accountId).toBe('account-a');
  expect(row.category).toBe('Food');
  expect(row.tags).toStrictEqual(['delivery']);
});

test('a row with nothing to go on starts blank but included', () => {
  const row = buildInitialRow(notification(), NO_HINTS, IST);
  expect(row.accountId).toBe('');
  expect(row.category).toBe('');
  expect(row.tags).toStrictEqual([]);
  expect(row.include).toBe(true);
  // And is therefore blocked until the user fills it in.
  expect(getRowProblem(row)).toBe(CATEGORY_REQUIRED);
});

test("the grid date is the day the message arrived in the reader's timezone", () => {
  // 18:15 UTC on the 30th is 23:45 on the 30th in IST.
  const row = buildInitialRow(
    notification({ createdAt: new Date(Date.UTC(2026, 8, 30, 18, 15, 0)) }),
    NO_HINTS,
    IST,
  );
  expect(row.date).toBe(LAST_OF_SEPTEMBER);
  // The moment itself is kept untouched so the time of day survives the import.
  expect(row.timestamp.toISOString()).toBe('2026-09-30T18:15:00.000Z');
});

test('a transaction just after midnight IST is not filed on the previous day', () => {
  // 18:58 UTC on the 16th is 00:28 on the 17th in IST. Reading the day off the
  // instant without saying whose day it is offered the 16th, and that is what
  // the user then imported.
  const afterMidnightIst = new Date('2026-09-16T18:58:19.000Z');
  expect(formatGridDate(afterMidnightIst)).toBe('2026-09-16');
  expect(formatGridDateInZone(afterMidnightIst, IST)).toBe('2026-09-17');

  const row = buildInitialRow(notification({ createdAt: afterMidnightIst }), NO_HINTS, IST);
  expect(row.date).toBe('2026-09-17');
});

test('a transaction just after midnight IST on the 1st stays in its own month', () => {
  // 19:10 UTC on 31 August is 00:40 on 1 September in IST, and the month a
  // transaction lands in is the month it is budgeted against.
  expect(formatGridDateInZone(new Date('2026-08-31T19:10:00.000Z'), IST)).toBe('2026-09-01');
});

test('grid dates round-trip', () => {
  expect(formatGridDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  expect(formatGridDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  const parsed = parseGridDate(LAST_OF_SEPTEMBER);
  if (parsed === null) {
    expect.fail('a day that exists should parse');
  }
  expect(formatGridDate(parsed)).toBe(LAST_OF_SEPTEMBER);
});

test('a day that does not exist is rejected rather than rolled forward', () => {
  expect(parseGridDate('2026-02-30')).toBeNull();
  expect(parseGridDate('2026-09-31')).toBeNull();
  expect(parseGridDate('2026-13-01')).toBeNull();
  expect(parseGridDate('26-09-30')).toBeNull();
  expect(parseGridDate('')).toBeNull();
  // A real leap day is fine.
  expect(parseGridDate('2028-02-29')).not.toBeNull();
});

test('an expense needs an account or a friend, and not both', () => {
  expect(getFieldsProblem(fields())).toBeNull();
  expect(getFieldsProblem(fields({ accountId: '', friendId: 'friend-a' }))).toBeNull();
  expect(getFieldsProblem(fields({ accountId: '', friendId: '' }))).toBe(
    'Pick the account it was paid from, or the friend who paid',
  );
  expect(getFieldsProblem(fields({ accountId: 'account-a', friendId: 'friend-a' }))).toBe(
    'An expense takes either an account or a friend, not both',
  );
});

test('an outside transaction needs an account and no friend', () => {
  const outside = { statementKind: 'outside_transaction' } as const;
  expect(getFieldsProblem(fields(outside))).toBeNull();
  expect(getFieldsProblem(fields({ ...outside, accountId: '' }))).toBe(
    'Pick the account the money moved through',
  );
  expect(getFieldsProblem(fields({ ...outside, friendId: 'friend-a' }))).toBe(
    'An outside transaction cannot name a friend',
  );
});

test('a friend transaction needs a friend', () => {
  const friend = { statementKind: 'friend_transaction' } as const;
  expect(getFieldsProblem(fields({ ...friend, friendId: 'friend-a' }))).toBeNull();
  expect(getFieldsProblem(fields({ ...friend, friendId: '' }))).toBe(
    'Pick the friend this was with',
  );
});

test('a row needs a category and a non-zero amount', () => {
  expect(getFieldsProblem(fields({ category: '' }))).toBe(CATEGORY_REQUIRED);
  expect(getFieldsProblem(fields({ category: '   ' }))).toBe(CATEGORY_REQUIRED);
  expect(getFieldsProblem(fields({ amount: 0 }))).toBe('Amount is required');
  expect(getFieldsProblem(fields({ amount: Number.NaN }))).toBe('Amount is required');
  // A negative amount is meaningful, not an error.
  expect(getFieldsProblem(fields({ amount: -20 }))).toBeNull();
});

test('an unticked row is never a problem, however broken', () => {
  const broken = gridRow({ ...fields({ category: '', accountId: '' }), include: false });
  expect(getRowProblem(broken)).toBeNull();
});

test('readiness counts what will go in and what is blocking', () => {
  const rows = [
    gridRow({ id: 'ok' }),
    gridRow({ ...fields({ category: '' }), id: 'broken' }),
    gridRow({ id: 'skipped', include: false }),
  ];
  const readiness = getBulkImportReadiness(rows);
  expect(readiness.included.length).toBe(2);
  expect(readiness.skipped).toBe(1);
  expect(readiness.problems).toStrictEqual([{ id: 'broken', problem: CATEGORY_REQUIRED }]);
  expect(readiness.canImport).toBe(false);
});

test('readiness clears once the blocking row is fixed', () => {
  const rows = [gridRow({ id: 'ok' }), gridRow({ id: 'also-ok' })];
  const readiness = getBulkImportReadiness(rows);
  expect(readiness.problems).toStrictEqual([]);
  expect(readiness.canImport).toBe(true);
  expect(readiness.included.length).toBe(2);
});

test('nothing ticked means nothing to import', () => {
  const rows = [gridRow({ id: 'skipped', include: false })];
  const readiness = getBulkImportReadiness(rows);
  expect(readiness.canImport).toBe(false);
  expect(readiness.skipped).toBe(1);
});

test('a bulk change touches only the selected rows', () => {
  const rows = [gridRow({ id: 'a' }), gridRow({ id: 'b' }), gridRow({ id: 'c' })];
  const updated = updateRows(rows, new Set(['a', 'c']), { category: 'Travel' });
  expect(updated.map((row) => row.category)).toStrictEqual(['Travel', 'Food', 'Travel']);
  // The originals are left as they were.
  expect(rows[0].category).toBe('Food');
});

test('a bulk change can skip or re-include rows', () => {
  const rows = [gridRow({ id: 'a' }), gridRow({ id: 'b' })];
  const skipped = updateRows(rows, new Set(['a']), { include: false });
  expect(skipped.map((row) => row.include)).toStrictEqual([false, true]);
});

test('adding a tag in bulk keeps the tags already on each row', () => {
  const rows = [
    gridRow({ id: 'a', tags: ['delivery'] }),
    gridRow({ id: 'b', tags: [] }),
    gridRow({ id: 'c', tags: ['other'] }),
  ];
  const updated = addTagToRows(rows, new Set(['a', 'b']), 'Lunch');
  expect(updated[0].tags).toStrictEqual(['delivery', 'Lunch']);
  expect(updated[1].tags).toStrictEqual(['Lunch']);
  expect(updated[2].tags).toStrictEqual(['other']);
});

test('adding a tag a row already has changes nothing', () => {
  const rows = [gridRow({ id: 'a', tags: ['Lunch'] })];
  const updated = addTagToRows(rows, new Set(['a']), 'Lunch');
  expect(updated[0].tags).toStrictEqual(['Lunch']);
  expect(updated[0]).toBe(rows[0]);
});

test('the tag menu keeps history order and appends what the user created', () => {
  const rows = [
    gridRow({ id: 'a', tags: ['Curd', 'Kachori'] }),
    gridRow({ id: 'b', tags: ['Bhel'] }),
  ];
  // History order is by how often each was used, so it must not be re-sorted.
  expect(collectTagOptions(rows, ['Curd', 'Dosa'])).toStrictEqual([
    'Curd',
    'Dosa',
    'Bhel',
    'Kachori',
  ]);
});

test('the tag menu does not repeat a tag or offer an empty one', () => {
  const rows = [gridRow({ id: 'a', tags: ['New', 'New', ''] })];
  expect(collectTagOptions(rows, ['Old'])).toStrictEqual(['Old', 'New']);
});
