import { instrumentedFunction } from '@/lib/instrumentation';

const BASE_URL = 'https://groww.in/v1/api';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36',
  Accept: 'application/json',
};
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const IST_OFFSET_MINUTES = 330;
const DAYS_PER_MONTH = 30;
const MS_PER_DAY = 86_400_000;
const MINUTES_PER_DAY = 1440;

export type Exchange = 'NSE' | 'BSE';

export type GrowwSearchHit = {
  entity_type?: string;
  title?: string;
  search_id?: string;
  scheme_code?: string | null;
  nse_scrip_code?: string | null;
  bse_scrip_code?: string | null;
};

export type GrowwLivePoint = {
  ltp?: number | null;
  close?: number | null;
  dayChange?: number | null;
  dayChangePerc?: number | null;
  tsInMillis?: number | null;
  lastTradeTime?: number | null;
};

export type DailyPoint = { date: Date; price: number };

const request = async <T>(path: string, init?: RequestInit): Promise<T | null> => {
  try {
    const response = await fetch(`${BASE_URL}/${path}`, {
      cache: 'no-store',
      ...init,
      headers: { ...HEADERS, ...init?.headers },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export const istDay = (epochMs: number): Date => {
  const shifted = new Date(epochMs + IST_OFFSET_MINUTES * MS_PER_MINUTE);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
};

export const growwSearch = instrumentedFunction(
  'growwSearch',
  async (query: string, entityType: 'scheme' | 'listed', size = 20) => {
    const response = await request<{ content?: GrowwSearchHit[] }>(
      `search/v1/entity?app=false&entity_type=${entityType === 'scheme' ? 'scheme' : ''}&page=0&size=${String(size)}&q=${encodeURIComponent(query)}`,
    );
    return response?.content ?? [];
  },
);

export const growwLatestPrices = instrumentedFunction(
  'growwLatestPrices',
  async (symbols: Record<Exchange, string[]>): Promise<Map<string, GrowwLivePoint> | null> => {
    if (symbols.NSE.length === 0 && symbols.BSE.length === 0) {
      return new Map();
    }
    const response = await request<{
      exchangeAggRespMap?: Partial<
        Record<Exchange, { priceLivePointsMap?: Record<string, GrowwLivePoint> }>
      >;
    }>('stocks_data/v1/tr_live/segment/CASH/latest_aggregated', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exchangeAggReqMap: {
          NSE: { priceSymbolList: symbols.NSE, indexSymbolList: [] },
          BSE: { priceSymbolList: symbols.BSE, indexSymbolList: [] },
        },
      }),
    });
    if (response === null) {
      return null;
    }
    const prices = new Map<string, GrowwLivePoint>();
    for (const exchange of ['NSE', 'BSE'] as const) {
      for (const [symbol, point] of Object.entries(
        response.exchangeAggRespMap?.[exchange]?.priceLivePointsMap ?? {},
      )) {
        prices.set(`${exchange}:${symbol}`, point);
      }
    }
    return prices;
  },
);

export const livePointTime = (point: GrowwLivePoint) => {
  const seconds = point.lastTradeTime ?? point.tsInMillis;
  return typeof seconds === 'number' ? new Date(seconds * MS_PER_SECOND) : null;
};

export const growwDailyCandles = instrumentedFunction(
  'growwDailyCandles',
  async (
    exchange: Exchange,
    symbol: string,
    start: Date,
    end: Date,
  ): Promise<DailyPoint[] | null> => {
    const response = await request<{ candles?: Array<Array<number | null>> }>(
      `charting_service/v2/chart/exchange/${exchange}/segment/CASH/${encodeURIComponent(symbol)}?intervalInMinutes=${String(MINUTES_PER_DAY)}&startTimeInMillis=${String(start.getTime())}&endTimeInMillis=${String(end.getTime() + MS_PER_DAY)}`,
    );
    if (response === null) {
      return null;
    }
    return (response.candles ?? []).flatMap(([time, , , , close]) =>
      typeof time === 'number' && typeof close === 'number' && close > 0
        ? [{ date: istDay(time * MS_PER_SECOND), price: close }]
        : [],
    );
  },
);

export const growwFundNav = instrumentedFunction(
  'growwFundNav',
  async (
    schemeCode: string,
    start: Date,
  ): Promise<{ name: string | null; points: DailyPoint[] } | null> => {
    const months = Math.max(
      1,
      Math.ceil((Date.now() - start.getTime()) / (MS_PER_DAY * DAYS_PER_MONTH)) + 1,
    );
    const response = await request<{
      folio?: { name?: string | null; data?: Array<[number, number]> };
    }>(
      `data/mf/web/v1/scheme/${encodeURIComponent(schemeCode)}/graph?benchmark=true&months=${String(months)}`,
    );
    if (response === null) {
      return null;
    }
    return {
      name: response.folio?.name ?? null,
      points: (response.folio?.data ?? []).flatMap(([time, nav]) =>
        typeof time === 'number' && typeof nav === 'number' && nav > 0
          ? [{ date: istDay(time), price: nav }]
          : [],
      ),
    };
  },
);
