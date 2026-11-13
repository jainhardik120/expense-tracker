import { TRPCError } from '@trpc/server';
import { subDays } from 'date-fns';
import { and, asc, eq, inArray, max, sum } from 'drizzle-orm';

import { investments, rsuVests } from '@/db/schema';
import type { Database } from '@/lib/db';
import { normalizeStockMarket } from '@/lib/investments';

import { loadInstrumentRows, readStoredPrices, storedQuote } from './market-cache';
import { createInstrumentKey, startOfDay } from './shared';
import { isRsuInvestment, parseOptionalNumber } from './utils';

import type { InvestmentRow } from './types';

const FX_KEY = 'fx:USDINR';
const PRICE_LOOKBACK_DAYS = 7;
const PRICE_DECIMALS = 4;
const AMOUNT_DECIMALS = 2;

type Executor = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

const toNumber = (value: string | null) => parseOptionalNumber(value) ?? 0;

const dayToVestDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

const grantInstrumentKey = (grant: typeof investments.$inferSelect) =>
  createInstrumentKey(
    'stocks',
    grant.instrumentCode ?? '',
    normalizeStockMarket(grant.stockMarket),
  );

const priceOnOrBefore = (points: { date: Date; price: number }[] | undefined, date: Date) => {
  const target = startOfDay(date).getTime();
  return points?.findLast((point) => startOfDay(point.date).getTime() <= target)?.price ?? null;
};

const loadReleasedByGrant = async (db: Executor, grantIds: string[]) => {
  if (grantIds.length === 0) {
    return new Map<string, { units: number; lastVestDate: Date | null }>();
  }
  const rows = await db
    .select({
      grantId: rsuVests.grantId,
      units: sum(rsuVests.units),
      lastVestDate: max(rsuVests.vestDate),
    })
    .from(rsuVests)
    .where(and(inArray(rsuVests.grantId, grantIds), eq(rsuVests.isReleased, true)))
    .groupBy(rsuVests.grantId);
  return new Map(
    rows.map((row) => [
      row.grantId,
      { units: toNumber(row.units), lastVestDate: row.lastVestDate },
    ]),
  );
};

export const withRsuVesting = async <Row extends InvestmentRow>(
  db: Database,
  rows: Row[],
): Promise<Row[]> => {
  const grantIds = rows.filter(isRsuInvestment).map((row) => row.id);
  if (grantIds.length === 0) {
    return rows;
  }
  const releasedByGrant = await loadReleasedByGrant(db, grantIds);
  return rows.map((row) => {
    const released = releasedByGrant.get(row.id);
    if (!isRsuInvestment(row) || released === undefined) {
      return row;
    }
    const grantedUnits = toNumber(row.units);
    const unvestedUnits = Math.max(round(grantedUnits - released.units, PRICE_DECIMALS), 0);
    const unvestedAmount =
      grantedUnits === 0
        ? 0
        : round((toNumber(row.investmentAmount) * unvestedUnits) / grantedUnits, AMOUNT_DECIMALS);
    const fullyVested = unvestedUnits === 0;
    return {
      ...row,
      units: unvestedUnits.toString(),
      investmentAmount: unvestedAmount.toString(),
      isClosed: row.isClosed || fullyVested,
      closedAt: row.closedAt ?? (fullyVested ? released.lastVestDate : null),
      rsuGrant: { units: row.units, investmentAmount: row.investmentAmount },
    };
  });
};

const loadGrants = (db: Executor, userId: string) =>
  db
    .select()
    .from(investments)
    .where(
      and(
        eq(investments.userId, userId),
        eq(investments.investmentKind, 'stocks'),
        eq(investments.isRsu, true),
      ),
    )
    .orderBy(asc(investments.investmentDate));

const suggestReleasePrices = async (
  grants: (typeof investments.$inferSelect)[],
  dueVests: (typeof rsuVests.$inferSelect)[],
) => {
  const suggestions = new Map<string, { unitPrice: number | null; fxRateToInr: number | null }>();
  if (dueVests.length === 0) {
    return suggestions;
  }
  const earliest = Math.min(...dueVests.map((vest) => vest.vestDate.getTime()));
  const keyByGrant = new Map(grants.map((grant) => [grant.id, grantInstrumentKey(grant)]));
  const history = await readStoredPrices(
    [...new Set([...keyByGrant.values(), FX_KEY])],
    subDays(new Date(earliest), PRICE_LOOKBACK_DAYS),
  );
  const fxHistory = history.get(FX_KEY);
  for (const vest of dueVests) {
    const key = keyByGrant.get(vest.grantId);
    const fx = priceOnOrBefore(fxHistory, vest.vestDate);
    const priceInr = key === undefined ? null : priceOnOrBefore(history.get(key), vest.vestDate);
    suggestions.set(vest.id, {
      unitPrice: priceInr === null || fx === null ? null : round(priceInr / fx, PRICE_DECIMALS),
      fxRateToInr: fx === null ? null : round(fx, PRICE_DECIMALS),
    });
  }
  return suggestions;
};

const describeVest = (vest: typeof rsuVests.$inferSelect) => {
  const units = toNumber(vest.units);
  const unitPrice = parseOptionalNumber(vest.unitPrice);
  const fxRateToInr = parseOptionalNumber(vest.fxRateToInr);
  const unitsWithheld = parseOptionalNumber(vest.unitsWithheld);
  const valueInr =
    unitPrice === null || fxRateToInr === null ? null : units * unitPrice * fxRateToInr;
  const withheldInr =
    unitPrice === null || fxRateToInr === null || unitsWithheld === null
      ? null
      : unitsWithheld * unitPrice * fxRateToInr;
  return {
    id: vest.id,
    vestDate: vest.vestDate,
    units,
    isReleased: vest.isReleased,
    unitPrice,
    fxRateToInr,
    unitsWithheld,
    unitsReleased: unitsWithheld === null ? null : units - unitsWithheld,
    releasedInvestmentId: vest.releasedInvestmentId,
    perquisiteInr: valueInr,
    taxWithheldInr: withheldInr,
  };
};

export const getRsuSummary = async (db: Database, userId: string, asOf = new Date()) => {
  const grants = await loadGrants(db, userId);
  if (grants.length === 0) {
    return { grants: [] };
  }
  const [vests, instrumentRows] = await Promise.all([
    db.select().from(rsuVests).where(eq(rsuVests.userId, userId)).orderBy(asc(rsuVests.vestDate)),
    loadInstrumentRows(grants.map(grantInstrumentKey)),
  ]);
  const today = startOfDay(asOf).getTime();
  const dueVests = vests.filter(
    (vest) => !vest.isReleased && startOfDay(vest.vestDate).getTime() <= today,
  );
  const suggestions = await suggestReleasePrices(grants, dueVests);
  return {
    grants: grants.map((grant) => {
      const quote = storedQuote(instrumentRows.get(grantInstrumentKey(grant)));
      const grantVests = vests.filter((vest) => vest.grantId === grant.id);
      const totalUnits = toNumber(grant.units);
      const scheduledUnits = grantVests.reduce((total, vest) => total + toNumber(vest.units), 0);
      const releasedUnits = grantVests
        .filter((vest) => vest.isReleased)
        .reduce((total, vest) => total + toNumber(vest.units), 0);
      return {
        id: grant.id,
        instrumentCode: grant.instrumentCode ?? '',
        stockMarket: normalizeStockMarket(grant.stockMarket),
        grantDate: grant.investmentDate,
        unvestedUnits: round(totalUnits - releasedUnits, PRICE_DECIMALS),
        vestedUnits: releasedUnits,
        totalUnits,
        unscheduledUnits: round(totalUnits - scheduledUnits, PRICE_DECIMALS),
        livePrice: quote?.unitPriceNative ?? null,
        liveFxRateToInr: quote?.fxRateToInr ?? null,
        vests: grantVests.map((vest) => ({
          ...describeVest(vest),
          isDue: !vest.isReleased && startOfDay(vest.vestDate).getTime() <= today,
          suggested: suggestions.get(vest.id) ?? null,
        })),
      };
    }),
  };
};

const loadOwnedGrant = async (db: Executor, userId: string, grantId: string) => {
  const rows = await db
    .select()
    .from(investments)
    .where(
      and(eq(investments.id, grantId), eq(investments.userId, userId), eq(investments.isRsu, true)),
    );
  const grant = rows.at(0);
  if (grant === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'RSU grant not found' });
  }
  return grant;
};

const loadOwnedVest = async (db: Executor, userId: string, vestId: string) => {
  const rows = await db
    .select()
    .from(rsuVests)
    .where(and(eq(rsuVests.id, vestId), eq(rsuVests.userId, userId)))
    .for('update');
  const vest = rows.at(0);
  if (vest === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Vest not found' });
  }
  return vest;
};

export const addRsuVests = async (
  db: Database,
  userId: string,
  grantId: string,
  tranches: { vestDate: string; units: string }[],
) => {
  await loadOwnedGrant(db, userId, grantId);
  return db
    .insert(rsuVests)
    .values(
      tranches.map((tranche) => ({
        userId,
        grantId,
        vestDate: dayToVestDate(tranche.vestDate),
        units: tranche.units,
      })),
    )
    .returning({ id: rsuVests.id });
};

export const deleteRsuVest = async (db: Database, userId: string, vestId: string) => {
  const vest = await loadOwnedVest(db, userId, vestId);
  if (vest.isReleased) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Undo the release first' });
  }
  await db.delete(rsuVests).where(eq(rsuVests.id, vest.id));
  return { success: true };
};

const syncReleasedLot = async (
  tx: Executor,
  userId: string,
  vest: typeof rsuVests.$inferSelect,
  grant: typeof investments.$inferSelect,
  unitsReleased: number,
  unitPrice: number,
) => {
  const values = {
    investmentDate: vest.vestDate,
    investmentAmount: round(unitsReleased * unitPrice, AMOUNT_DECIMALS).toString(),
    units: unitsReleased.toString(),
  };
  if (vest.releasedInvestmentId === null) {
    if (unitsReleased <= 0) {
      return null;
    }
    const inserted = await tx
      .insert(investments)
      .values({
        userId,
        investmentKind: 'stocks',
        instrumentCode: grant.instrumentCode,
        stockMarket: grant.stockMarket,
        isRsu: false,
        ...values,
      })
      .returning({ id: investments.id });
    return inserted.at(0)?.id ?? null;
  }
  if (unitsReleased <= 0) {
    await tx
      .delete(investments)
      .where(and(eq(investments.id, vest.releasedInvestmentId), eq(investments.userId, userId)));
    return null;
  }
  await tx
    .update(investments)
    .set(values)
    .where(and(eq(investments.id, vest.releasedInvestmentId), eq(investments.userId, userId)));
  return vest.releasedInvestmentId;
};

export const releaseRsuVest = (
  db: Database,
  userId: string,
  input: { vestId: string; unitPrice: string; fxRateToInr: string; unitsWithheld: string },
) =>
  db.transaction(async (tx) => {
    const vest = await loadOwnedVest(tx, userId, input.vestId);
    if (vest.isReleased) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This vest is already released' });
    }
    const grant = await loadOwnedGrant(tx, userId, vest.grantId);
    const vestUnits = toNumber(vest.units);
    const releasedUnits = (await loadReleasedByGrant(tx, [grant.id])).get(grant.id)?.units ?? 0;
    const unvestedUnits = round(toNumber(grant.units) - releasedUnits, PRICE_DECIMALS);
    const unitsWithheld = Number(input.unitsWithheld);
    const unitPrice = Number(input.unitPrice);
    if (unitsWithheld < 0 || unitsWithheld > vestUnits) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Withheld units must be between 0 and the vested units',
      });
    }
    if (vestUnits > unvestedUnits) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `The grant has only ${unvestedUnits} unvested units left`,
      });
    }
    const unitsReleased = round(vestUnits - unitsWithheld, PRICE_DECIMALS);
    const releasedInvestmentId = await syncReleasedLot(
      tx,
      userId,
      vest,
      grant,
      unitsReleased,
      unitPrice,
    );
    await tx
      .update(rsuVests)
      .set({
        isReleased: true,
        unitPrice: input.unitPrice,
        fxRateToInr: input.fxRateToInr,
        unitsWithheld: input.unitsWithheld,
        releasedInvestmentId,
      })
      .where(eq(rsuVests.id, vest.id));
    return { releasedInvestmentId, unitsReleased };
  });

export const editRsuRelease = (
  db: Database,
  userId: string,
  input: { vestId: string; unitPrice: string; fxRateToInr: string; unitsWithheld: string },
) =>
  db.transaction(async (tx) => {
    const vest = await loadOwnedVest(tx, userId, input.vestId);
    if (!vest.isReleased) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This vest is not released yet' });
    }
    const grant = await loadOwnedGrant(tx, userId, vest.grantId);
    const vestUnits = toNumber(vest.units);
    const unitsWithheld = Number(input.unitsWithheld);
    if (unitsWithheld < 0 || unitsWithheld > vestUnits) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Withheld units must be between 0 and the vested units',
      });
    }
    const unitsReleased = round(vestUnits - unitsWithheld, PRICE_DECIMALS);
    const releasedInvestmentId = await syncReleasedLot(
      tx,
      userId,
      vest,
      grant,
      unitsReleased,
      Number(input.unitPrice),
    );
    await tx
      .update(rsuVests)
      .set({
        unitPrice: input.unitPrice,
        fxRateToInr: input.fxRateToInr,
        unitsWithheld: input.unitsWithheld,
        releasedInvestmentId,
      })
      .where(eq(rsuVests.id, vest.id));
    return { unitsReleased };
  });

export const editRsuVest = async (
  db: Database,
  userId: string,
  input: { vestId: string; vestDate: string; units: string },
) => {
  const vest = await loadOwnedVest(db, userId, input.vestId);
  if (vest.isReleased) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Undo the release to change its date or units',
    });
  }
  await db
    .update(rsuVests)
    .set({ vestDate: dayToVestDate(input.vestDate), units: input.units })
    .where(eq(rsuVests.id, vest.id));
  return { success: true };
};

export const assertNotRsuRelease = async (db: Database, userId: string, investmentId: string) => {
  const linked = await db
    .select({ id: rsuVests.id })
    .from(rsuVests)
    .where(and(eq(rsuVests.userId, userId), eq(rsuVests.releasedInvestmentId, investmentId)));
  if (linked.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'This holding comes from an RSU release. Change it from the RSU vesting card.',
    });
  }
};

export const undoRsuRelease = (db: Database, userId: string, vestId: string) =>
  db.transaction(async (tx) => {
    const vest = await loadOwnedVest(tx, userId, vestId);
    if (!vest.isReleased) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This vest is not released' });
    }
    await tx
      .update(rsuVests)
      .set({
        isReleased: false,
        unitPrice: null,
        fxRateToInr: null,
        unitsWithheld: null,
        releasedInvestmentId: null,
      })
      .where(eq(rsuVests.id, vest.id));
    if (vest.releasedInvestmentId !== null) {
      await tx
        .delete(investments)
        .where(and(eq(investments.id, vest.releasedInvestmentId), eq(investments.userId, userId)));
    }
    return { success: true };
  });
