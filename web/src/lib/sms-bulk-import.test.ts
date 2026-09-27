/* eslint-disable import/extensions, @typescript-eslint/no-floating-promises, no-magic-numbers */

import assert from 'node:assert/strict';
import test from 'node:test';

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
  // @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
} from './sms-bulk-import.ts';

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
  assert.equal(row.statementKind, 'expense');
  assert.equal(row.amount, 450.5);
});

test('money arriving from outside becomes a positive outside transaction', () => {
  const row = buildInitialRow(notification({ type: 'income' }), NO_HINTS, IST);
  assert.equal(row.statementKind, 'outside_transaction');
  assert.equal(row.amount, 450.5);
});

test('money leaving for an investment becomes a negative outside transaction', () => {
  const row = buildInitialRow(notification({ type: 'investment' }), NO_HINTS, IST);
  assert.equal(row.statementKind, 'outside_transaction');
  assert.equal(row.amount, -450.5);
});

test('the sign comes from the message type, not from the stored amount', () => {
  // Messages always report a magnitude; a stray sign should not flip the meaning.
  const row = buildInitialRow(notification({ type: 'investment', amount: '-450.5' }), NO_HINTS, IST);
  assert.equal(row.amount, -450.5);
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
  assert.equal(row.accountId, 'account-a');
  assert.equal(row.category, 'Food');
  assert.deepEqual(row.tags, ['delivery']);
});

test('a row with nothing to go on starts blank but included', () => {
  const row = buildInitialRow(notification(), NO_HINTS, IST);
  assert.equal(row.accountId, '');
  assert.equal(row.category, '');
  assert.deepEqual(row.tags, []);
  assert.equal(row.include, true);
  // And is therefore blocked until the user fills it in.
  assert.equal(getRowProblem(row), CATEGORY_REQUIRED);
});

test('the grid date is the day the message arrived in the reader\'s timezone', () => {
  // 18:15 UTC on the 30th is 23:45 on the 30th in IST.
  const row = buildInitialRow(
    notification({ createdAt: new Date(Date.UTC(2026, 8, 30, 18, 15, 0)) }),
    NO_HINTS,
    IST,
  );
  assert.equal(row.date, LAST_OF_SEPTEMBER);
  // The moment itself is kept untouched so the time of day survives the import.
  assert.equal(row.timestamp.toISOString(), '2026-09-30T18:15:00.000Z');
});

test('a transaction just after midnight IST is not filed on the previous day', () => {
  // 18:58 UTC on the 16th is 00:28 on the 17th in IST. Reading the day off the
  // instant without saying whose day it is offered the 16th, and that is what
  // the user then imported.
  const afterMidnightIst = new Date('2026-09-16T18:58:19.000Z');
  assert.equal(formatGridDate(afterMidnightIst), '2026-09-16');
  assert.equal(formatGridDateInZone(afterMidnightIst, IST), '2026-09-17');

  const row = buildInitialRow(notification({ createdAt: afterMidnightIst }), NO_HINTS, IST);
  assert.equal(row.date, '2026-09-17');
});

test('a transaction just after midnight IST on the 1st stays in its own month', () => {
  // 19:10 UTC on 31 August is 00:40 on 1 September in IST, and the month a
  // transaction lands in is the month it is budgeted against.
  assert.equal(formatGridDateInZone(new Date('2026-08-31T19:10:00.000Z'), IST), '2026-09-01');
});

test('grid dates round-trip', () => {
  assert.equal(formatGridDate(new Date(2026, 0, 1)), '2026-01-01');
  assert.equal(formatGridDate(new Date(2026, 11, 31)), '2026-12-31');
  const parsed = parseGridDate(LAST_OF_SEPTEMBER);
  assert.ok(parsed instanceof Date);
  assert.equal(formatGridDate(parsed), LAST_OF_SEPTEMBER);
});

test('a day that does not exist is rejected rather than rolled forward', () => {
  assert.equal(parseGridDate('2026-02-30'), null);
  assert.equal(parseGridDate('2026-09-31'), null);
  assert.equal(parseGridDate('2026-13-01'), null);
  assert.equal(parseGridDate('26-09-30'), null);
  assert.equal(parseGridDate(''), null);
  // A real leap day is fine.
  assert.notEqual(parseGridDate('2028-02-29'), null);
});

test('an expense needs an account or a friend, and not both', () => {
  assert.equal(getFieldsProblem(fields()), null);
  assert.equal(getFieldsProblem(fields({ accountId: '', friendId: 'friend-a' })), null);
  assert.equal(
    getFieldsProblem(fields({ accountId: '', friendId: '' })),
    'Pick the account it was paid from, or the friend who paid',
  );
  assert.equal(
    getFieldsProblem(fields({ accountId: 'account-a', friendId: 'friend-a' })),
    'An expense takes either an account or a friend, not both',
  );
});

test('an outside transaction needs an account and no friend', () => {
  const outside = { statementKind: 'outside_transaction' } as const;
  assert.equal(getFieldsProblem(fields(outside)), null);
  assert.equal(
    getFieldsProblem(fields({ ...outside, accountId: '' })),
    'Pick the account the money moved through',
  );
  assert.equal(
    getFieldsProblem(fields({ ...outside, friendId: 'friend-a' })),
    'An outside transaction cannot name a friend',
  );
});

test('a friend transaction needs a friend', () => {
  const friend = { statementKind: 'friend_transaction' } as const;
  assert.equal(getFieldsProblem(fields({ ...friend, friendId: 'friend-a' })), null);
  assert.equal(getFieldsProblem(fields({ ...friend, friendId: '' })), 'Pick the friend this was with');
});

test('a row needs a category and a non-zero amount', () => {
  assert.equal(getFieldsProblem(fields({ category: '' })), CATEGORY_REQUIRED);
  assert.equal(getFieldsProblem(fields({ category: '   ' })), CATEGORY_REQUIRED);
  assert.equal(getFieldsProblem(fields({ amount: 0 })), 'Amount is required');
  assert.equal(getFieldsProblem(fields({ amount: Number.NaN })), 'Amount is required');
  // A negative amount is meaningful, not an error.
  assert.equal(getFieldsProblem(fields({ amount: -20 })), null);
});

test('an unticked row is never a problem, however broken', () => {
  const broken = gridRow({ ...fields({ category: '', accountId: '' }), include: false });
  assert.equal(getRowProblem(broken), null);
});

test('readiness counts what will go in and what is blocking', () => {
  const rows = [
    gridRow({ id: 'ok' }),
    gridRow({ ...fields({ category: '' }), id: 'broken' }),
    gridRow({ id: 'skipped', include: false }),
  ];
  const readiness = getBulkImportReadiness(rows);
  assert.equal(readiness.included.length, 2);
  assert.equal(readiness.skipped, 1);
  assert.deepEqual(readiness.problems, [{ id: 'broken', problem: CATEGORY_REQUIRED }]);
  assert.equal(readiness.canImport, false);
});

test('readiness clears once the blocking row is fixed', () => {
  const rows = [gridRow({ id: 'ok' }), gridRow({ id: 'also-ok' })];
  const readiness = getBulkImportReadiness(rows);
  assert.deepEqual(readiness.problems, []);
  assert.equal(readiness.canImport, true);
  assert.equal(readiness.included.length, 2);
});

test('nothing ticked means nothing to import', () => {
  const rows = [gridRow({ id: 'skipped', include: false })];
  const readiness = getBulkImportReadiness(rows);
  assert.equal(readiness.canImport, false);
  assert.equal(readiness.skipped, 1);
});

test('a bulk change touches only the selected rows', () => {
  const rows = [gridRow({ id: 'a' }), gridRow({ id: 'b' }), gridRow({ id: 'c' })];
  const updated = updateRows(rows, new Set(['a', 'c']), { category: 'Travel' });
  assert.deepEqual(
    updated.map((row) => row.category),
    ['Travel', 'Food', 'Travel'],
  );
  // The originals are left as they were.
  assert.equal(rows[0].category, 'Food');
});

test('a bulk change can skip or re-include rows', () => {
  const rows = [gridRow({ id: 'a' }), gridRow({ id: 'b' })];
  const skipped = updateRows(rows, new Set(['a']), { include: false });
  assert.deepEqual(
    skipped.map((row) => row.include),
    [false, true],
  );
});

test('adding a tag in bulk keeps the tags already on each row', () => {
  const rows = [
    gridRow({ id: 'a', tags: ['delivery'] }),
    gridRow({ id: 'b', tags: [] }),
    gridRow({ id: 'c', tags: ['other'] }),
  ];
  const updated = addTagToRows(rows, new Set(['a', 'b']), 'Lunch');
  assert.deepEqual(updated[0].tags, ['delivery', 'Lunch']);
  assert.deepEqual(updated[1].tags, ['Lunch']);
  assert.deepEqual(updated[2].tags, ['other']);
});

test('adding a tag a row already has changes nothing', () => {
  const rows = [gridRow({ id: 'a', tags: ['Lunch'] })];
  const updated = addTagToRows(rows, new Set(['a']), 'Lunch');
  assert.deepEqual(updated[0].tags, ['Lunch']);
  assert.equal(updated[0], rows[0]);
});

test('the tag menu keeps history order and appends what the user created', () => {
  const rows = [gridRow({ id: 'a', tags: ['Curd', 'Kachori'] }), gridRow({ id: 'b', tags: ['Bhel'] })];
  // History order is by how often each was used, so it must not be re-sorted.
  assert.deepEqual(collectTagOptions(rows, ['Curd', 'Dosa']), ['Curd', 'Dosa', 'Bhel', 'Kachori']);
});

test('the tag menu does not repeat a tag or offer an empty one', () => {
  const rows = [gridRow({ id: 'a', tags: ['New', 'New', ''] })];
  assert.deepEqual(collectTagOptions(rows, ['Old']), ['Old', 'New']);
});
