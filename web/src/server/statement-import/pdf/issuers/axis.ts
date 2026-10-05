import { type PdfLine } from '../extract';
import { readTransactions } from '../table';
import { type IssuerStatement } from '../types';
import { amountCell, dateCell, maskedCardLast4, valueNear } from '../values';

const DAY_MS = 86_400_000;
const DAYS_TO_DUE = 20;
const ISO_DATE_LENGTH = 10;
const CONTINUATION_DISTANCE = 18;

const shiftDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, ISO_DATE_LENGTH);

const previousCycleStart = (end: string) => {
  const date = new Date(`${end}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return shiftDays(date.toISOString().slice(0, ISO_DATE_LENGTH), 1);
};

const amount = (lines: PdfLine[], label: string) =>
  valueNear(lines, label, amountCell, { tolerance: 20 })?.value ?? null;

export const matchesAxis = (text: string) =>
  /Credit card Monthly Statement/i.test(text) && /Selected Statement Month/i.test(text);

export const parseAxis = (lines: PdfLine[]): IssuerStatement => {
  const dueDate = valueNear(lines, 'Payment Due Date', dateCell, { tolerance: 20 });
  const transactions = readTransactions(lines, {
    headers: { date: 'Date', description: 'Transaction Details', amount: 'Amount' },
    minHeaderCells: 4,
    continuationDistance: CONTINUATION_DISTANCE,
    ignoreLines: [/End of Transaction Summary/i, /View Active Loans/i, /^Page \d+ of \d+/i],
    emiConversion: /^Transaction conversion into EMI/i,
    creditWhen: (marker) => marker === 'cr',
  });
  const latestRow = transactions.reduce<string | null>(
    (latest, row) => (latest === null || row.date > latest ? row.date : latest),
    null,
  );
  const cycleEnd = dueDate === null ? latestRow : shiftDays(dueDate, -DAYS_TO_DUE);
  const periodEnd =
    cycleEnd !== null && latestRow !== null && latestRow > cycleEnd ? latestRow : cycleEnd;
  return {
    kind: 'credit_card',
    issuer: 'axis',
    cardLast4: maskedCardLast4(lines),
    statementDate: periodEnd,
    periodStart: periodEnd === null ? null : previousCycleStart(periodEnd),
    periodEnd,
    dueDate,
    previousBalance: amount(lines, 'Opening Balance'),
    totalDue: amount(lines, 'Total Payment Due'),
    minimumDue: amount(lines, 'Minimum Payment Due'),
    creditLimit: amount(lines, 'Credit Limit'),
    declared: null,
    transactions,
  };
};
