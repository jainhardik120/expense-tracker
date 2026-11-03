const wholeRupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const SHORT_NAME_NOISE = [
  / - Direct Plan/gi,
  / Direct Plan/gi,
  / - Growth Option/gi,
  / - Growth/gi,
  / Growth Option/gi,
  / Direct/gi,
  / Growth/gi,
  /\(erstwhile[^)]*\)/gi,
];

const ASSET_TYPE_LABELS: Record<string, string> = {
  EQUITY: 'Equity',
  DEBT: 'Debt',
  CASH: 'Cash & equivalents',
  GLOBAL_MF: 'Overseas funds',
  REALEST: 'REITs',
  COMMODITY: 'Commodities',
};

export const rupees = (value: number) => wholeRupees.format(value);

export const percent = (value: number, decimals = 1) => `${value.toFixed(decimals)}%`;

export const shortFundName = (name: string) =>
  SHORT_NAME_NOISE.reduce((text, pattern) => text.replace(pattern, ''), name)
    .replaceAll(/\s+/g, ' ')
    .replace(/ -$/, '')
    .trim();

export const assetTypeLabel = (value: string) =>
  ASSET_TYPE_LABELS[value] ??
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replaceAll('_', ' ');
