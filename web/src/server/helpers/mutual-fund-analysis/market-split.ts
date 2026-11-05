import { type MarketBucket } from '@/lib/investments';

import { capBucketFor, type CapBucket } from './analysis';

import type { StoredFund, StoredStock } from './store';

const PERCENT = 100;
const ROUNDING_TOLERANCE = 0.01;
const EQUITY = 'EQUITY';
const OTHER = 'Other';
export const INTERNATIONAL = 'International';
const ASSET_TYPE_BUCKETS: Record<string, MarketBucket> = {
  DEBT: 'Debt',
  CASH: 'Cash',
  REALEST: 'Real estate',
  GLOBAL_MF: INTERNATIONAL,
};

export type MarketSplitPart = { bucket: MarketBucket; share: number };

export type MarketSplit = { instrumentKey: string; parts: MarketSplitPart[] };

const capToBucket = (cap: CapBucket): MarketBucket =>
  cap === 'Unknown size' || cap === 'Not equity' ? OTHER : cap;

const holdingBucket = (
  holding: StoredFund['holdings'][number],
  stocks: Map<string, StoredStock>,
) => {
  if (holding.assetType !== EQUITY) {
    return ASSET_TYPE_BUCKETS[holding.assetType ?? ''] ?? OTHER;
  }
  const stock = holding.stockRef === null ? undefined : stocks.get(holding.stockRef);
  return capToBucket(capBucketFor(EQUITY, stock?.marketCapCrore ?? null, holding.instrument));
};

export const splitFund = (
  fund: StoredFund | undefined,
  stocks: Map<string, StoredStock>,
): MarketSplitPart[] => {
  const weights = new Map<MarketBucket, number>();
  for (const holding of fund?.holdings ?? []) {
    const bucket = holdingBucket(holding, stocks);
    weights.set(bucket, (weights.get(bucket) ?? 0) + holding.weightPercent);
  }
  const listed = [...weights.values()].reduce((total, weight) => total + weight, 0);
  if (PERCENT - listed > ROUNDING_TOLERANCE) {
    weights.set(OTHER, (weights.get(OTHER) ?? 0) + PERCENT - listed);
  }
  const positive = [...weights.entries()].filter(([, weight]) => weight > 0);
  const total = positive.reduce((sum, [, weight]) => sum + weight, 0);
  return positive.map(([bucket, weight]) => ({ bucket, share: weight / total }));
};

export const splitStock = (stock: StoredStock | undefined): MarketSplitPart[] => [
  {
    bucket: capToBucket(capBucketFor(EQUITY, stock?.marketCapCrore ?? null)),
    share: 1,
  },
];
