import {
  assetClassLabels,
  marketBucketValues,
  type AssetClassValue,
  type InvestmentKindValue,
  type MarketBucket,
} from '@/lib/investments';

const PERCENT = 100;
const MARKET = 'market';
const OTHER = 'Other';
const MARKET_KIND_LABELS: Partial<Record<InvestmentKindValue, string>> = {
  mutual_funds: 'Mutual funds',
  stocks: 'Stocks',
};

type AllocationEntry = {
  instrumentKey: string;
  kind: InvestmentKindValue;
  assetClass: AssetClassValue;
  investedAmount: number;
  valuationAmount: number;
  dayChange: number;
};

type AllocationSplit = {
  instrumentKey: string;
  parts: Array<{ bucket: MarketBucket; share: number }>;
};

type Figures = { invested: number; value: number; dayChange: number };

export type AllocationSlice = Figures & {
  key: string;
  colorKey: string;
  label: string;
  share: number;
};

export type AllocationGroup = AllocationSlice & {
  kinds: AllocationSlice[];
  buckets: AllocationSlice[];
};

const addShare = (figures: Figures, entry: AllocationEntry, share: number) => {
  figures.invested += entry.investedAmount * share;
  figures.value += entry.valuationAmount * share;
  figures.dayChange += entry.dayChange * share;
};

const collect = <K>(totals: Map<K, Figures>, key: K, entry: AllocationEntry, share: number) => {
  const figures = totals.get(key) ?? { invested: 0, value: 0, dayChange: 0 };
  addShare(figures, entry, share);
  totals.set(key, figures);
};

const byValue = (left: AllocationSlice, right: AllocationSlice) => right.value - left.value;

export const buildAllocation = (
  entries: AllocationEntry[],
  splits: AllocationSplit[] | undefined,
): AllocationGroup[] => {
  const groups = new Map<AssetClassValue, Figures>();
  const kinds = new Map<InvestmentKindValue, Figures>();
  const buckets = new Map<MarketBucket, Figures>();
  const partsByInstrument = new Map(splits?.map((split) => [split.instrumentKey, split.parts]));
  for (const entry of entries) {
    collect(groups, entry.assetClass, entry, 1);
    if (entry.assetClass === MARKET) {
      collect(kinds, entry.kind, entry, 1);
      const parts = partsByInstrument.get(entry.instrumentKey) ?? [{ bucket: OTHER, share: 1 }];
      for (const part of parts) {
        collect(buckets, part.bucket, entry, part.share);
      }
    }
  }
  const total = [...groups.values()].reduce((sum, group) => sum + group.value, 0);
  const shareOf = (value: number) => (total === 0 ? 0 : (value / total) * PERCENT);
  const kindSlices = [...kinds.entries()]
    .filter(([, figures]) => figures.value > 0)
    .map(([kind, figures]) => ({
      ...figures,
      key: `${MARKET}:${kind}`,
      colorKey: kind,
      label: MARKET_KIND_LABELS[kind] ?? kind,
      share: shareOf(figures.value),
    }))
    .toSorted(byValue);
  const bucketSlices =
    splits === undefined
      ? []
      : marketBucketValues.flatMap((bucket) => {
          const figures = buckets.get(bucket);
          return figures === undefined || figures.value <= 0
            ? []
            : [
                {
                  ...figures,
                  key: `${MARKET}:${bucket}`,
                  colorKey: bucket,
                  label: bucket,
                  share: shareOf(figures.value),
                },
              ];
        });
  return [...groups.entries()]
    .filter(([, figures]) => figures.value > 0)
    .map(([assetClass, figures]) => ({
      ...figures,
      key: assetClass,
      colorKey: assetClass,
      label: assetClassLabels[assetClass],
      share: shareOf(figures.value),
      kinds: assetClass === MARKET ? kindSlices : [],
      buckets: assetClass === MARKET ? bucketSlices : [],
    }))
    .toSorted(byValue);
};

export const expandRing = <T extends AllocationSlice>(
  groups: Array<T & { kinds: T[]; buckets: T[] }>,
  level: 'kinds' | 'buckets',
): T[] => groups.flatMap((group) => (group[level].length === 0 ? [group] : group[level]));
