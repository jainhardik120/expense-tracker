const CRORE_SUFFIX = /cr$/i;

export const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseCroreValue = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const digits = value.replaceAll(/[₹,\s]/g, '').replace(CRORE_SUFFIX, '');
  return toNumber(digits);
};
