import { type IssuerStatement } from '../../types';
import { type PdfCell, type PdfLine } from '../extract';
import { readTransactions } from '../table';
import { dateCell, declaredTotals, parseAmount, parseDate, sum, valueNear } from '../values';

const RUPEE_GLYPH = /^r(?=[\d-])/;
const WHOLE_RUPEES = /^[\d,]+$/;
const CARD = /(?:XXXX\s?|XX)(\d{4})\b/;
const SUMMARY_COLUMN_END = 300;

const rupees = (cell: PdfCell) => {
  const text = cell.text.trim().replace(RUPEE_GLYPH, '');
  const parsed = parseAmount(text);
  if (parsed !== null) {
    return parsed;
  }
  return WHOLE_RUPEES.test(text) ? { value: Number(text.replaceAll(',', '')), marker: null } : null;
};

const signed = (value: { value: number; marker: 'cr' | 'dr' | null } | null) => {
  if (value === null) {
    return null;
  }
  return value.marker === 'cr' ? -value.value : value.value;
};

const headline = (lines: PdfLine[], label: string) =>
  valueNear(lines, label, rupees, { tolerance: 20 });

const summary = (lines: PdfLine[], label: string) => {
  for (const line of lines) {
    const index = line.cells.findIndex(
      (cell) => cell.x < SUMMARY_COLUMN_END && cell.text === label,
    );
    if (index < 0) {
      continue;
    }
    for (const cell of line.cells.slice(index + 1)) {
      if (cell.x >= SUMMARY_COLUMN_END) {
        break;
      }
      const value = rupees(cell);
      if (value !== null) {
        return value;
      }
    }
  }
  return null;
};

const cardLast4 = (lines: PdfLine[]) => {
  for (const line of lines) {
    const match = CARD.exec(line.text);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return null;
};

export const matchesIdfc = (text: string) =>
  /IDFC FIRST/i.test(text) && /Credit Card Statement/i.test(text);

export const parseIdfc = (lines: PdfLine[]): IssuerStatement => {
  const period = valueNear(
    lines,
    'Statement Period',
    (cell) => (cell.text.includes(' - ') ? cell.text : null),
    { tolerance: 20 },
  );
  const range = period?.split(' - ').map((part) => part.trim()) ?? [];
  return {
    kind: 'credit_card',
    issuer: 'idfc',
    accountLast4: cardLast4(lines),
    statementDate: valueNear(lines, 'Statement Date', dateCell, { tolerance: 20 }),
    periodStart: parseDate(range.at(0) ?? ''),
    periodEnd: parseDate(range.at(1) ?? ''),
    dueDate: valueNear(lines, 'Payment Due Date', dateCell, { tolerance: 20 }),
    openingBalance: signed(summary(lines, 'Opening Balance')),
    closingBalance: signed(headline(lines, 'Total Amount Due')),
    minimumDue: headline(lines, 'Minimum Amount Due')?.value ?? null,
    creditLimit: headline(lines, 'Credit Limit')?.value ?? null,
    declared: declaredTotals(
      sum(
        summary(lines, 'Purchases')?.value ?? null,
        summary(lines, 'EMI & Other Debits')?.value ?? null,
      ),
      summary(lines, 'Payments & Refunds')?.value ?? null,
    ),
    transactions: readTransactions(lines, {
      headers: { date: 'Transaction', description: 'Transaction Details', amount: 'Amount' },
      minHeaderCells: 3,
      creditWhen: (marker) => marker === 'cr',
    }),
  };
};
