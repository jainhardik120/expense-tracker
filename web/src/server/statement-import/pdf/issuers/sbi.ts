import { type PdfLine } from '../extract';
import { readTransactions } from '../table';
import { type IssuerStatement } from '../types';
import { amountCell, dateCell, declaredTotals, sum, textAfterLabel, valueNear } from '../values';

const SUMMARY_LINES = 6;
const DESCRIPTION_OFFSET = 36;

const amount = (lines: PdfLine[], label: string) =>
  valueNear(lines, label, amountCell, { maxLines: SUMMARY_LINES, tolerance: 25 })?.value ?? null;

const signed = (lines: PdfLine[], label: string) => {
  const value = valueNear(lines, label, amountCell, { maxLines: SUMMARY_LINES, tolerance: 25 });
  if (value === null) {
    return null;
  }
  return value.marker === 'cr' ? -value.value : value.value;
};

const periodPart = (text: string | null, index: number) => {
  const part = text?.replace(/\s+/g, ' ').split(/ to /i).at(index);
  return part === undefined ? null : dateCell({ x: 0, text: part });
};

export const matchesSbi = (text: string) =>
  /SBI Card/i.test(text) && /Credit Card Number/i.test(text);

export const parseSbi = (lines: PdfLine[]): IssuerStatement => {
  const period = textAfterLabel(lines, 'for Statement Period');
  return {
    kind: 'credit_card',
    issuer: 'sbi',
    cardLast4: null,
    statementDate: valueNear(lines, 'Statement Date', dateCell, { tolerance: 25 }),
    periodStart: periodPart(period, 0),
    periodEnd: periodPart(period, 1),
    dueDate: valueNear(lines, 'Payment Due Date', dateCell, { tolerance: 25 }),
    previousBalance: signed(lines, 'Previous Balance'),
    totalDue: amount(lines, '*Total Amount Due'),
    minimumDue: valueNear(lines, '**Minimum Amount Due', amountCell)?.value ?? null,
    creditLimit: valueNear(lines, 'Credit Limit', amountCell)?.value ?? null,
    declared: declaredTotals(
      sum(amount(lines, 'Purchases & Other'), amount(lines, 'Fee, Taxes &')),
      amount(lines, 'Payments,'),
    ),
    transactions: readTransactions(lines, {
      headers: { date: 'Date', description: 'Transaction Details', amount: 'Amount' },
      minHeaderCells: 3,
      columnSlack: 16,
      descriptionOffset: DESCRIPTION_OFFSET,
      undatedRowsInheritDate: true,
      ignoreLines: [/^for Statement Period/i, /^TRANSACTIONS FOR /i],
      emiInstallmentMarker: 'm',
      emiConversion: /^TRANSFER TO MERCHANT EMI/i,
      creditWhen: (marker) => marker === 'cr',
    }),
  };
};
