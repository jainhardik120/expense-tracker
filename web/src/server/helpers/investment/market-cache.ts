import { and, gte, inArray, lte, sql } from 'drizzle-orm';

import { marketInstruments, marketPrices } from '@/db/schema';
import { db } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { MS_PER_HOUR } from '@/types';

import { DAY_IN_MS, splitIntoChunks, startOfDay } from './shared';

import type { PriceHistoryPoint, Quote } from './types';

const NAME_TTL_DAYS = 30;
const NAME_TTL_MS = NAME_TTL_DAYS * DAY_IN_MS;
const MISSING_NAME_RETRY_MS = DAY_IN_MS;
const HISTORY_TAIL_RECHECK_MS = MS_PER_HOUR;
const MIN_DAYS_FOR_EMPTY_FAILURE = 7;
const UPSERT_CHUNK = 2000;
const HISTORY_CONCURRENCY = 4;
const DAY_KEY_LENGTH = 10;

type StoredQuote = Omit<Quote, 'asOf'> & { asOf: string | null };

export type QuoteRequest = { key: string; ttlMs: number };

export type HistoryRequest = { key: string; start: Date; end: Date };

const dayKey = (date: Date) => startOfDay(date).toISOString().slice(0, DAY_KEY_LENGTH);

const dayDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

const minDay = (left: string, right: string) => (left < right ? left : right);

const maxDay = (left: string, right: string) => (left > right ? left : right);

export type InstrumentRow = typeof marketInstruments.$inferSelect;

export const loadInstrumentRows = async (keys: string[]): Promise<Map<string, InstrumentRow>> => {
  const unique = [...new Set(keys)];
  const rows =
    unique.length === 0
      ? []
      : await db
          .select()
          .from(marketInstruments)
          .where(inArray(marketInstruments.instrumentKey, unique));
  return new Map(rows.map((row) => [row.instrumentKey, row]));
};

const rowsFor = async (keys: string[], preloaded?: Map<string, InstrumentRow>) =>
  preloaded ?? loadInstrumentRows(keys);

type InstrumentColumns =
  | 'name'
  | 'nameFetchedAt'
  | 'quote'
  | 'quoteFetchedAt'
  | 'historyStart'
  | 'historyEnd'
  | 'historySyncedAt';

const COLUMN_NAMES: Record<InstrumentColumns, string> = {
  name: 'name',
  nameFetchedAt: 'name_fetched_at',
  quote: 'quote',
  quoteFetchedAt: 'quote_fetched_at',
  historyStart: 'history_start',
  historyEnd: 'history_end',
  historySyncedAt: 'history_synced_at',
};

const upsertInstruments = async <C extends InstrumentColumns>(
  columns: C[],
  rows: Array<{ instrumentKey: string } & Pick<typeof marketInstruments.$inferInsert, C>>,
) => {
  if (rows.length === 0) {
    return;
  }
  const set = Object.fromEntries(
    columns.map((column) => [column, sql.raw(`excluded.${COLUMN_NAMES[column]}`)]),
  );
  await db
    .insert(marketInstruments)
    .values(rows)
    .onConflictDoUpdate({ target: marketInstruments.instrumentKey, set });
};

const runPool = async <T>(items: T[], limit: number, task: (item: T) => Promise<void>) => {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        await task(item);
      }
    }),
  );
};

const toStored = (quote: Quote): StoredQuote => ({
  ...quote,
  asOf: quote.asOf === null ? null : quote.asOf.toISOString(),
});

const fromStored = (stored: StoredQuote): Quote => ({
  ...stored,
  asOf: stored.asOf === null ? null : new Date(stored.asOf),
});

export const storedQuote = (row: InstrumentRow | undefined): Quote | null =>
  row?.quote === null || row?.quote === undefined ? null : fromStored(row.quote as StoredQuote);

export const cachedNames = instrumentedFunction(
  'cachedNames',
  async (
    keys: string[],
    fetchNames: (keys: string[]) => Promise<Map<string, string>>,
    preloaded?: Map<string, InstrumentRow>,
  ): Promise<Map<string, string>> => {
    const now = Date.now();
    const rowByKey = await rowsFor(keys, preloaded);
    const names = new Map<string, string>();
    const stale: string[] = [];
    for (const key of keys) {
      const row = rowByKey.get(key);
      if (row?.name !== null && row?.name !== undefined) {
        names.set(key, row.name);
      }
      const fetchedAt = row?.nameFetchedAt ?? null;
      const ttl =
        row?.name === null || row?.name === undefined ? MISSING_NAME_RETRY_MS : NAME_TTL_MS;
      if (fetchedAt === null || now - fetchedAt.getTime() > ttl) {
        stale.push(key);
      }
    }
    if (stale.length > 0) {
      const fetched = await fetchNames(stale);
      for (const [key, name] of fetched) {
        names.set(key, name);
      }
      await upsertInstruments(
        ['name', 'nameFetchedAt'],
        stale.map((instrumentKey) => ({
          instrumentKey,
          name: fetched.get(instrumentKey) ?? names.get(instrumentKey) ?? null,
          nameFetchedAt: new Date(now),
        })),
      );
    }
    return names;
  },
);

export const cachedQuotes = instrumentedFunction(
  'cachedQuotes',
  async (
    requests: QuoteRequest[],
    fetchQuotes: (keys: string[]) => Promise<Map<string, Quote>>,
    preloaded?: Map<string, InstrumentRow>,
  ): Promise<Map<string, Quote>> => {
    const now = Date.now();
    const rowByKey = await rowsFor(
      requests.map((request) => request.key),
      preloaded,
    );
    const quotes = new Map<string, Quote>();
    const stale: string[] = [];
    for (const request of requests) {
      const row = rowByKey.get(request.key);
      if (row?.quote !== null && row?.quote !== undefined) {
        quotes.set(request.key, fromStored(row.quote as StoredQuote));
      }
      if (
        row?.quoteFetchedAt === null ||
        row?.quoteFetchedAt === undefined ||
        now - row.quoteFetchedAt.getTime() > request.ttlMs
      ) {
        stale.push(request.key);
      }
    }
    if (stale.length > 0) {
      const fetched = await fetchQuotes(stale);
      for (const [key, quote] of fetched) {
        quotes.set(key, quote);
      }
      await upsertInstruments(
        ['quote', 'quoteFetchedAt'],
        stale.flatMap((instrumentKey) => {
          const quote = quotes.get(instrumentKey);
          return quote === undefined
            ? []
            : [{ instrumentKey, quote: toStored(quote), quoteFetchedAt: new Date(now) }];
        }),
      );
      await upsertInstruments(
        ['quoteFetchedAt'],
        stale
          .filter((instrumentKey) => !quotes.has(instrumentKey))
          .map((instrumentKey) => ({ instrumentKey, quoteFetchedAt: new Date(now) })),
      );
    }
    return quotes;
  },
);

export const readStoredPrices = instrumentedFunction(
  'readStoredPrices',
  async (keys: string[], start: Date): Promise<Map<string, PriceHistoryPoint[]>> => {
    const histories = new Map<string, PriceHistoryPoint[]>();
    if (keys.length === 0) {
      return histories;
    }
    const rows = await db
      .select()
      .from(marketPrices)
      .where(and(inArray(marketPrices.instrumentKey, keys), gte(marketPrices.day, dayKey(start))))
      .orderBy(marketPrices.day);
    for (const row of rows) {
      const points = histories.get(row.instrumentKey) ?? [];
      points.push({ date: dayDate(row.day), price: Number.parseFloat(row.price) });
      histories.set(row.instrumentKey, points);
    }
    return histories;
  },
);

const storePrices = async (key: string, points: PriceHistoryPoint[]) => {
  const byDay = new Map<string, number>();
  for (const point of points) {
    if (Number.isFinite(point.price) && point.price > 0) {
      byDay.set(dayKey(point.date), point.price);
    }
  }
  const rows = [...byDay.entries()].map(([day, price]) => ({
    instrumentKey: key,
    day,
    price: price.toString(),
  }));
  for (const chunk of splitIntoChunks(rows, UPSERT_CHUNK)) {
    await db
      .insert(marketPrices)
      .values(chunk)
      .onConflictDoUpdate({
        target: [marketPrices.instrumentKey, marketPrices.day],
        set: { price: sql`excluded.price` },
      });
  }
};

const spanDays = (start: string, end: string) =>
  Math.round((dayDate(end).getTime() - dayDate(start).getTime()) / DAY_IN_MS);

export const nextCoveredEnd = (
  coveredEnd: string | null,
  settledEnd: string,
  points: PriceHistoryPoint[],
) => {
  const received = points.map(({ date }) => dayKey(date)).reduce(maxDay, '');
  if (received === '') {
    return coveredEnd ?? settledEnd;
  }
  const reached = minDay(settledEnd, received);
  return coveredEnd === null ? reached : maxDay(coveredEnd, reached);
};

export const cachedHistories = instrumentedFunction(
  'cachedHistories',
  async (
    rawRequests: HistoryRequest[],
    fetchHistory: (key: string, start: Date, end: Date) => Promise<PriceHistoryPoint[]>,
    preloaded?: Map<string, InstrumentRow>,
  ): Promise<Map<string, PriceHistoryPoint[]>> => {
    const histories = new Map<string, PriceHistoryPoint[]>();
    const merged = new Map<string, HistoryRequest>();
    for (const request of rawRequests) {
      const existing = merged.get(request.key);
      merged.set(
        request.key,
        existing === undefined
          ? request
          : {
              key: request.key,
              start: request.start < existing.start ? request.start : existing.start,
              end: request.end > existing.end ? request.end : existing.end,
            },
      );
    }
    const requests = [...merged.values()];
    if (requests.length === 0) {
      return histories;
    }
    const now = Date.now();
    const yesterday = dayKey(new Date(now - DAY_IN_MS));
    const rowByKey = await rowsFor(
      requests.map((request) => request.key),
      preloaded,
    );

    const coverage: Array<{
      instrumentKey: string;
      historyStart: string | null;
      historyEnd: string | null;
      historySyncedAt: Date;
    }> = [];
    await runPool(requests, HISTORY_CONCURRENCY, async (request) => {
      const start = dayKey(request.start);
      const end = dayKey(request.end);
      const settledEnd = minDay(end, yesterday);
      const row = rowByKey.get(request.key);
      const gaps: Array<[string, string]> = [];
      if (
        row?.historyStart === null ||
        row?.historyStart === undefined ||
        row.historyEnd === null
      ) {
        gaps.push([start, end]);
      } else {
        if (start < row.historyStart) {
          gaps.push([start, row.historyStart]);
        }
        const tailChecked =
          row.historySyncedAt !== null &&
          now - row.historySyncedAt.getTime() < HISTORY_TAIL_RECHECK_MS;
        if (row.historyEnd < settledEnd && !tailChecked) {
          gaps.push([row.historyEnd, end]);
        }
      }
      if (gaps.length === 0) {
        return;
      }
      let coveredStart = row?.historyStart ?? null;
      let coveredEnd = row?.historyEnd ?? null;
      for (const [gapStart, gapEnd] of gaps) {
        const points = await fetchHistory(request.key, dayDate(gapStart), dayDate(gapEnd));
        if (points.length === 0 && spanDays(gapStart, gapEnd) >= MIN_DAYS_FOR_EMPTY_FAILURE) {
          continue;
        }
        await storePrices(request.key, points);
        coveredStart = coveredStart === null ? gapStart : minDay(coveredStart, gapStart);
        coveredEnd = nextCoveredEnd(coveredEnd, minDay(gapEnd, settledEnd), points);
      }
      coverage.push({
        instrumentKey: request.key,
        historyStart: coveredStart,
        historyEnd: coveredEnd,
        historySyncedAt: new Date(now),
      });
    });
    await upsertInstruments(['historyStart', 'historyEnd', 'historySyncedAt'], coverage);

    const keys = requests.map((request) => request.key);
    const from = requests.reduce(
      (earliest, request) => minDay(earliest, dayKey(request.start)),
      '9999-12-31',
    );
    const to = requests.reduce(
      (latest, request) => maxDay(latest, dayKey(request.end)),
      '0000-01-01',
    );
    const priceRows = await db
      .select()
      .from(marketPrices)
      .where(
        and(
          inArray(marketPrices.instrumentKey, keys),
          gte(marketPrices.day, from),
          lte(marketPrices.day, to),
        ),
      )
      .orderBy(marketPrices.day);
    for (const request of requests) {
      const start = dayKey(request.start);
      const end = dayKey(request.end);
      histories.set(
        request.key,
        priceRows
          .filter((row) => row.instrumentKey === request.key && row.day >= start && row.day <= end)
          .map((row) => ({ date: dayDate(row.day), price: Number.parseFloat(row.price) })),
      );
    }
    return histories;
  },
);
