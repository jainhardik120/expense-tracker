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
  amount: number,
  currency: string = 'INR',
  locale: string = 'en-IN',
) => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};
