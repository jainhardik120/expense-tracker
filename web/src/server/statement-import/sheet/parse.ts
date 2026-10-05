import * as XLSX from 'xlsx';

import { roundMoney } from '../pdf/values';
import { type IssuerStatement, type ParsedTransaction } from '../types';

type Cell = string | number | Date;

type Columns = {
  date: number;
  description: number;
  debit: number | null;
  credit: number | null;
  amount: number | null;
  direction: number | null;
  balance: number | null;
};

const HEADER_SCAN_ROWS = 60;
const ACCOUNT_NUMBER = /account\s*(?:number|no\.?)\D{0,10}([\dx*]{6,})/i;
const PERIOD = /from\s+(\S+)\s+to\s+(\S+)/i;
const LAST_DIGITS = 4;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const CENTURY = 2000;
const TWO_DIGITS = 2;
const PAISE = 100;
const DEBIT_SUFFIX = /dr\.?$/;
const CREDIT_SUFFIX = /cr\.?$/;
const PLAIN_NUMBER = /^-?\d+(?:\.\d+|)$/;

const HEADERS = {
  date: /^(?:txn|tran|transaction|posting|value|trans|txn\.|tran\.|trans\.)?\s*date$/i,
  valueDate: /value/i,
  description: /narration|description|particular|details|remarks/i,
  direction: /^(?:dr\s*\/\s*cr|cr\s*\/\s*dr|debit\s*\/\s*credit|type|txn type)$/i,
  debit: /(?:^(?:withdrawals?|debits?|dr)\b)|withdrawal amt|debit amount|paid out/i,
  credit: /(?:^(?:deposits?|credits?|cr)\b)|deposit amt|credit amount|paid in/i,
  amount: /^(?:amount|transaction\s*amount|txn\s*amount)/i,
  balance: /balance|^bal\b/i,
};

export class SheetLayoutError extends Error {
  constructor() {
    super('Could not find a date, description and amount header in this spreadsheet');
  }
}

const dateCodeOf = (serial: number) => {
  const formatter = XLSX.SSF as { parse_date_code: (value: number) => unknown };
  const parsed = formatter.parse_date_code(serial);
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'y' in parsed &&
    'm' in parsed &&
    'd' in parsed &&
    typeof parsed.y === 'number' &&
    typeof parsed.m === 'number' &&
    typeof parsed.d === 'number'
  ) {
    return { y: parsed.y, m: parsed.m, d: parsed.d };
  }
  return null;
};

const pad = (value: number) => String(value).padStart(TWO_DIGITS, '0');

const isoOf = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
    ? `${String(year)}-${pad(month)}-${pad(day)}`
    : null;
};

const fullYear = (text: string) =>
  text.length === TWO_DIGITS ? CENTURY + Number(text) : Number(text);

export const parseSheetDate = (cell: Cell | undefined): string | null => {
  if (cell === undefined || cell === '') {
    return null;
  }
  if (cell instanceof Date) {
    return isoOf(cell.getFullYear(), cell.getMonth() + 1, cell.getDate());
  }
  if (typeof cell === 'number') {
    const parsed = dateCodeOf(cell);
    return parsed === null ? null : isoOf(parsed.y, parsed.m, parsed.d);
  }
  const text = cell.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso !== null) {
    return isoOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(text);
  if (numeric !== null) {
    return isoOf(fullYear(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  }
  const named = /^(\d{1,2})[\s/-]+([A-Za-z]{3})[A-Za-z]*[\s,/-]+'?(\d{4}|\d{2})\b/.exec(text);
  if (named !== null) {
    const month = MONTHS.indexOf(named[2].toLowerCase());
    return month < 0 ? null : isoOf(fullYear(named[3]), month + 1, Number(named[1]));
  }
  return null;
};

export const parseSheetAmount = (cell: Cell | undefined): number | null => {
  if (cell === undefined || cell === '' || cell instanceof Date) {
    return null;
  }
  if (typeof cell === 'number') {
    return Number.isFinite(cell) ? cell : null;
  }
  let text = cell
    .trim()
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/^(?:rs\.?|inr|₹)\s*/, '');
  let sign = 1;
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1);
  }
  if (DEBIT_SUFFIX.test(text)) {
    sign = -1;
    text = text.replace(DEBIT_SUFFIX, '').trimEnd();
  } else if (CREDIT_SUFFIX.test(text)) {
    text = text.replace(CREDIT_SUFFIX, '').trimEnd();
  }
  if (!PLAIN_NUMBER.test(text)) {
    return null;
  }
  return sign * Number(text);
};

const findIndex = (labels: string[], pattern: RegExp, taken: Set<number>) => {
  const index = labels.findIndex((label, position) => !taken.has(position) && pattern.test(label));
  if (index < 0) {
    return null;
  }
  taken.add(index);
  return index;
};

const headerColumns = (row: Cell[]): Columns | null => {
  const labels = row.map((cell) => (typeof cell === 'string' ? cell.trim() : ''));
  const taken = new Set<number>();
  const dates = labels
    .map((label, position) => ({ label, position }))
    .filter((entry) => HEADERS.date.test(entry.label));
  const date = (dates.find((entry) => !HEADERS.valueDate.test(entry.label)) ?? dates.at(0))
    ?.position;
  if (date === undefined) {
    return null;
  }
  taken.add(date);
  for (const entry of dates) {
    taken.add(entry.position);
  }
  const description = findIndex(labels, HEADERS.description, taken);
  const direction = findIndex(labels, HEADERS.direction, taken);
  const debit = findIndex(labels, HEADERS.debit, taken);
  const credit = findIndex(labels, HEADERS.credit, taken);
  const amount = findIndex(labels, HEADERS.amount, taken);
  const balance = findIndex(labels, HEADERS.balance, taken);
  if (description === null || (debit === null && credit === null && amount === null)) {
    return null;
  }
  return { date, description, debit, credit, amount, direction, balance };
};

const directionOf = (row: Cell[], columns: Columns): ParsedTransaction | null => {
  const debit = columns.debit === null ? null : parseSheetAmount(row[columns.debit]);
  const credit = columns.credit === null ? null : parseSheetAmount(row[columns.credit]);
  const build = (amount: number, direction: 'debit' | 'credit'): ParsedTransaction => ({
    date: '',
    description: '',
    category: null,
    amount: roundMoney(Math.abs(amount)),
    direction,
    emi: null,
  });
  if (debit !== null && debit !== 0) {
    return build(debit, 'debit');
  }
  if (credit !== null && credit !== 0) {
    return build(credit, 'credit');
  }
  const amount = columns.amount === null ? null : parseSheetAmount(row[columns.amount]);
  if (amount === null || amount === 0) {
    return null;
  }
  const marker =
    columns.direction === null
      ? ''
      : String(row[columns.direction] ?? '')
          .trim()
          .toLowerCase();
  if (marker.startsWith('d')) {
    return build(amount, 'debit');
  }
  if (marker.startsWith('c')) {
    return build(amount, 'credit');
  }
  return build(amount, amount < 0 ? 'debit' : 'credit');
};

export const readSheetRows = (data: Uint8Array): Cell[][] => {
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const sheets = workbook.SheetNames.filter((name) => Object.hasOwn(workbook.Sheets, name)).map(
    (name) => workbook.Sheets[name],
  );
  const tables = sheets.map((sheet) =>
    XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: '' }),
  );
  return tables.reduce<Cell[][]>((best, rows) => (rows.length > best.length ? rows : best), []);
};

export const parseSheetRows = (rows: Cell[][]): IssuerStatement => {
  let columns: Columns | null = null;
  let start = 0;
  for (const [position, row] of rows.slice(0, HEADER_SCAN_ROWS).entries()) {
    columns = headerColumns(row);
    if (columns !== null) {
      start = position + 1;
      break;
    }
  }
  if (columns === null) {
    throw new SheetLayoutError();
  }

  const parsed: Array<ParsedTransaction & { balance: number | null }> = [];
  for (const row of rows.slice(start)) {
    const date = parseSheetDate(row[columns.date]);
    const description = String(row[columns.description] ?? '').trim();
    if (date === null) {
      const previous = parsed.at(-1);
      if (previous !== undefined && description !== '' && directionOf(row, columns) === null) {
        previous.description = `${previous.description} ${description}`.trim();
      }
      continue;
    }
    const movement = directionOf(row, columns);
    if (movement === null) {
      continue;
    }
    parsed.push({
      ...movement,
      date,
      description,
      balance: columns.balance === null ? null : parseSheetAmount(row[columns.balance]),
    });
  }

  const first = parsed.at(0);
  const last = parsed.at(-1);
  const chronological =
    first !== undefined && last !== undefined && first.date > last.date
      ? parsed.toReversed()
      : parsed;
  const opener = chronological.at(0);
  const closer = chronological.at(-1);
  const signed = (row: ParsedTransaction) =>
    row.direction === 'credit' ? row.amount : -row.amount;
  const openingBalance =
    opener?.balance === null || opener?.balance === undefined
      ? null
      : Math.round((opener.balance - signed(opener)) * PAISE) / PAISE;
  const closingBalance = closer?.balance ?? null;
  const dates = chronological
    .map((row) => row.date)
    .toSorted((left, right) => left.localeCompare(right));
  const preamble = rows
    .slice(0, start)
    .map((row) =>
      row
        .filter((cell) => cell !== '')
        .map(String)
        .join(' '),
    )
    .join('\n');
  const accountNumber = ACCOUNT_NUMBER.exec(preamble)?.[1];
  const declaredPeriod = PERIOD.exec(preamble);
  const periodStart = parseSheetDate(declaredPeriod?.[1]) ?? dates.at(0) ?? null;
  const periodEnd = parseSheetDate(declaredPeriod?.[2]) ?? dates.at(-1) ?? null;

  return {
    kind: 'bank_account',
    issuer: 'sheet',
    accountLast4:
      accountNumber === undefined || !/\d{4}$/.test(accountNumber)
        ? null
        : accountNumber.slice(-LAST_DIGITS),
    statementDate: periodEnd,
    periodStart,
    periodEnd,
    dueDate: null,
    openingBalance,
    closingBalance,
    minimumDue: null,
    creditLimit: null,
    declared: null,
    transactions: chronological.map(({ balance: _balance, ...row }) => row),
  };
};
