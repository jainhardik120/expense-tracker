import { type IssuerStatement, type ParsedTransaction } from '../../types';
import { type PdfLine } from '../extract';
import { parseDate, roundMoney } from '../values';

const ROW_DATE = /^\d{2}\/\d{2}\/\d{4}$/;
const HEADER = /Statement of Account:\s*(\d+)\s*For Period:\s*(\S+)\s+to\s+(\S+)/i;
const TABLE_END = /Generated through PNB ONE/i;
const PAGE_FOOTER = /^Date:\s*\d{2}\/\d{2}\/\d{4}/;
const LAST_DIGITS = 4;
const REMARKS_START = 300;
const DIGITS = /^[\d.]+$/;

const parseNumber = (text: string | undefined) => {
  const cleaned = text?.trim().replaceAll(',', '') ?? '';
  const value = Number(cleaned);
  return DIGITS.test(cleaned) && Number.isFinite(value) ? value : null;
};

type Row = { date: string; amount: number; credit: boolean; balance: number; remarks: string };

const readRow = (line: PdfLine): Row | null => {
  const first = line.cells.at(0);
  const rest = line.cells.slice(1);
  if (first === undefined || !ROW_DATE.test(first.text.trim())) {
    return null;
  }
  const typeIndex = rest.findIndex((cell) => /^(CR|DR)$/i.test(cell.text.trim()));
  if (typeIndex < 1) {
    return null;
  }
  const amount = parseNumber(rest[typeIndex - 1].text);
  const balance = parseNumber(rest[typeIndex + 1]?.text);
  const date = parseDate(first.text);
  if (amount === null || balance === null || date === null) {
    return null;
  }
  return {
    date,
    amount,
    credit: rest[typeIndex].text.trim().toUpperCase() === 'CR',
    balance,
    remarks: rest
      .slice(typeIndex + 2)
      .map((cell) => cell.text)
      .join(' '),
  };
};

export const matchesPnbAccount = (text: string) => /IFSC:\s*PUNB/i.test(text) && HEADER.test(text);

export const parsePnbAccount = (lines: PdfLine[]): IssuerStatement => {
  const header = HEADER.exec(lines.map((line) => line.text).join('\n'));
  const rows: Row[] = [];
  let inTable = false;
  for (const line of lines) {
    if (TABLE_END.test(line.text)) {
      break;
    }
    if (HEADER.test(line.text)) {
      inTable = true;
      continue;
    }
    if (!inTable || PAGE_FOOTER.test(line.text.trim())) {
      continue;
    }
    const row = readRow(line);
    if (row !== null) {
      rows.push(row);
      continue;
    }
    const previous = rows.at(-1);
    if (previous !== undefined && (line.cells[0]?.x ?? 0) >= REMARKS_START) {
      previous.remarks = `${previous.remarks}${line.text.trim()}`;
    }
  }

  const oldestFirst = rows.toReversed();
  const oldest = oldestFirst.at(0);
  let openingBalance: number | null = null;
  if (oldest !== undefined) {
    const change = oldest.credit ? oldest.amount : -oldest.amount;
    openingBalance = roundMoney(oldest.balance - change);
  }
  const transactions: ParsedTransaction[] = oldestFirst.map((row) => ({
    date: row.date,
    description: row.remarks.replace(/\s+/g, ' ').trim(),
    category: null,
    amount: roundMoney(row.amount),
    direction: row.credit ? 'credit' : 'debit',
    emi: null,
  }));

  return {
    kind: 'bank_account',
    issuer: 'pnb_account',
    accountLast4: header?.[1]?.slice(-LAST_DIGITS) ?? null,
    statementDate: header?.[3] === undefined ? null : parseDate(header[3]),
    periodStart: header?.[2] === undefined ? null : parseDate(header[2]),
    periodEnd: header?.[3] === undefined ? null : parseDate(header[3]),
    dueDate: null,
    openingBalance,
    closingBalance: rows.at(0)?.balance ?? null,
    minimumDue: null,
    creditLimit: null,
    declared: null,
    transactions,
  };
};
