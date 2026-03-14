import type { InvestmentKindValue, StockMarketValue } from '@/lib/investments';

import { CryptoInvestmentProvider } from './providers/crypto-investment-provider';
import { FixedDepositInvestmentProvider } from './providers/fixed-deposit-investment-provider';
import { MutualFundInvestmentProvider } from './providers/mutual-fund-investment-provider';
import {
  IndiaStockInvestmentProvider,
  UsStockInvestmentProvider,
} from './providers/stock-investment-provider';

import type { InvestmentInstrumentProvider } from './provider-interface';
import type { InstrumentIdentity, ProviderTarget } from './types';

class InvestmentInstrumentProviderRegistry {
  constructor(private readonly providers: InvestmentInstrumentProvider[]) {}

  getProvider(target: ProviderTarget): InvestmentInstrumentProvider | null {
    return this.providers.find((provider) => provider.matches(target)) ?? null;
  }

  getProviderForKind(
    kind: InvestmentKindValue,
    stockMarket: StockMarketValue | null,
  ): InvestmentInstrumentProvider | null {
    return this.getProvider({ kind, stockMarket });
  }

  groupInstrumentsByProvider(
    instruments: InstrumentIdentity[],
  ): Map<InvestmentInstrumentProvider, InstrumentIdentity[]> {
    const grouped = new Map<InvestmentInstrumentProvider, InstrumentIdentity[]>();

    for (const instrument of instruments) {
      const provider = this.getProvider(instrument);
      if (provider === null) {
        continue;
      }
      const existing = grouped.get(provider);
      if (existing === undefined) {
        grouped.set(provider, [instrument]);
        continue;
      }
      existing.push(instrument);
    }

    return grouped;
  }
}

export const investmentInstrumentProviderRegistry = new InvestmentInstrumentProviderRegistry([
  new IndiaStockInvestmentProvider(),
  new UsStockInvestmentProvider(),
  new MutualFundInvestmentProvider(),
  new CryptoInvestmentProvider(),
  new FixedDepositInvestmentProvider(),
]);
