const PERCENT = 100;

type EquityHolding = { schemeCode: string; stockRef: string; weightPercent: number };

export const estimateFundPercents = (
  holdings: EquityHolding[],
  changeByRef: Map<string, number>,
  navDayByScheme: Map<string, string>,
  tradingDay: string,
): Record<string, number> => {
  const percents: Record<string, number> = {};
  for (const { schemeCode, stockRef, weightPercent } of holdings) {
    const change = changeByRef.get(stockRef);
    const navDay = navDayByScheme.get(schemeCode) ?? '';
    if (change !== undefined && navDay < tradingDay) {
      percents[schemeCode] = (percents[schemeCode] ?? 0) + (weightPercent * change) / PERCENT;
    }
  }
  return percents;
};
