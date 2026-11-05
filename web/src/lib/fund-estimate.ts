const PERCENT = 100;
const MUTUAL_FUNDS = 'mutual_funds';

type FundRow = { kind: string; code: string; openPositions: number; valuationAmountInr: number };

export const estimateFundsToday = (rows: FundRow[], percents: Record<string, number>) => {
  const moves = new Map(Object.entries(percents));
  const estimated = rows.filter(
    (row) => row.kind === MUTUAL_FUNDS && row.openPositions > 0 && moves.has(row.code),
  );
  return estimated.length === 0
    ? null
    : estimated.reduce(
        (total, row) => total + (row.valuationAmountInr * (moves.get(row.code) ?? 0)) / PERCENT,
        0,
      );
};
