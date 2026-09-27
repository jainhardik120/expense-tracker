/* eslint-disable import/extensions, @typescript-eslint/no-floating-promises */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInsertHints,
  getIsUsableLast4,
  HISTORY_WINDOW,
  // @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
} from './sms-insert-hints.ts';

type Entry = {
  bankName: string;
  accountLast4: string | null;
  merchant: string | null;
  accountId: string | null;
  category: string | null;
  tags: string[] | null;
};

const entry = (over: Partial<Entry> = {}): Entry => ({
  bankName: 'HDFC',
  accountLast4: '1234',
  merchant: 'SWIGGY',
  accountId: 'account-a',
  category: 'Food',
  tags: ['delivery'],
  ...over,
});

const subject = (over: Partial<{ id: string } & Entry> = {}) => ({
  id: 'n1',
  bankName: 'HDFC',
  accountLast4: '1234',
  merchant: 'SWIGGY',
  ...over,
});

test('suggests the account most often used for the same last four digits', () => {
  const hints = buildInsertHints(
    [
      entry({ accountId: 'account-b' }),
      entry({ accountId: 'account-a' }),
      entry({ accountId: 'account-a' }),
    ],
    [subject()],
  );
  assert.deepEqual(hints.get('n1')?.accountIds, ['account-a', 'account-b']);
});

test('falls back to the bank name when the message has no usable last four', () => {
  const hints = buildInsertHints(
    [
      // Same bank, different card. Keyed on the bank this still counts.
      entry({ accountLast4: '9999', accountId: 'account-c' }),
      entry({ accountLast4: '8888', accountId: 'account-c' }),
    ],
    [subject({ accountLast4: null })],
  );
  assert.deepEqual(hints.get('n1')?.accountIds, ['account-c']);
});

test('treats placeholder last four values as unusable', () => {
  assert.equal(getIsUsableLast4(null), false);
  assert.equal(getIsUsableLast4('XXXX'), false);
  assert.equal(getIsUsableLast4('0000'), false);
  assert.equal(getIsUsableLast4('0'), false);
  assert.equal(getIsUsableLast4('1234'), true);
});

test('does not let a placeholder last four borrow another card history', () => {
  // '0000' is not a key, so this has to resolve through the bank instead.
  const hints = buildInsertHints(
    [entry({ accountLast4: '0000', accountId: 'account-zero' })],
    [subject({ accountLast4: '0000' })],
  );
  assert.deepEqual(hints.get('n1')?.accountIds, ['account-zero']);
});

test('suggests category and tags from the same merchant', () => {
  const hints = buildInsertHints(
    [
      entry({ category: 'Food', tags: ['delivery'] }),
      entry({ category: 'Food', tags: ['delivery', 'weekend'] }),
      entry({ category: 'Groceries', tags: [] }),
    ],
    [subject()],
  );
  assert.deepEqual(hints.get('n1')?.categories, ['Food', 'Groceries']);
  assert.deepEqual(hints.get('n1')?.tags, ['delivery', 'weekend']);
});

test('gives no category or tag hint when the message names no merchant', () => {
  const hints = buildInsertHints([entry()], [subject({ merchant: null })]);
  assert.deepEqual(hints.get('n1')?.categories, []);
  assert.deepEqual(hints.get('n1')?.tags, []);
  // The account still resolves — that is keyed on the card, not the merchant.
  assert.deepEqual(hints.get('n1')?.accountIds, ['account-a']);
});

test('a merchant recategorised recently outranks a long history', () => {
  // Newest first. Eleven older entries say Food, but only the ten most recent
  // count, so the six recent Groceries entries win.
  const history = [
    ...Array.from({ length: 6 }, () => entry({ category: 'Groceries' })),
    ...Array.from({ length: 11 }, () => entry({ category: 'Food' })),
  ];
  const hints = buildInsertHints(history, [subject()]);
  assert.equal(hints.get('n1')?.categories[0], 'Groceries');
});

test('only the most recent window of history is counted', () => {
  const history = [
    ...Array.from({ length: HISTORY_WINDOW }, () => entry({ accountId: 'recent' })),
    ...Array.from({ length: 50 }, () => entry({ accountId: 'ancient' })),
  ];
  const hints = buildInsertHints(history, [subject()]);
  assert.deepEqual(hints.get('n1')?.accountIds, ['recent']);
});

test('resolves every subject from one pass over the history', () => {
  const history = [
    entry({ accountLast4: '1111', accountId: 'account-1', merchant: 'A', category: 'Cat A' }),
    entry({ accountLast4: '2222', accountId: 'account-2', merchant: 'B', category: 'Cat B' }),
  ];
  const hints = buildInsertHints(history, [
    subject({ id: 'first', accountLast4: '1111', merchant: 'A' }),
    subject({ id: 'second', accountLast4: '2222', merchant: 'B' }),
    subject({ id: 'unknown', accountLast4: '3333', bankName: 'OTHER', merchant: 'C' }),
  ]);
  assert.deepEqual(hints.get('first')?.accountIds, ['account-1']);
  assert.deepEqual(hints.get('first')?.categories, ['Cat A']);
  assert.deepEqual(hints.get('second')?.accountIds, ['account-2']);
  assert.deepEqual(hints.get('second')?.categories, ['Cat B']);
  // Nothing to go on, but still present so the caller need not special-case it.
  assert.deepEqual(hints.get('unknown'), { accountIds: [], categories: [], tags: [] });
});

test('ignores history rows that never got an account or category', () => {
  const hints = buildInsertHints(
    [entry({ accountId: null, category: null, tags: null }), entry()],
    [subject()],
  );
  assert.deepEqual(hints.get('n1')?.accountIds, ['account-a']);
  assert.deepEqual(hints.get('n1')?.categories, ['Food']);
  assert.deepEqual(hints.get('n1')?.tags, ['delivery']);
});

test('returns an empty map for an empty queue', () => {
  assert.equal(buildInsertHints([entry()], []).size, 0);
});
