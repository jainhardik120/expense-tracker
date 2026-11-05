const wholeRupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

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

export const assetTypeLabel = (value: string) =>
  ASSET_TYPE_LABELS[value] ??
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replaceAll('_', ' ');
