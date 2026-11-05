import { describe, expect, it } from 'vitest';

import { MS_PER_MINUTE } from '@/types';

import { estimateClosedHours, latestEstimatePercent, mergeSeries } from './metal-estimates';

const at = (minute: number, price: number) => ({ time: minute * MS_PER_MINUTE, price });

describe('estimateClosedHours', () => {
  it('follows the reference from the last traded price once the market closes', () => {
    const actual = [at(0, 200), at(5, 210)];
    const reference = [at(0, 100), at(5, 100), at(30, 110), at(35, 120)];

    expect(estimateClosedHours(actual, reference)).toEqual([at(5, 210), at(30, 231), at(35, 252)]);
  });

  it('keeps the premium when the market reopens and closes again', () => {
    const actual = [at(0, 200), at(60, 300)];
    const reference = [at(0, 100), at(30, 150), at(60, 100), at(90, 200)];

    expect(estimateClosedHours(actual, reference)).toEqual([
      at(0, 200),
      at(30, 300),
      at(60, 300),
      at(90, 600),
    ]);
  });

  it('adds nothing while the market is trading', () => {
    const actual = [at(0, 200), at(5, 201), at(10, 202)];
    const reference = [at(0, 100), at(5, 100), at(10, 100), at(15, 100)];

    expect(estimateClosedHours(actual, reference)).toEqual([]);
  });

  it('adds nothing without a reference near the last traded price', () => {
    const actual = [at(0, 200)];
    const reference = [at(60, 100), at(65, 110)];

    expect(estimateClosedHours(actual, reference)).toEqual([]);
  });
});

describe('mergeSeries', () => {
  it('prefers actual prices and sorts by time', () => {
    expect(mergeSeries([at(5, 1)], [at(10, 3), at(5, 2), at(0, 4)])).toEqual([
      at(0, 4),
      at(5, 1),
      at(10, 3),
    ]);
  });
});

it('reports the move since the last trade while the market is shut', () => {
  const actual = [{ time: 100, price: 200 }];
  const estimates = [
    { time: 100, price: 200 },
    { time: 500, price: 203 },
  ];
  expect(latestEstimatePercent(actual, estimates)).toBeCloseTo(1.5);
});

it('reports nothing once the market has traded past the estimate', () => {
  const actual = [{ time: 600, price: 200 }];
  expect(latestEstimatePercent(actual, [{ time: 500, price: 203 }])).toBeNull();
  expect(latestEstimatePercent(actual, [])).toBeNull();
});
