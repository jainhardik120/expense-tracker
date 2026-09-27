import { parseFloatSafe } from '@/server/helpers/emi-calculations';

export const formatDate = (
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {},
) => {
  if (date === undefined) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
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
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloatSafe(amount));
};

const ORDINAL_TEENS_START = 11;
const ORDINAL_TEENS_END = 13;
const ORDINAL_FIRST = 1;
const ORDINAL_SECOND = 2;
const ORDINAL_THIRD = 3;
const HUNDRED = 100;
const TEN = 10;

/** Renders a day of the month as an ordinal: 1 -> "1st", 12 -> "12th", 23 -> "23rd". */
export const formatOrdinalDay = (day: number) => {
  // 11th, 12th and 13th break the pattern the last digit otherwise follows.
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
