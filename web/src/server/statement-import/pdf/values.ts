import { type PdfCell, type PdfLine } from './extract';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const NUMERIC_DATE = /^(\d{2})[/-](\d{2})[/-](\d{4})/;
const LONG_DATE = /^([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/;
const AMOUNT_BODY = /^-?[\d,]+\.\d{2}$/;
const CURRENCY_PREFIXES = ['rs.', 'rs', 'inr', '`', '₹'];
const MONTH_PREFIX = 3;
const PAISE = 100;

const pad = (value: number) => String(value).padStart(2, '0');

export const parseDate = (text: string): string | null => {
  const trimmed = text.trim();
  const numeric = NUMERIC_DATE.exec(trimmed);
  if (numeric !== null) {
    return `${numeric[3]}-${numeric[2]}-${numeric[1]}`;
  }
  const long = LONG_DATE.exec(trimmed);
  if (long !== null) {
    const month = MONTHS.indexOf(long[1].slice(0, MONTH_PREFIX).toLowerCase());
    return month < 0 ? null : `${long[3]}-${pad(month + 1)}-${pad(Number(long[2]))}`;
  }
  return null;
};

export const leadingDate = (text: string) => {
  const match = NUMERIC_DATE.exec(text.trim());
  return match === null
    ? null
    : { date: parseDate(match[0]) ?? '', rest: text.trim().slice(match[0].length).trim() };
};

export const parseAmount = (text: string): { value: number; marker: 'cr' | 'dr' | null } | null => {
  let body = text.trim().toLowerCase();
  const prefix = CURRENCY_PREFIXES.find((candidate) => body.startsWith(candidate));
  if (prefix !== undefined) {
    body = body.slice(prefix.length).trim();
  }
  let marker: 'cr' | 'dr' | null = null;
  if (body.endsWith('cr') || body.endsWith('dr')) {
    marker = body.endsWith('cr') ? 'cr' : 'dr';
    body = body.slice(0, -marker.length).trim();
  }
  if (!AMOUNT_BODY.test(body)) {
    return null;
  }
  return { value: Number(body.replaceAll(',', '')), marker };
};

export const splitDateRange = (text: string | null) => {
  const parts = text?.replace(/\s+/g, ' ').split(/ to /i) ?? [];
  const start = parts.at(0);
  const end = parts.at(1);
  return {
    start: start === undefined ? null : parseDate(start),
    end: end === undefined ? null : parseDate(end),
  };
};

export const textAfterLabel = (lines: PdfLine[], label: string) => {
  const wanted = label.toLowerCase();
  for (const line of lines) {
    const index = line.text.toLowerCase().indexOf(wanted);
    if (index >= 0) {
      return line.text
        .slice(index + label.length)
        .replace(/^[\s:]+/, '')
        .trim();
    }
  }
  return null;
};

export const maskedCardLast4 = (lines: PdfLine[]) => {
  for (const line of lines) {
    const match = /\d{4}X{8}(\d{4})/.exec(line.text);
    const last4 = match?.at(1);
    if (last4 !== undefined) {
      return last4;
    }
  }
  return null;
};

export const roundMoney = (value: number) => Math.round(value * PAISE) / PAISE;

const normalise = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

const findCell = (lines: PdfLine[], label: string, from = 0) => {
  const wanted = normalise(label);
  for (let index = from; index < lines.length; index += 1) {
    const cell = lines[index].cells.find((candidate) =>
      normalise(candidate.text).startsWith(wanted),
    );
    if (cell !== undefined) {
      return { index, cell };
    }
  }
  return null;
};

export const valueNear = <T>(
  lines: PdfLine[],
  label: string,
  parse: (cell: PdfCell) => T | null,
  { maxLines = 4, tolerance = 40 }: { maxLines?: number; tolerance?: number } = {},
): T | null => {
  const found = findCell(lines, label);
  if (found === null) {
    return null;
  }
  const { index, cell } = found;
  for (let offset = 1; offset <= maxLines && index + offset < lines.length; offset += 1) {
    const line = lines[index + offset];
    if (line.page !== lines[index].page) {
      break;
    }
    for (const candidate of line.cells) {
      if (Math.abs(candidate.x - cell.x) <= tolerance) {
        const value = parse(candidate);
        if (value !== null) {
          return value;
        }
      }
    }
  }
  return null;
};

export const amountCell = (cell: PdfCell) => parseAmount(cell.text);
export const dateCell = (cell: PdfCell) => parseDate(cell.text);

export const sum = (...values: Array<number | null>) =>
  values.some((value) => value === null)
    ? null
    : roundMoney(values.reduce<number>((total, value) => total + (value ?? 0), 0));

export const declaredTotals = (debits: number | null, credits: number | null) =>
  debits === null || credits === null ? null : { debits, credits };
