import { expect, test } from 'vitest';

import {
  buildInsertHints,
  collectTagVocabulary,
  getIsUsableLast4,
  HISTORY_WINDOW,
} from './sms-insert-hints';

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
  expect(hints.get('n1')?.accountIds).toStrictEqual(['account-a', 'account-b']);
});

test('falls back to the bank name when the message has no usable last four', () => {
  const hints = buildInsertHints(
    [
      entry({ accountLast4: '9999', accountId: 'account-c' }),
      entry({ accountLast4: '8888', accountId: 'account-c' }),
    ],
    [subject({ accountLast4: null })],
  );
  expect(hints.get('n1')?.accountIds).toStrictEqual(['account-c']);
});

test('treats placeholder last four values as unusable', () => {
  expect(getIsUsableLast4(null)).toBe(false);
  expect(getIsUsableLast4('XXXX')).toBe(false);
  expect(getIsUsableLast4('0000')).toBe(false);
  expect(getIsUsableLast4('0')).toBe(false);
  expect(getIsUsableLast4('1234')).toBe(true);
});

test('does not let a placeholder last four borrow another card history', () => {
  const hints = buildInsertHints(
    [entry({ accountLast4: '0000', accountId: 'account-zero' })],
    [subject({ accountLast4: '0000' })],
  );
  expect(hints.get('n1')?.accountIds).toStrictEqual(['account-zero']);
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
  expect(hints.get('n1')?.categories).toStrictEqual(['Food', 'Groceries']);
  expect(hints.get('n1')?.tags).toStrictEqual(['delivery', 'weekend']);
});

test('gives no category or tag hint when the message names no merchant', () => {
  const hints = buildInsertHints([entry()], [subject({ merchant: null })]);
  expect(hints.get('n1')?.categories).toStrictEqual([]);
  expect(hints.get('n1')?.tags).toStrictEqual([]);
  expect(hints.get('n1')?.accountIds).toStrictEqual(['account-a']);
});

test('a merchant recategorised recently outranks a long history', () => {
  const history = [
    ...Array.from({ length: 6 }, () => entry({ category: 'Groceries' })),
    ...Array.from({ length: 11 }, () => entry({ category: 'Food' })),
  ];
  const hints = buildInsertHints(history, [subject()]);
  expect(hints.get('n1')?.categories[0]).toBe('Groceries');
});

test('only the most recent window of history is counted', () => {
  const history = [
    ...Array.from({ length: HISTORY_WINDOW }, () => entry({ accountId: 'recent' })),
    ...Array.from({ length: 50 }, () => entry({ accountId: 'ancient' })),
  ];
  const hints = buildInsertHints(history, [subject()]);
  expect(hints.get('n1')?.accountIds).toStrictEqual(['recent']);
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
  expect(hints.get('first')?.accountIds).toStrictEqual(['account-1']);
  expect(hints.get('first')?.categories).toStrictEqual(['Cat A']);
  expect(hints.get('second')?.accountIds).toStrictEqual(['account-2']);
  expect(hints.get('second')?.categories).toStrictEqual(['Cat B']);
  expect(hints.get('unknown')).toStrictEqual({ accountIds: [], categories: [], tags: [] });
});

test('ignores history rows that never got an account or category', () => {
  const hints = buildInsertHints(
    [entry({ accountId: null, category: null, tags: null }), entry()],
    [subject()],
  );
  expect(hints.get('n1')?.accountIds).toStrictEqual(['account-a']);
  expect(hints.get('n1')?.categories).toStrictEqual(['Food']);
  expect(hints.get('n1')?.tags).toStrictEqual(['delivery']);
});

test('returns an empty map for an empty queue', () => {
  expect(buildInsertHints([entry()], []).size).toBe(0);
});

test('the tag menu offers what has actually been chosen, most used first', () => {
  const vocabulary = collectTagVocabulary([
    entry({ tags: ['Biscuit'] }),
    entry({ tags: ['Vada Paw', 'Biscuit'] }),
    entry({ tags: ['Biscuit'] }),
    entry({ tags: ['Sweets'] }),
  ]);
  expect(vocabulary).toStrictEqual(['Biscuit', 'Sweets', 'Vada Paw']);
});

test('the tag menu skips empty and missing tag lists', () => {
  const vocabulary = collectTagVocabulary([
    entry({ tags: null }),
    entry({ tags: [] }),
    entry({ tags: ['', 'Curd'] }),
  ]);
  expect(vocabulary).toStrictEqual(['Curd']);
});

test('equally used tags are offered alphabetically rather than arbitrarily', () => {
  const vocabulary = collectTagVocabulary([entry({ tags: ['Zebra'] }), entry({ tags: ['Apple'] })]);
  expect(vocabulary).toStrictEqual(['Apple', 'Zebra']);
});
