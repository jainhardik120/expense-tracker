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
