import { expect, test } from 'vitest';

import { parseAxis } from './axis';

import { type PdfLine } from '../extract';

let y = 0;
const line = (...cells: Array<[number, string]>): PdfLine => {
  y += 10;
  return {
    page: 1,
    y,
    text: cells.map(([, text]) => text).join(' '),
    cells: cells.map(([x, text]) => ({ x, text })),
  };
};

test('reads rows whose date wraps around the details in the newer Axis layout', () => {
  const parsed = parseAxis([
    line([426, 'Amount']),
    line([52, 'Date'], [95, 'Transaction Details'], [485, 'Debit/Credit']),
    line([426, '(INR)']),
    line([52, '22 Nov']),
    line([95, 'UPI/Swiggy Ltd/swiggyupi@axb/me@pingpay'], [426, '₹ 754.00'], [485, 'Debit']),
    line([52, "'25"]),
    line([52, '28 Oct'], [95, 'UPI/Cisco BGL 16 Global']),
    line([426, '₹ 88.00'], [485, 'Debit']),
    line([52, "'25"], [95, 'Coun/paytmqr1@pa/me@pingpay']),
    line([52, '27 Oct']),
    line([95, 'MB PAYMENT #ABC'], [426, '₹ 1,000.00'], [485, 'Credit']),
    line([52, "'25"]),
  ]);
  expect(
    parsed.transactions.map((row) => [row.date, row.amount, row.direction, row.description]),
  ).toEqual([
    ['2025-11-22', 754, 'debit', 'UPI/Swiggy Ltd/swiggyupi@axb/me@pingpay'],
    ['2025-10-28', 88, 'debit', 'UPI/Cisco BGL 16 Global Coun/paytmqr1@pa/me@pingpay'],
    ['2025-10-27', 1000, 'credit', 'MB PAYMENT #ABC'],
  ]);
});
