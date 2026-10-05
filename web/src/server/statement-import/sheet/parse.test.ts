import { describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';

import { parseSheetAmount, parseSheetDate, parseSheetRows, readSheetRows } from './parse';

import { finalizeStatement } from '../finalize';

const workbookBytes = (rows: Array<Array<string | number>>, bookType: XLSX.BookType) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Statement');
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType }) as ArrayBuffer);
};

describe('sheet values', () => {
  test('reads Indian dates and amounts', () => {
    expect(parseSheetDate('08/10/2025')).toBe('2025-10-08');
    expect(parseSheetDate('05-Mar-2026')).toBe('2026-03-05');
    expect(parseSheetDate("11 Jun '26")).toBe('2026-06-11');
    expect(parseSheetDate('2026-02-30')).toBeNull();
    expect(parseSheetAmount('1,26,229.00')).toBe(126_229);
    expect(parseSheetAmount('250.00 Dr')).toBe(-250);
    expect(parseSheetAmount('(12.50)')).toBe(-12.5);
    expect(parseSheetAmount('NA')).toBeNull();
  });
});

describe('bank statement spreadsheets', () => {
  test('finds the table under a preamble and reads the account and period', () => {
    const bytes = workbookBytes(
      [
        ['', 'DETAILED STATEMENT'],
        ['', 'Account Number', '', '123456780991 ( INR ) - TEST USER'],
        ['', 'Transaction Date from', '', '06/10/2025', 'to', '05/10/2026'],
        [],
        [
          '',
          'S No.',
          'Value Date',
          'Transaction Date',
          'Cheque Number',
          'Transaction Remarks',
          'Withdrawal Amount(INR)',
          'Deposit Amount(INR)',
          'Balance(INR)',
        ],
        ['', '1', '08/10/2025', '08/10/2025', '', 'UPI/BLINKIT', '216.00', '0.00', '784.00'],
        ['', '2', '09/10/2025', '09/10/2025', '', 'SALARY', '0.00', '5000.00', '5784.00'],
        ['', '3', '10/10/2025', '10/10/2025', '', 'ATM', '1000.00', '0.00', '4784.00'],
        [],
        ['', 'Legends'],
      ],
      'xls',
    );
    const statement = finalizeStatement(parseSheetRows(readSheetRows(bytes)));
    expect(statement.accountLast4).toBe('0991');
    expect(statement.periodStart).toBe('2025-10-06');
    expect(statement.periodEnd).toBe('2026-10-05');
    expect(statement.openingBalance).toBe(1000);
    expect(statement.closingBalance).toBe(4784);
    expect(statement.transactions.map((row) => [row.amount, row.direction])).toEqual([
      [216, 'debit'],
      [5000, 'credit'],
      [1000, 'debit'],
    ]);
    expect(statement.balanceCheck?.difference).toBe(0);
  });

  test('handles an amount with a Dr/Cr column, newest first', () => {
    const bytes = workbookBytes(
      [
        ['Txn Date', 'Narration', 'Amount', 'Dr/Cr', 'Balance'],
        ['05-Mar-2026', 'CARD PAYMENT', '300.00', 'DR', '700.00'],
        ['04-Mar-2026', 'REFUND', '100.00', 'CR', '1000.00'],
      ],
      'csv',
    );
    const statement = finalizeStatement(parseSheetRows(readSheetRows(bytes)));
    expect(statement.transactions.map((row) => [row.date, row.direction, row.amount])).toEqual([
      ['2026-03-04', 'credit', 100],
      ['2026-03-05', 'debit', 300],
    ]);
    expect(statement.openingBalance).toBe(900);
    expect(statement.closingBalance).toBe(700);
    expect(statement.balanceCheck?.difference).toBe(0);
  });
});
