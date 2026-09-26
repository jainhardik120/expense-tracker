/* eslint-disable import/extensions, @typescript-eslint/no-floating-promises, no-magic-numbers */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateGeneratedCreditCardBills,
  // @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
} from './credit-card-bills.ts';

const NOW = new Date('2026-09-22T07:30:00.000Z');
const TIMEZONE = 'Asia/Kolkata';

const card = {
  id: 'card',
  accountId: 'account',
  billingDate: 12,
  startingBalance: 0,
};

test('keeps spending after bill generation in the next cycle', () => {
  const bills = calculateGeneratedCreditCardBills(
    [card],
    [
      {
        accountId: card.accountId,
        createdAt: new Date('2026-09-12T10:00:00.000Z'),
        balanceDelta: -1_000,
      },
      {
        accountId: card.accountId,
        createdAt: new Date('2026-09-13T10:00:00.000Z'),
        balanceDelta: -500,
      },
    ],
    NOW,
    TIMEZONE,
  );

  assert.equal(bills[card.id]?.generatedAmount, 1_000);
  assert.equal(bills[card.id]?.remainingAmount, 1_000);
});

test('reduces a generated bill by later payments but not by later spending', () => {
  const bills = calculateGeneratedCreditCardBills(
    [card],
    [
      {
        accountId: card.accountId,
        createdAt: new Date('2026-09-12T10:00:00.000Z'),
        balanceDelta: -1_000,
      },
      {
        accountId: card.accountId,
        createdAt: new Date('2026-09-13T10:00:00.000Z'),
        balanceDelta: 600,
      },
      {
        accountId: card.accountId,
        createdAt: new Date('2026-09-14T10:00:00.000Z'),
        balanceDelta: -500,
      },
    ],
    NOW,
    TIMEZONE,
  );

  assert.equal(bills[card.id]?.generatedAmount, 1_000);
  assert.equal(bills[card.id]?.remainingAmount, 400);
});

test('does not create a due amount from spending that starts after the billing date', () => {
  const bills = calculateGeneratedCreditCardBills(
    [{ ...card, billingDate: 1 }],
    [
      {
        accountId: card.accountId,
        createdAt: new Date('2026-09-09T10:00:00.000Z'),
        balanceDelta: -754,
      },
    ],
    NOW,
    TIMEZONE,
  );

  assert.equal(bills[card.id]?.generatedAmount, 0);
  assert.equal(bills[card.id]?.remainingAmount, 0);
});

test('treats a bill paid off to a float residue as fully settled', () => {
  // These four spends sum to 24_836.800000000003, while the single repayment of the
  // billed 24_836.80 is exact -- the difference is a float residue, not money owed.
  const spends = [7_858.54, 13_941.05, 2_921.4, 115.81];
  const bills = calculateGeneratedCreditCardBills(
    [card],
    [
      ...spends.map((amount) => ({
        accountId: card.accountId,
        createdAt: new Date('2026-09-10T10:00:00.000Z'),
        balanceDelta: -amount,
      })),
      {
        accountId: card.accountId,
        createdAt: new Date('2026-09-15T10:00:00.000Z'),
        balanceDelta: 24_836.8,
      },
    ],
    NOW,
    TIMEZONE,
  );

  assert.equal(bills[card.id]?.generatedAmount, 24_836.8);
  assert.equal(bills[card.id]?.remainingAmount, 0);
});
