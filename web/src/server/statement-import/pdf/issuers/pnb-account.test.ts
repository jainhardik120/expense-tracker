import { expect, test } from 'vitest';

import { matchesPnbAccount, parsePnbAccount } from './pnb-account';

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

const statement = [
  line([36, 'IFSC:'], [139, 'PUNB0000001']),
  line([36, 'Statement of Account:1234567890124321 For Period: 01-01-2025 to 31-12-2025']),
  line(
    [57, 'Date'],
    [101, 'Instrument ID'],
    [165, 'Amount(INR)'],
    [231, 'Type'],
    [284, 'Balance'],
    [433, 'Remarks'],
  ),
  line(
    [43, '29/12/2025'],
    [178, '10000.0'],
    [234, 'DR'],
    [286, '2167.0'],
    [345, 'ATM WDR 2628 PNB'],
  ),
  line([433, 'MEERUT']),
  line(
    [43, '29/12/2025'],
    [178, '15000.0'],
    [234, 'DR'],
    [283, '12167.0'],
    [345, 'ATM WDR 2625 PNB'],
  ),
  line([36, 'Date: 04/11/2026 01:07:38'], [537, 'Page 1']),
  line(
    [43, '04/11/2025'],
    [114, '011092'],
    [175, '25000.0'],
    [235, 'CR'],
    [283, '27167.0'],
    [431, 'TO SELF'],
  ),
  line(
    [43, '03/02/2025'],
    [178, '53466.0'],
    [235, 'CR'],
    [283, '2167.0'],
    [371, 'Closure Proceeds'],
  ),
  line([36, '***Generated through PNB ONE***']),
];

test('recognises a PNB ONE account statement', () => {
  expect(matchesPnbAccount(statement.map((entry) => entry.text).join('\n'))).toBe(true);
});

test('reads a PNB statement oldest first with one-decimal amounts and wrapped remarks', () => {
  const parsed = parsePnbAccount(statement);
  expect(parsed.issuer).toBe('pnb_account');
  expect(parsed.accountLast4).toBe('4321');
  expect(parsed.periodStart).toBe('2025-01-01');
  expect(parsed.periodEnd).toBe('2025-12-31');
  expect(parsed.openingBalance).toBe(-51299);
  expect(parsed.closingBalance).toBe(2167);
  expect(
    parsed.transactions.map((row) => [row.date, row.amount, row.direction, row.description]),
  ).toEqual([
    ['2025-02-03', 53466, 'credit', 'Closure Proceeds'],
    ['2025-11-04', 25000, 'credit', 'TO SELF'],
    ['2025-12-29', 15000, 'debit', 'ATM WDR 2625 PNB'],
    ['2025-12-29', 10000, 'debit', 'ATM WDR 2628 PNBMEERUT'],
  ]);
});
