import { MS_PER_MINUTE } from '@/types';

const SESSION_GAP_MINUTES = 15;
const PERCENT = 100;

export const SESSION_GAP_MS = SESSION_GAP_MINUTES * MS_PER_MINUTE;

export type SeriesPoint = { time: number; price: number };

const anchorRatio = (anchor: SeriesPoint, reference: SeriesPoint[]) => {
  const base = reference.findLast((point) => point.time <= anchor.time);
  return base === undefined || anchor.time - base.time > SESSION_GAP_MS || base.price <= 0
    ? null
    : anchor.price / base.price;
};

export const estimateClosedHours = (actual: SeriesPoint[], reference: SeriesPoint[]) => {
  const estimates: SeriesPoint[] = [];
  const latest = reference.at(-1)?.time ?? 0;
  let nextIndex = 0;
  let anchor: SeriesPoint | undefined;
  let ratio: number | null = null;
  for (const { time, price } of reference) {
    while ((actual.at(nextIndex)?.time ?? Number.POSITIVE_INFINITY) <= time) {
      nextIndex += 1;
    }
    const previous = nextIndex === 0 ? undefined : actual.at(nextIndex - 1);
    const reopensAt = actual.at(nextIndex)?.time ?? latest;
    if (
      previous !== undefined &&
      time > previous.time &&
      reopensAt - previous.time > SESSION_GAP_MS
    ) {
      if (previous !== anchor) {
        anchor = previous;
        ratio = anchorRatio(previous, reference);
        if (ratio !== null) {
          estimates.push(previous);
        }
      }
      if (ratio !== null) {
        estimates.push({ time, price: price * ratio });
      }
    }
  }
  return estimates;
};

export const mergeSeries = (actual: SeriesPoint[], estimates: SeriesPoint[]) => {
  const times = new Set(actual.map((point) => point.time));
  return [...actual, ...estimates.filter((point) => !times.has(point.time))].sort(
    (left, right) => left.time - right.time,
  );
};

export const latestEstimatePercent = (actual: SeriesPoint[], estimates: SeriesPoint[]) => {
  const close = actual.at(-1);
  const estimate = estimates.at(-1);
  return close === undefined ||
    estimate === undefined ||
    estimate.time <= close.time ||
    close.price <= 0
    ? null
    : (estimate.price / close.price - 1) * PERCENT;
};
