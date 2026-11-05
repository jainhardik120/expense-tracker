const PERCENT = 100;
const MAX_LOOKBACK_DAYS = 7;
const DAY_KEY_LENGTH = 10;
const MS_PER_DAY = 86_400_000;

export type MetalBuy = { code: string; day: string; units: number; amount: number };

const previousDays = (day: string) => {
  const start = new Date(`${day}T00:00:00.000Z`).getTime();
  return Array.from({ length: MAX_LOOKBACK_DAYS + 1 }, (_, offset) =>
    new Date(start - offset * MS_PER_DAY).toISOString().slice(0, DAY_KEY_LENGTH),
  );
};

const closeOn = (day: string, closes: Map<string, number>) => {
  for (const candidate of previousDays(day)) {
    const close = closes.get(candidate);
    if (close !== undefined) {
      return close;
    }
  }
  return null;
};

export const averageBuyPrices = (
  buys: MetalBuy[],
  conversions: Map<string, number | null>,
  mcxCloses: Map<string, number>,
) => {
  let amount = 0;
  let quantity = 0;
  let mcxValue = 0;
  let mcxQuantity = 0;
  for (const buy of buys) {
    const conversion = conversions.get(buy.code) ?? null;
    if (conversion !== null && conversion > 0) {
      const metalQuantity = buy.units / conversion;
      amount += buy.amount;
      quantity += metalQuantity;
      const close = closeOn(buy.day, mcxCloses);
      if (close !== null) {
        mcxValue += close * metalQuantity;
        mcxQuantity += metalQuantity;
      }
    }
  }
  return {
    etf: quantity === 0 ? null : amount / quantity,
    mcx: mcxQuantity === 0 ? null : mcxValue / mcxQuantity,
    mcxCoverage: quantity === 0 ? 0 : (mcxQuantity / quantity) * PERCENT,
  };
};
