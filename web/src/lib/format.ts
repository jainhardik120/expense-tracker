import { parseFloatSafe } from '@/server/helpers/emi-calculations';

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

export const cachedDateFormat = (
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat => {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = dateFormats.get(key);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, formatter);
  }
  return formatter;
};

export const formatDate = (
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {},
) => {
  if (date === undefined) {
    return '';
  }

  try {
    return cachedDateFormat('en-US', {
      month: opts.month ?? 'long',
      day: opts.day ?? 'numeric',
      year: opts.year ?? 'numeric',
      ...opts,
    }).format(new Date(date));
  } catch {
    return '';
  }
};

export const formatCurrency = (
  amount: number | string,
  currency: string = 'INR',
  locale: string = 'en-IN',
) => {
  const key = `${locale}|${currency}`;
  let formatter = numberFormats.get(key);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    numberFormats.set(key, formatter);
  }
  return formatter.format(parseFloatSafe(amount));
};

const ORDINAL_TEENS_START = 11;
const ORDINAL_TEENS_END = 13;
const ORDINAL_FIRST = 1;
const ORDINAL_SECOND = 2;
const ORDINAL_THIRD = 3;
const HUNDRED = 100;
const TEN = 10;

export const formatOrdinalDay = (day: number) => {
  const lastTwoDigits = day % HUNDRED;
  if (lastTwoDigits >= ORDINAL_TEENS_START && lastTwoDigits <= ORDINAL_TEENS_END) {
    return `${day}th`;
  }
  switch (day % TEN) {
    case ORDINAL_FIRST:
      return `${day}st`;
    case ORDINAL_SECOND:
      return `${day}nd`;
    case ORDINAL_THIRD:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
};
