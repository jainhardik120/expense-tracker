import { expect, test } from 'vitest';

import { layoutPieLabels } from './pie-label-layout';

const options = { cx: 200, cy: 150, radius: 100, gap: 16, rowHeight: 26 };

const sortedRows = (values: number[], side: 'left' | 'right') =>
  layoutPieLabels(values, options)
    .filter((label) => label.side === side)
    .map((label) => label.y)
    .toSorted((left, right) => left - right);

test('puts labels in a column on the side of their slice', () => {
  const labels = layoutPieLabels([50, 50], options);
  expect(labels.at(0)).toMatchObject({ side: 'right', x: 316 });
  expect(labels.at(1)).toMatchObject({ side: 'left', x: 84 });
});

test('a sliver next to the top keeps its label in the column and its line on the slice', () => {
  const label = layoutPieLabels([99.7, 0.3], options).at(1);
  expect(label).toMatchObject({ side: 'left', x: 84 });
  expect(label?.anchorX).toBeCloseTo(199, 0);
  expect(label?.anchorY).toBeCloseTo(50, 0);
});

test('spreads labels of tiny neighbouring slices so none overlap', () => {
  const rows = sortedRows([40, 0.5, 0.5, 0.5, 0.5, 0.5, 57.5], 'right');
  rows.slice(1).forEach((y, index) => {
    expect(y - (rows.at(index) ?? 0)).toBeGreaterThanOrEqual(options.rowHeight - 0.001);
  });
});

test('keeps rows in slice order so leader lines do not cross', () => {
  const labels = layoutPieLabels([30, 1, 1, 1, 67], options).filter(
    (label) => label.side === 'right',
  );
  const rows = labels.map((label) => label.y);
  expect(rows).toEqual(rows.toSorted((left, right) => left - right));
});

test('keeps labels inside the chart height when a side is crowded', () => {
  const rows = sortedRows([40, 1, 1, 1, 1, 1, 1, 54], 'right');
  expect(rows.at(-1)).toBeLessThanOrEqual(options.cy * 2 - options.rowHeight / 2);
  expect(rows.at(0)).toBeGreaterThanOrEqual(options.rowHeight / 2);
});
