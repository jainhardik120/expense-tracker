import { instrumentedFunction } from '@/lib/instrumentation';
import { isUnitBasedInvestment, normalizeInvestmentKind } from '@/lib/investments';

import { getFdValuation, getFdValuationAtDate } from './fd';
import { getInvestmentAmountInInr } from './fx';
import {
  buildInvestmentMarketDataContext,
  getUnitInstrumentOneDayMetricsByKey,
} from './market-data';
import { createInstrumentKey, DAY_IN_MS, INR_CURRENCY, startOfDay, USD_CURRENCY } from './shared';
import {
  deriveUnits,
  getPercentageChange,
  getStockMarketFromInvestment,
  isRsuInvestment,
  parseOptionalNumber,
} from './utils';

import type { EnrichedInvestment, InvestmentMarketDataContext } from './models';
import type { InvestmentRow } from './types';

export const enrichInvestments = instrumentedFunction(
  'enrichInvestments',
  async ({
    investmentsList,
    marketDataContext,
    valuationDate,
  }: {
    investmentsList: InvestmentRow[];
    marketDataContext?: InvestmentMarketDataContext;
    valuationDate?: Date;
  }): Promise<EnrichedInvestment[]> => {
    const context =
      marketDataContext ??
      (await buildInvestmentMarketDataContext({
        investmentsList,
      }));
    const asOfDate =
      valuationDate === undefined ? startOfDay(new Date()) : startOfDay(valuationDate);
    const oneDayUnitMetricsByKey = getUnitInstrumentOneDayMetricsByKey({
      investmentsList,
      marketDataContext: context,
      asOfDate,
    });

    return investmentsList.map((investment) => {
      const normalizedKind = normalizeInvestmentKind(investment.investmentKind);
      const normalizedStockMarket = getStockMarketFromInvestment(investment);
      const isUsStock = normalizedKind === 'stocks' && normalizedStockMarket === 'US';
      const displayCurrency = isUsStock ? USD_CURRENCY : INR_CURRENCY;
      const instrumentCode = investment.instrumentCode?.trim() ?? '';
      const instrumentKey = createInstrumentKey(
        normalizedKind,
        instrumentCode,
        normalizedStockMarket,
      );
      const instrumentName =
        instrumentCode === ''
          ? null
          : (context.nameByInstrumentKey.get(instrumentKey) ?? instrumentCode);
      const amountInfo = getInvestmentAmountInInr({
        investmentAmountRaw: investment.investmentAmount,
        investmentDate: investment.investmentDate,
        normalizedKind,
        normalizedStockMarket,
        usdInrRate: context.usdInrRate,
        usdInrHistory: context.usdInrHistory,
      });
      const investedAmount = amountInfo.amountInr;
      const units = deriveUnits({
        units: investment.units,
      });
      const quote =
        instrumentCode === '' ? undefined : context.quoteByInstrumentKey.get(instrumentKey);
      const closedAmount = parseOptionalNumber(investment.amount);

      const valuationAmount = (() => {
        if (investment.isClosed) {
          return closedAmount;
        }
        if (quote !== undefined && units !== null) {
          return quote.unitPriceInr * units;
        }
        if (normalizedKind === 'fd') {
          return getFdValuation(investment);
        }
        return investedAmount;
      })();

      const pnl = valuationAmount === null ? null : valuationAmount - investedAmount;

      let dayChange: number | null = null;
      let dayChangeDisplay: number | null = null;
      let dayChangePercentage: number | null = null;
      if (investment.isClosed) {
        dayChange = 0;
        dayChangeDisplay = 0;
        dayChangePercentage = 0;
      } else if (normalizedKind === 'fd') {
        const currentValuation = getFdValuationAtDate(investment, asOfDate);
        const previousValuation = getFdValuationAtDate(
          investment,
          new Date(asOfDate.getTime() - DAY_IN_MS),
        );
        if (currentValuation !== null && previousValuation !== null) {
          dayChange = currentValuation - previousValuation;
          dayChangeDisplay = dayChange;
          dayChangePercentage = getPercentageChange(dayChange, previousValuation);
        }
      } else if (isUnitBasedInvestment(normalizedKind) && instrumentCode !== '') {
        const liveUnits = deriveUnits({
          units: investment.units,
        });
        const metrics = oneDayUnitMetricsByKey.get(instrumentKey);
        const currentUnitPrice = metrics?.currentUnitPriceInr;
        const previousUnitPrice = metrics?.previousUnitPriceInr;
        if (
          liveUnits !== null &&
          liveUnits > 0 &&
          currentUnitPrice !== undefined &&
          currentUnitPrice !== null &&
          previousUnitPrice !== undefined &&
          previousUnitPrice !== null
        ) {
          const unitPriceDelta = currentUnitPrice - previousUnitPrice;
          dayChange = unitPriceDelta * liveUnits;
          if (isUsStock) {
            const currentUnitPriceNative = metrics?.currentUnitPriceNative;
            const previousUnitPriceNative = metrics?.previousUnitPriceNative;
            if (
              currentUnitPriceNative !== null &&
              currentUnitPriceNative !== undefined &&
              previousUnitPriceNative !== null &&
              previousUnitPriceNative !== undefined
            ) {
              dayChangeDisplay = (currentUnitPriceNative - previousUnitPriceNative) * liveUnits;
              dayChangePercentage = getPercentageChange(
                dayChangeDisplay,
                liveUnits * previousUnitPriceNative,
              );
            } else {
              dayChangePercentage = getPercentageChange(dayChange, liveUnits * previousUnitPrice);
            }
          } else {
            dayChangeDisplay = dayChange;
            dayChangePercentage = getPercentageChange(dayChange, liveUnits * previousUnitPrice);
          }
        }
      }

      const currentFxRateToInr = investment.isClosed
        ? amountInfo.currentFxRateToInr
        : (quote?.fxRateToInr ?? amountInfo.currentFxRateToInr);

      const investedAmountDisplay =
        displayCurrency === USD_CURRENCY ? amountInfo.amountNative : amountInfo.amountInr;

      const liveUnitPriceDisplay = (() => {
        if (investment.isClosed) {
          return null;
        }
        if (displayCurrency === USD_CURRENCY) {
          return quote?.unitPriceNative ?? null;
        }
        return quote?.unitPriceInr ?? null;
      })();

      const valuationAmountDisplay = (() => {
        if (valuationAmount === null) {
          return null;
        }
        if (displayCurrency !== USD_CURRENCY) {
          return valuationAmount;
        }
        if (investment.isClosed) {
          if (currentFxRateToInr !== null && currentFxRateToInr > 0) {
            return valuationAmount / currentFxRateToInr;
          }
          return null;
        }
        if (quote !== undefined && units !== null) {
          return quote.unitPriceNative * units;
        }
        return amountInfo.amountNative;
      })();

      const pnlDisplay =
        valuationAmountDisplay === null ? null : valuationAmountDisplay - investedAmountDisplay;
      const pnlPercentageDisplay =
        pnlDisplay === null ? null : getPercentageChange(pnlDisplay, investedAmountDisplay);

      const effectiveDayChangeDisplay =
        dayChangeDisplay ??
        (displayCurrency === USD_CURRENCY && dayChange !== null && currentFxRateToInr !== null
          ? dayChange / currentFxRateToInr
          : dayChange);

      let currentValueInrAtCurrentFx: number | null = null;
      if (valuationAmountDisplay !== null) {
        if (displayCurrency !== USD_CURRENCY) {
          currentValueInrAtCurrentFx = valuationAmountDisplay;
        } else if (currentFxRateToInr !== null) {
          currentValueInrAtCurrentFx = valuationAmountDisplay * currentFxRateToInr;
        }
      }

      return {
        ...investment,
        normalizedKind,
        normalizedStockMarket,
        displayCurrency,
        isRsuPosition: isRsuInvestment(investment),
        investedAmountInr: amountInfo.amountInr,
        investedAmountNative: amountInfo.amountNative,
        investedAmountCurrency: amountInfo.currency,
        investedAmountFxRateToInr: amountInfo.purchaseFxRateToInr,
        currentFxRateToInr: amountInfo.currentFxRateToInr,
        investedAmountInrAtCurrentFx: amountInfo.amountInrAtCurrentFx,
        investedAmountDisplay,
        instrumentName,
        isClosedPosition: investment.isClosed,
        liveUnitPrice: investment.isClosed ? null : (quote?.unitPriceInr ?? null),
        liveUnitPriceNative: investment.isClosed ? null : (quote?.unitPriceNative ?? null),
        liveUnitPriceCurrency: investment.isClosed ? null : (quote?.nativeCurrency ?? null),
        liveFxRateToInr: investment.isClosed ? null : (quote?.fxRateToInr ?? null),
        liveUnitPriceDisplay,
        valuationAmount,
        valuationAmountDisplay,
        currentValueInrAtCurrentFx,
        pnl,
        pnlDisplay,
        pnlPercentage: pnlPercentageDisplay,
        dayChange,
        dayChangeDisplay: effectiveDayChangeDisplay,
        dayChangePercentage: effectiveDayChangeDisplay === null ? null : dayChangePercentage,
        valuationSource: investment.isClosed ? 'closed' : (quote?.source ?? null),
        valuationDate: investment.isClosed ? investment.closedAt : (quote?.asOf ?? null),
      };
    });
  },
);
