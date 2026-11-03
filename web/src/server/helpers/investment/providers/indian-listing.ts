import type { Exchange } from '@/server/helpers/groww/client';

export const BSE_SUFFIX = '.BO';
export const NSE_SUFFIX = '.NS';

export const parseIndianListing = (code: string): { exchange: Exchange; symbol: string } => {
  const normalized = code.trim().toUpperCase();
  if (normalized.endsWith(BSE_SUFFIX)) {
    return { exchange: 'BSE', symbol: normalized.slice(0, -BSE_SUFFIX.length) };
  }
  return {
    exchange: 'NSE',
    symbol: normalized.endsWith(NSE_SUFFIX) ? normalized.slice(0, -NSE_SUFFIX.length) : normalized,
  };
};
