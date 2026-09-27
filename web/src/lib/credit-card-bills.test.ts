import { expect, test } from 'vitest';

import { getCardBillsInRange } from './credit-card-bills';

const NOW = new Date('2026-09-22T07:30:00.000Z');
const TIMEZONE = 'Asia/Kolkata';
// September 2026 in IST.
const RANGE_START = new Date('2026-08-31T18:30:00.000Z');
const RANGE_END = new Date('2026-09-30T18:29:59.999Z');

const card = {
  id: 'card',
  accountId: 'account',
  cardName: 'Test Card',
  billingDate: 12,
  startingBalance: 0,
};

const billsFor = (
  cards: (typeof card)[],
  activities: { accountId: string; createdAt: Date; balanceDelta: number }[],
) => getCardBillsInRange(cards, activities, RANGE_START, RANGE_END, NOW, TIMEZONE);

test('keeps spending after bill generation in the next cycle', () => {
  const [bill] = billsFor(
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
  );

  expect(bill.billedAmount).toBe(1_000);
  expect(bill.remainingAmount).toBe(1_000);
  expect(bill.status).toBe('missed');
});

test('reduces a generated bill by later payments but not by later spending', () => {
  const [bill] = billsFor(
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
  );

  expect(bill.billedAmount).toBe(1_000);
  expect(bill.remainingAmount).toBe(400);
});

test('does not create a due amount from spending that starts after the billing date', () => {
  const bills = billsFor(
    [{ ...card, billingDate: 1 }],
    [
      {
        accountId: card.accountId,
        createdAt: new Date('2026-09-09T10:00:00.000Z'),
        balanceDelta: -754,
      },
    ],
  );

  expect(bills).toStrictEqual([]);
});

test('treats a bill paid off to a float residue as fully settled', () => {
  // These four spends sum to 24_836.800000000003, while the single repayment of the
  // billed 24_836.80 is exact -- the difference is a float residue, not money owed.
  const spends = [7_858.54, 13_941.05, 2_921.4, 115.81];
  const [bill] = billsFor(
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
  );

  expect(bill.billedAmount).toBe(24_836.8);
  expect(bill.remainingAmount).toBe(0);
  expect(bill.status).toBe('paid');
});

test('a bill whose billing day has not arrived is an estimate from current utilisation', () => {
  const [bill] = billsFor(
    [{ ...card, billingDate: 28 }],
    [
      {
        accountId: card.accountId,
        createdAt: new Date('2026-09-20T10:00:00.000Z'),
        balanceDelta: -3_200,
      },
      // After NOW, so not yet reflected in what the card is carrying today.
      {
        accountId: card.accountId,
        createdAt: new Date('2026-09-25T10:00:00.000Z'),
        balanceDelta: -900,
      },
    ],
  );

  expect(bill.status).toBe('upcoming');
  expect(bill.billedAmount).toBe(3_200);
});

test('projects bills no further than next month', () => {
  // NOW is September, so an October bill is still grounded in what the card is
  // carrying today, but a November one would be invented.
  const activity = [
    {
      accountId: card.accountId,
      createdAt: new Date('2026-09-20T10:00:00.000Z'),
      balanceDelta: -5_000,
    },
  ];
  const octoberBills = getCardBillsInRange(
    [card],
    activity,
    new Date('2026-09-30T18:30:00.000Z'),
    new Date('2026-10-31T18:29:59.999Z'),
    NOW,
    TIMEZONE,
  );
  const novemberBills = getCardBillsInRange(
    [card],
    activity,
    new Date('2026-10-31T18:30:00.000Z'),
    new Date('2026-11-30T18:29:59.999Z'),
    NOW,
    TIMEZONE,
  );

  expect(octoberBills.length).toBe(1);
  expect(octoberBills[0].status).toBe('upcoming');
  expect(novemberBills).toStrictEqual([]);
});
