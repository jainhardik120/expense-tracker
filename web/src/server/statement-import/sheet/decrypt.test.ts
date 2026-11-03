import officeCrypto from 'officecrypto-tool';
import { describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';

import { readSheetData } from './decrypt';
import { parseSheetRows, readSheetRows } from './parse';

import { StatementPasswordError } from '../pdf/extract';

const PASSWORD = crypto.randomUUID();

const lockedStatement = () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ['Account Number : 40530546989'],
      ['Statement From : 01-08-2025 to 03-11-2026'],
      ['Date', 'Details', 'Ref No/Cheque No', 'Debit', 'Credit', 'Balance'],
      ['27/11/2025', 'DEP TFR UPI/CR/533197134241/HARDIK J', '', '', '75000.00', '77764.00'],
      ['27/11/2025', 'WDL TFR Debit account for TDR', '000000', '75000.00', '', '2764.00'],
    ]),
    'sheet',
  );
  const plain = Buffer.from(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  return new Uint8Array(officeCrypto.encrypt(plain, { password: PASSWORD }));
};

describe('password protected spreadsheets', () => {
  test('opens with the right password and reads the declared period', async () => {
    const sheet = await readSheetData(lockedStatement(), [undefined, 'wrong', PASSWORD]);
    expect(sheet.password).toBe(PASSWORD);
    const statement = parseSheetRows(readSheetRows(sheet.data));
    expect(statement.accountLast4).toBe('6989');
    expect(statement.periodStart).toBe('2025-08-01');
    expect(statement.periodEnd).toBe('2026-11-03');
    expect(statement.transactions).toHaveLength(2);
  });

  test('asks for a password when none is known', async () => {
    await expect(readSheetData(lockedStatement(), [undefined])).rejects.toEqual(
      new StatementPasswordError(true),
    );
  });

  test('reports a wrong password', async () => {
    const error = await readSheetData(lockedStatement(), ['wrong']).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(StatementPasswordError);
    expect((error as StatementPasswordError).needsPassword).toBe(false);
  });

  test('passes unlocked spreadsheets straight through', async () => {
    const plain = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    await expect(readSheetData(plain, [])).resolves.toEqual({ data: plain, password: undefined });
  });
});
