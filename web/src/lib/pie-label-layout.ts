const DEGREES_PER_TURN = 360;
const START_DEGREES = 90;
const HALF_TURN_DEGREES = 180;
const HALF = 2;

type LayoutOptions = {
  cx: number;
  cy: number;
  radius: number;
  gap: number;
  rowHeight: number;
};

export type PieLabelPosition = {
  anchorX: number;
  anchorY: number;
  elbowX: number;
  elbowY: number;
  x: number;
  y: number;
  side: 'left' | 'right';
};

export const PIE_START_ANGLE = START_DEGREES;
export const PIE_END_ANGLE = START_DEGREES - DEGREES_PER_TURN;

const spreadRows = <T extends { y: number }>(
  rows: T[],
  top: number,
  bottom: number,
  height: number,
) => {
  const sorted = rows.toSorted((left, right) => left.y - right.y);
  let next = top;
  for (const row of sorted) {
    row.y = Math.max(row.y, next);
    next = row.y + height;
  }
  let limit = bottom;
  for (const row of sorted.toReversed()) {
    row.y = Math.min(row.y, limit);
    limit = row.y - height;
  }
};

export const layoutPieLabels = (
  values: number[],
  { cx, cy, radius, gap, rowHeight }: LayoutOptions,
): PieLabelPosition[] => {
  const total = values.reduce((sum, value) => sum + value, 0);
  const elbowRadius = radius + gap / HALF;
  let passed = 0;
  const positions = values.map((value): PieLabelPosition => {
    const middle = total === 0 ? 0 : (passed + value / HALF) / total;
    passed += value;
    const angle = ((START_DEGREES - middle * DEGREES_PER_TURN) * Math.PI) / HALF_TURN_DEGREES;
    const isRight = Math.cos(angle) >= 0;
    const elbowY = cy - elbowRadius * Math.sin(angle);
    return {
      anchorX: cx + radius * Math.cos(angle),
      anchorY: cy - radius * Math.sin(angle),
      elbowX: cx + elbowRadius * Math.cos(angle),
      elbowY,
      x: isRight ? cx + radius + gap : cx - radius - gap,
      y: elbowY,
      side: isRight ? 'right' : 'left',
    };
  });
  for (const side of ['left', 'right'] as const) {
    spreadRows(
      positions.filter((position) => position.side === side),
      rowHeight / HALF,
      cy * HALF - rowHeight / HALF,
      rowHeight,
    );
  }
  return positions;
};
