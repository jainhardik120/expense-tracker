import { type IssuerStatement } from '../../types';
import { type PdfLine } from '../extract';
import { readTransactions } from '../table';
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

const DAY_MONTH = /^\d{1,2} [A-Za-z]{3}$/;
const YEAR_SUFFIX = /^'\d{2}$/;
const STARTS_WITH_DATE = /^\d{1,2} [A-Za-z]{3}/;
const VALUE_CELL = /^(₹|Debit$|Credit$)/;

const isHeaderWithoutAmount = (line: PdfLine) =>
  line.cells.some((cell) => cell.text.trim() === 'Date') &&
  line.cells.some((cell) => cell.text.trim() === 'Transaction Details') &&
  !/Amount/i.test(line.text);

const unwrapRows = (lines: PdfLine[]): PdfLine[] => {
  const result: PdfLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const previous = result.at(-1);
    if (isHeaderWithoutAmount(line) && previous?.text.trim() === 'Amount') {
      const amountCellOf = previous.cells[0];
      result[result.length - 1] = {
        ...line,
        text: `${line.text} Amount`,
        cells: [...line.cells, amountCellOf].toSorted((left, right) => left.x - right.x),
      };
      if (lines.at(index + 1)?.text.trim() === '(INR)') {
        index += 1;
      }
      continue;
    }
    const middle = lines.at(index + 1);
    const yearLine = lines.at(index + 2);
    const dateCellOf = line.cells.at(0);
    const yearCell = yearLine?.cells.at(0);
    if (
      dateCellOf !== undefined &&
      DAY_MONTH.test(dateCellOf.text.trim()) &&
      middle !== undefined &&
      !STARTS_WITH_DATE.test(middle.text.trim()) &&
      yearLine !== undefined &&
      yearCell !== undefined &&
      YEAR_SUFFIX.test(yearCell.text.trim())
    ) {
      const pieces = [...line.cells.slice(1), ...middle.cells, ...yearLine.cells.slice(1)];
      const values = pieces.filter((cell) => VALUE_CELL.test(cell.text.trim()));
      const words = pieces.filter((cell) => !VALUE_CELL.test(cell.text.trim()));
      const firstWord = words.at(0);
      const date = `${dateCellOf.text.trim()} ${yearCell.text.trim()}`;
      const cells = [
        { x: dateCellOf.x, text: date },
        ...(firstWord === undefined
          ? []
          : [{ x: firstWord.x, text: words.map((cell) => cell.text.trim()).join(' ') }]),
        ...values,
      ];
      result.push({ ...middle, text: cells.map((cell) => cell.text).join(' '), cells });
      index += 2;
      continue;
    }
    result.push(line);
  }
  return result;
};

export const matchesAxis = (text: string) =>
  /Credit card Monthly Statement/i.test(text) && /Selected Statement Month/i.test(text);

export const parseAxis = (lines: PdfLine[]): IssuerStatement => {
  const dueDate = valueNear(lines, 'Payment Due Date', dateCell, { tolerance: 20 });
  const transactions = readTransactions(unwrapRows(lines), {
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
    accountLast4: maskedCardLast4(lines),
    statementDate: periodEnd,
    periodStart: periodEnd === null ? null : previousCycleStart(periodEnd),
    periodEnd,
    dueDate,
    openingBalance: amount(lines, 'Opening Balance'),
    closingBalance: amount(lines, 'Total Payment Due'),
    minimumDue: amount(lines, 'Minimum Payment Due'),
    creditLimit: amount(lines, 'Credit Limit'),
    declared: null,
    transactions,
  };
};
